import { Context, Effect, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SYSTEM_PROMPT } from '../app/Constant';
import { LLMProviderError, MessageNotFoundError, SessionNotFoundError } from '../app/Error';
import { AppRuntimeState, ChatMessage, ChatMetadata, ChatSession } from '../app/Schema';
import { getModelId } from '../helpers/ModelHelper';
import { getMessagePath } from '../helpers/SessionHelper';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { StorageService } from './StorageService';
import { StoreService } from './StoreService';

export interface ChatService {
  readonly createSession: () => Effect.Effect<ChatMetadata>;
  readonly deleteSession: (id: string) => Effect.Effect<void>;
  readonly addMessage: (sessionId: string, message: ChatMessage) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateMessage: (
    sessionId: string,
    messageId: string,
    content: string,
    isError?: boolean,
    skipUpdateTimestamp?: boolean,
  ) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly deleteMessage: (sessionId: string, messageId: string) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly renameSession: (sessionId: string, title: string) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateSession: (sessionId: string, f: (session: ChatMetadata, now: number) => ChatMetadata) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateSessionFull: (
    sessionId: string,
    f: (session: ChatSession, now: number) => ChatSession,
    skipUpdateTimestamp?: boolean,
  ) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateActiveSession: (f: (session: ChatSession, now: number) => ChatSession) => Effect.Effect<void, SessionNotFoundError>;
  readonly getSessionPath: (sessionId: string, messageId: string) => Effect.Effect<ReadonlyArray<ChatMessage>, SessionNotFoundError>;
  readonly branchChat: (sessionId: string, messageId: string) => Effect.Effect<ChatMetadata, SessionNotFoundError | MessageNotFoundError>;
  readonly generate: (sessionId: string, messagesToProcess: ReadonlyArray<ChatMessage>) => Effect.Effect<void>;
  readonly stop: (sessionId?: string) => Effect.Effect<void>;
}

