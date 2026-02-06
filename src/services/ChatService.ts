import { Context, Effect, Fiber, Layer, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SYSTEM_PROMPT } from '../app/Constant';
import { LLMProviderError, MessageNotFoundError, SessionNotFoundError } from '../app/Error';
import { getModelId } from '../helpers/ModelHelper';
import { getMessagePath } from '../helpers/SessionHelper';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { StorageService } from './StorageService';
import { StoreService } from './StoreService';

import type { ChatSession, Message } from '../app/Schema';

export interface ChatService {
  readonly createSession: () => Effect.Effect<ChatSession>;
  readonly deleteSession: (id: string) => Effect.Effect<void>;
  readonly addMessage: (sessionId: string, message: Message) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateMessage: (
    sessionId: string,
    messageId: string,
    content: string,
    isError?: boolean,
  ) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly deleteMessage: (sessionId: string, messageId: string) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly renameSession: (sessionId: string, title: string) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateSession: (sessionId: string, f: (session: ChatSession, now: number) => ChatSession) => Effect.Effect<void, SessionNotFoundError>;
  readonly getSessionPath: (sessionId: string, messageId: string) => Effect.Effect<ReadonlyArray<Message>, SessionNotFoundError>;
  readonly branchChat: (sessionId: string, messageId: string) => Effect.Effect<ChatSession, SessionNotFoundError | MessageNotFoundError>;
  readonly generate: (sessionId: string, messagesToProcess: ReadonlyArray<Message>) => Effect.Effect<void>;
  readonly stop: (sessionId?: string) => Effect.Effect<void>;
}