export const ChatService = Context.GenericTag<ChatService>('@services/ChatService');

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const store = yield* StoreService;
    const storage = yield* StorageService;
    const llm = yield* LLMProvider;
    const fibers = new Map<string, Fiber.Fiber<void, SessionNotFoundError | MessageNotFoundError>>();

    const updateSessionState = (sessionId: string, f: (state: AppRuntimeState, now: number) => { state: AppRuntimeState; sessionFound: boolean }) =>
      Effect.gen(function* () {
        const now = Date.now();
        let found = false;
        yield* store.update((state) => {
          const result = f(state, now);
          found = result.sessionFound;
          return result.state;
        });

        if (!found) {
          yield* Effect.fail(new SessionNotFoundError({ sessionId }));
        } else {
          const s = yield* SubscriptionRef.get(store.state);
          const session = s.activeSessionId === sessionId && s.activeSession ? s.activeSession : s.sessions[sessionId];
          if (session) {
            // If it's a metadata, we might lose full data if we save it as session.
            // But ChatService operations always maintain consistency.
            yield* storage.saveSession(session);
          }
        }
      }).pipe(
        Effect.catchAll((err) => {
          if (err instanceof SessionNotFoundError) return Effect.fail(err);
          return Effect.gen(function* () {
            yield* store.notify('error', `Failed to update session: ${err}`);
            return yield* Effect.fail(err);
          });
        }),
      );

    const updateSession = (sessionId: string, f: (session: ChatMetadata, now: number) => ChatMetadata) =>
      updateSessionState(sessionId, (state, now) => {
        const session = state.sessions[sessionId];
        if (!session) return { state, sessionFound: false };
        const updated = { ...f(session, now), updatedAt: now };
        const nextState = {
          ...state,
          sessions: { ...state.sessions, [sessionId]: updated },
        };
        if (state.activeSessionId === sessionId && state.activeSession && state.activeSession.id === sessionId) {
          nextState.activeSession = { ...state.activeSession, ...updated };
        }
        return { state: nextState, sessionFound: true };
      });

    const updateActiveSession = (f: (session: ChatSession, now: number) => ChatSession) =>
      Effect.gen(function* () {
        const state = yield* SubscriptionRef.get(store.state);
        const activeId = state.activeSessionId;
        if (!activeId) return yield* Effect.fail(new SessionNotFoundError({ sessionId: 'active' }));
        return yield* updateSessionState(activeId, (s, now) => {
          if (!s.activeSession || s.activeSession.id !== activeId) return { state: s, sessionFound: false };
          const updated = { ...f(s.activeSession, now), updatedAt: now };
          return {
            state: {
              ...s,
              activeSession: updated,
              sessions: {
                ...s.sessions,
                [updated.id]: Schema.decodeSync(ChatMetadata)(updated),
              },
            },
            sessionFound: true,
          };
        });
      });

    const updateSessionFull = (sessionId: string, f: (session: ChatSession, now: number) => ChatSession, skipUpdateTimestamp = false) =>
      Effect.gen(function* () {
        const state = yield* SubscriptionRef.get(store.state);
        const isActive = state.activeSessionId === sessionId && state.activeSession;

        if (isActive) {
          return yield* updateActiveSession((session, now) => {
            const updated = f(session, now);
            return skipUpdateTimestamp ? updated : { ...updated, updatedAt: now };
          });
        }

        const session = yield* storage.getSession(sessionId);
        if (!session) return yield* Effect.fail(new SessionNotFoundError({ sessionId }));
        const now = Date.now();
        const updated = f(session, now);
        const finalUpdated = skipUpdateTimestamp ? updated : { ...updated, updatedAt: now };

        yield* storage.saveSession(finalUpdated);
        return yield* updateSession(sessionId, () => Schema.decodeSync(ChatMetadata)(finalUpdated));
      });

    const stop = (sessionId?: string) =>
      Effect.gen(function* () {
        if (sessionId) {
          const fiber = fibers.get(sessionId);
          if (fiber) {
            yield* Fiber.interrupt(fiber);
            fibers.delete(sessionId);
          }
        } else {
          for (const fiber of fibers.values()) {
            yield* Fiber.interrupt(fiber);
          }
          fibers.clear();
        }
      });

    const generate = (sessionId: string, messagesToProcess: ReadonlyArray<ChatMessage>) =>
      Effect.gen(function* () {
        const state = yield* SubscriptionRef.get(store.state);
        const settings = state.settings;
        const sessionHeader = state.sessions[sessionId];

        if (!sessionHeader) return;

        yield* stop(sessionId);

        yield* store.update((s) => ({
          ...s,
          backgroundSessionIds: [...new Set([...s.backgroundSessionIds, sessionId])],
        }));

        const id = crypto.randomUUID();
        const assistantMessage: ChatMessage = {
          id,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          parentId: messagesToProcess[messagesToProcess.length - 1]?.id,
        };

        const streamEffect = Effect.gen(function* () {
          yield* chatService.addMessage(sessionId, assistantMessage);

          const session = yield* storage.getSession(sessionId);
          if (!session) return;

          const systemPrompt = synthesizeSystemPrompt(settings, session);
          const model = session.general.model || settings.model;

          const stream = yield* llm.streamCompletion(
            messagesToProcess,
            settings,
            {
              provider: 'openai',
              model,
              temperature: 0.7,
            },
            systemPrompt,
          );

          let fullContent = '';
          yield* Stream.runForEach(stream, (token) =>
            Effect.gen(function* () {
              fullContent += token;
              yield* chatService.updateMessage(sessionId, id, fullContent, false, true);
            }),
          );
          // Update timestamp once when stream is finished
          yield* chatService.updateSession(sessionId, (s) => s);
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              const msg = err instanceof LLMProviderError ? err.message : 'Unknown error';
              yield* chatService.updateMessage(sessionId, id, `*[Error: ${msg}]*`, true);
              yield* store.notify('error', `Chat error: ${msg}`);
            }),
          ),
          Effect.ensuring(
            Effect.gen(function* () {
              fibers.delete(sessionId);
              const currentState = yield* SubscriptionRef.get(store.state);
              yield* store.update((s) => ({
                ...s,
                backgroundSessionIds: s.backgroundSessionIds.filter((sid) => sid !== sessionId),
              }));

              if (currentState.activeSessionId !== sessionId) {
                yield* store.notify('success', `Response generated for "${sessionHeader.title}"`);
              }
            }),
          ),
        );

        const fiber = yield* Effect.forkDaemon(streamEffect);
        fibers.set(sessionId, fiber);
      });

    const chatService: ChatService = ChatService.of({
      updateSession,
      updateSessionFull,
      generate,
      stop,
      createSession: () =>
        Effect.gen(function* () {
          const now = Date.now();
          const id = crypto.randomUUID();
          const { settings, availableModels } = yield* SubscriptionRef.get(store.state);
          const { personalisation } = settings;

          const newSession: ChatSession = {
            id,
            title: 'New Chat',
            messages: {},
            createdAt: now,
            updatedAt: now,
            general: {
              model: getModelId(settings, availableModels),
              overrideInstruction: false,
              overridePersonalisation: false,
            },
            instruction: { systemPrompt: DEFAULT_SYSTEM_PROMPT },
            personalisation: {
              ...personalisation,
              userOccupation: [...personalisation.userOccupation],
              assistantTraits: [...personalisation.assistantTraits],
            },
          };

          const metadata = Schema.decodeSync(ChatMetadata)(newSession);

          yield* store.update((state) => ({
            ...state,
            sessions: { [id]: metadata, ...state.sessions },
            activeSessionId: id,
            activeSession: newSession,
          }));

          yield* storage.saveSession(newSession);

          return metadata;
        }),

      deleteSession: (id) =>
        Effect.gen(function* () {
          yield* stop(id);
          yield* store.update((state) => {
            const { [id]: _, ...rest } = state.sessions;
            const newActiveId = state.activeSessionId === id ? null : state.activeSessionId;
            return { ...state, sessions: rest, activeSessionId: newActiveId };
          });
          yield* storage.deleteSession(id);
        }),

      addMessage: (sessionId, message) =>
        Effect.gen(function* () {
          let messagesToSave: ChatMessage[] = [message];
          yield* updateSessionFull(sessionId, (session) => {
            const messages = { ...session.messages };
            let parent: ChatMessage | undefined;

            if (message.parentId && messages[message.parentId]) {
              parent = {
                ...messages[message.parentId],
                childrenIds: [...(messages[message.parentId].childrenIds || []), message.id],
              };
              messages[message.parentId] = parent;
              messagesToSave.push(parent);
            }

            messages[message.id] = message;

            const title =
              Object.keys(session.messages).length === 0 && message.role === 'user' && message.content
                ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                : session.title;

            return {
              ...session,
              messages,
              activeMessageId: message.id,
              title,
            };
          });

          yield* storage.saveMessages(sessionId, messagesToSave);
        }),

      updateMessage: (sessionId, messageId, content, isError, skipUpdateTimestamp) =>
        Effect.gen(function* () {
          let updatedMessage: ChatMessage | undefined;
          yield* updateSessionFull(
            sessionId,
            (session) => {
              const msg = session.messages[messageId];
              if (!msg) return session;
              updatedMessage = { ...msg, content, isError };
              return {
                ...session,
                messages: {
                  ...session.messages,
                  [messageId]: updatedMessage!,
                },
              };
            },
            skipUpdateTimestamp,
          );

          if (!updatedMessage) {
            yield* Effect.fail(new MessageNotFoundError({ messageId }));
          } else {
            yield* storage.saveMessage(sessionId, updatedMessage);
          }
        }),

      deleteMessage: (sessionId, messageId) =>
        Effect.gen(function* () {
          let messageToDelete: ChatMessage | undefined;
          let updatedParent: ChatMessage | undefined;

          yield* updateSessionFull(sessionId, (session) => {
            messageToDelete = session.messages[messageId];
            if (!messageToDelete) return session;

            const messages = { ...session.messages };
            delete messages[messageId];

            if (messageToDelete.parentId && messages[messageToDelete.parentId]) {
              updatedParent = {
                ...messages[messageToDelete.parentId],
                childrenIds: messages[messageToDelete.parentId].childrenIds?.filter((id) => id !== messageId),
              };
              messages[messageToDelete.parentId] = updatedParent;
            }

            let activeMessageId = session.activeMessageId;
            if (activeMessageId === messageId) {
              activeMessageId = messageToDelete.parentId || Object.keys(messages)[Object.keys(messages).length - 1];
            }

            return { ...session, messages, activeMessageId };
          });

          if (messageToDelete) {
            yield* storage.deleteMessage(messageId);
            if (updatedParent) {
              yield* storage.saveMessage(sessionId, updatedParent);
            }
          }
        }).pipe(
          Effect.catchAll((err) => {
            if (err instanceof SessionNotFoundError) return Effect.fail(err);
            return Effect.gen(function* () {
              yield* store.notify('error', `Failed to delete message: ${err}`);
              return yield* Effect.fail(err);
            });
          }),
        ),

      renameSession: (sessionId, title) => updateSession(sessionId, (session) => ({ ...session, title })),

      updateActiveSession,

      getSessionPath: (sessionId, messageId) =>
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(store.state);
          const session = state.activeSessionId === sessionId && state.activeSession ? state.activeSession : yield* storage.getSession(sessionId);

          if (!session) {
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }

          return getMessagePath(session, messageId);
        }),

      branchChat: (sessionId, messageId) =>
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(store.state);
          const sourceSession =
            state.activeSessionId === sessionId && state.activeSession ? state.activeSession : yield* storage.getSession(sessionId);

          if (!sourceSession) {
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }
          const targetMessage = sourceSession.messages[messageId];
          if (!targetMessage) {
            return yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

          const now = Date.now();
          const id = crypto.randomUUID();

          // We only take the path to this message
          const path = getMessagePath(sourceSession, messageId);
          const branchedMessages: Record<string, ChatMessage> = {};
          path.forEach((m) => (branchedMessages[m.id] = m));

          const newSession: ChatSession = {
            ...sourceSession,
            id,
            title: `${sourceSession.title} (Branch)`,
            messages: branchedMessages,
            activeMessageId: messageId,
            createdAt: now,
            updatedAt: now,
          };

          yield* store.update((state) => ({
            ...state,
            sessions: { [id]: Schema.decodeSync(ChatMetadata)(newSession), ...state.sessions },
            activeSessionId: id,
            activeSession: newSession,
          }));

          return newSession;
        }),
    });

    // Handle session resumption
    yield* Effect.gen(function* () {
      const state = yield* SubscriptionRef.get(store.state);
      for (const sessionId of state.backgroundSessionIds) {
        const session = yield* storage.getSession(sessionId);
        if (!session) continue;

        const messages = Object.values(session.messages).sort((a, b) => b.timestamp - a.timestamp);
        const lastMessage = messages[0];
        const lastUserMessage = messages.find((m) => m.role === 'user');

        if (lastMessage && lastUserMessage) {
          if (lastMessage.role === 'assistant' && !lastMessage.isError) {
            // It was an assistant message (empty or partial) that was interrupted
            yield* chatService.deleteMessage(sessionId, lastMessage.id);
            const path = getMessagePath(session, lastUserMessage.id);
            yield* chatService.generate(sessionId, path);
          } else if (lastMessage.role === 'user') {
            // It was a user message that hadn't triggered generate yet
            const path = getMessagePath(session, lastMessage.id);
            yield* chatService.generate(sessionId, path);
          } else {
            // Clear stale loading state for finished or errored messages
            yield* store.update((s) => ({
              ...s,
              backgroundSessionIds: s.backgroundSessionIds.filter((id) => id !== sessionId),
            }));
          }
        } else {
          // No valid state to resume
          yield* store.update((s) => ({
            ...s,
            backgroundSessionIds: s.backgroundSessionIds.filter((id) => id !== sessionId),
          }));
        }
      }
    }).pipe(Effect.forkDaemon);

    return chatService;
  }),
);