export const ChatService = Context.GenericTag<ChatService>('@services/ChatService');

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const store = yield* StoreService;
    const storage = yield* StorageService;
    const llm = yield* LLMProvider;
    const fibers = new Map<string, Fiber.Fiber<void, any>>();

    const updateSession = (sessionId: string, f: (session: ChatSession, now: number) => ChatSession) =>
      Effect.gen(function* () {
        const now = Date.now();
        let sessionFound = false;
        yield* store.update((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          sessionFound = true;
          return {
            ...state,
            sessions: {
              ...state.sessions,
              [sessionId]: { ...f(session, now), updatedAt: now },
            },
          };
        });

        if (!sessionFound) {
          yield* Effect.fail(new SessionNotFoundError({ sessionId }));
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

    const stop = (sessionId?: string) =>
      Effect.sync(() => {
        if (sessionId) {
          const fiber = fibers.get(sessionId);
          if (fiber) {
            Effect.runFork(Fiber.interrupt(fiber));
            fibers.delete(sessionId);
          }
        } else {
          fibers.forEach((fiber) => Effect.runFork(Fiber.interrupt(fiber)));
          fibers.clear();
        }
      });

    const generate = (sessionId: string, messagesToProcess: ReadonlyArray<Message>) =>
      Effect.gen(function* () {
        const state = yield* SubscriptionRef.get(store.state);
        const settings = state.settings;
        const session = state.sessions[sessionId];

        if (!session) return;

        yield* stop(sessionId);

        yield* store.update((s) => ({
          ...s,
          backgroundSessionIds: [...new Set([...s.backgroundSessionIds, sessionId])],
        }));

        const id = crypto.randomUUID();
        const assistantMessage: Message = {
          id,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          parentId: messagesToProcess[messagesToProcess.length - 1]?.id,
        };

        const streamEffect = Effect.gen(function* () {
          yield* chatService.addMessage(sessionId, assistantMessage);

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
              yield* chatService.updateMessage(sessionId, id, fullContent);
            }),
          );
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
                yield* store.notify('success', `Response generated for "${session.title}"`);
              }
            }),
          ),
        );

        const fiber = yield* Effect.forkDaemon(streamEffect);
        fibers.set(sessionId, fiber);
      });

    const chatService: ChatService = ChatService.of({
      updateSession,
      generate,
      stop,
      createSession: () =>
        Effect.gen(function* () {
          const now = Date.now();
          const id = crypto.randomUUID();
          const { settings, availableModels } = yield* SubscriptionRef.get(store.state);

          const effectiveModel = getModelId(settings, availableModels);

          const newSession: ChatSession = {
            id,
            title: 'New Chat',
            messages: {},
            createdAt: now,
            updatedAt: now,
            general: {
              model: effectiveModel,
              overrideInstruction: false,
              overridePersonalisation: false,
            },
            instruction: {
              systemPrompt: DEFAULT_SYSTEM_PROMPT,
            },
            personalisation: {
              userName: settings.personalisation.userName,
              userOccupation: [...settings.personalisation.userOccupation],
              assistantTraits: [...settings.personalisation.assistantTraits],
              additionalContext: settings.personalisation.additionalContext,
            },
          };

          yield* store.update((state) => ({
            ...state,
            sessions: { [id]: newSession, ...state.sessions },
            activeSessionId: id,
          }));

          return newSession;
        }),

      deleteSession: (id) =>
        Effect.gen(function* () {
          yield* store.update((state) => {
            const { [id]: _, ...rest } = state.sessions;
            const newActiveId = state.activeSessionId === id ? null : state.activeSessionId;
            return { ...state, sessions: rest, activeSessionId: newActiveId };
          });
          yield* storage.deleteSession(id);
        }),

      addMessage: (sessionId, message) =>
        Effect.gen(function* () {
          yield* updateSession(sessionId, (session) => {
            const messages = { ...session.messages };
            let parent: Message | undefined;

            if (message.parentId && messages[message.parentId]) {
              parent = {
                ...messages[message.parentId],
                childrenIds: [...(messages[message.parentId].childrenIds || []), message.id],
              };
              messages[message.parentId] = parent;
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

          const currentSession = (yield* SubscriptionRef.get(store.state)).sessions[sessionId];
          const parent = message.parentId ? currentSession?.messages[message.parentId] : undefined;
          const messagesToSave = parent ? [parent, message] : [message];

          yield* storage.saveMessages(sessionId, messagesToSave);
        }),

      updateMessage: (sessionId, messageId, content, isError) =>
        Effect.gen(function* () {
          let updatedMessage: Message | undefined;
          yield* updateSession(sessionId, (session) => {
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
          });

          if (!updatedMessage) {
            yield* Effect.fail(new MessageNotFoundError({ messageId }));
          } else {
            yield* storage.saveMessage(sessionId, updatedMessage);
          }
        }),

      deleteMessage: (sessionId, messageId) =>
        Effect.gen(function* () {
          let messageToDelete: Message | undefined;
          yield* updateSession(sessionId, (session) => {
            messageToDelete = session.messages[messageId];
            if (!messageToDelete) return session;

            const messages = { ...session.messages };
            delete messages[messageId];

            if (messageToDelete.parentId && messages[messageToDelete.parentId]) {
              messages[messageToDelete.parentId] = {
                ...messages[messageToDelete.parentId],
                childrenIds: messages[messageToDelete.parentId].childrenIds?.filter((id) => id !== messageId),
              };
            }

            let activeMessageId = session.activeMessageId;
            if (activeMessageId === messageId) {
              activeMessageId = messageToDelete.parentId || Object.keys(messages)[Object.keys(messages).length - 1];
            }

            return { ...session, messages, activeMessageId };
          });

          if (messageToDelete) {
            // Surgical IDB deletion
            yield* storage.deleteMessage(messageId);
            if (messageToDelete.parentId) {
              const currentSession = (yield* SubscriptionRef.get(store.state)).sessions[sessionId];
              const updatedParent = currentSession?.messages[messageToDelete.parentId];
              if (updatedParent) {
                yield* storage.saveMessage(sessionId, updatedParent);
              }
            }
          }
        }).pipe(
          Effect.catchAll((err: any) => {
            if (err instanceof SessionNotFoundError || err instanceof MessageNotFoundError) return Effect.fail(err);
            return Effect.gen(function* () {
              yield* store.notify('error', `Failed to delete message: ${err}`);
              return yield* Effect.fail(err);
            });
          }),
        ),

      renameSession: (sessionId, title) => updateSession(sessionId, (session) => ({ ...session, title })),

      getSessionPath: (sessionId, messageId) =>
        Effect.gen(function* () {
          const { sessions } = yield* SubscriptionRef.get(store.state);
          const session = sessions[sessionId];
          if (!session) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }

          return getMessagePath(session, messageId);
        }),

      branchChat: (sessionId, messageId) =>
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(store.state);
          const sourceSession = currentState.sessions[sessionId];
          if (!sourceSession) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }
          const targetMessage = sourceSession.messages[messageId];
          if (!targetMessage) {
            yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

          const now = Date.now();
          const id = crypto.randomUUID();

          // We only take the path to this message
          const path = getMessagePath(sourceSession, messageId);
          const branchedMessages: Record<string, Message> = {};
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
            sessions: { [id]: newSession, ...state.sessions },
            activeSessionId: id,
          }));

          return newSession;
        }),
    });

    return chatService;
  }),
);
