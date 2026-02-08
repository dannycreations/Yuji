import { Context, Effect, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SYSTEM_PROMPT } from '../app/Constant';
import { MessageNotFoundError, SessionNotFoundError } from '../app/Error';
import { ChatMessage, ChatMetadata, ChatSession } from '../app/Schema';
import { getModelId } from '../helpers/ModelHelper';
import { getMessagePath } from '../helpers/SessionHelper';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { truncate, uuid } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';
import { StoreService } from './StoreService';

export interface ChatService {
  readonly createSession: () => Effect.Effect<ChatMetadata>;
  readonly deleteSession: (id: string) => Effect.Effect<void>;
  readonly deleteSessions: (ids: Set<string>) => Effect.Effect<void>;
  readonly importSessions: (sessions: Record<string, ChatSession>) => Effect.Effect<void>;
  readonly addMessage: (sessionId: string, message: ChatMessage) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateMessage: (
    sessionId: string,
    messageId: string,
    content: string,
    isError?: boolean,
    skipUpdateTimestamp?: boolean,
    uiOnly?: boolean,
  ) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly deleteMessage: (sessionId: string, messageId: string) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly renameSession: (sessionId: string, title: string) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateSession: (
    sessionId: string,
    f: (session: ChatSession, now: number) => ChatSession,
    options?: {
      readonly skipUpdateTimestamp?: boolean;
      readonly metadataOnly?: boolean;
    },
  ) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateActiveSession: (
    f: (session: ChatSession, now: number) => ChatSession,
    skipUpdateTimestamp?: boolean,
  ) => Effect.Effect<void, SessionNotFoundError>;
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

    const updateSession = (
      sessionId: string,
      f: (session: ChatSession, now: number) => ChatSession,
      options: { readonly skipUpdateTimestamp?: boolean; readonly metadataOnly?: boolean } = {},
    ) =>
      Effect.gen(function* () {
        const now = Date.now();
        const state = yield* SubscriptionRef.get(store.state);
        let session: ChatSession | null = null;

        const isActive = state.activeSessionId === sessionId && state.activeSession?.id === sessionId;
        if (isActive) {
          session = state.activeSession;
        } else if (!options.metadataOnly) {
          session = yield* storage.getSession(sessionId);
        } else if (state.sessions[sessionId]) {
          session = state.sessions[sessionId] as unknown as ChatSession;
        }

        if (!session) return yield* Effect.fail(new SessionNotFoundError({ sessionId }));

        const updated = f(session, now);
        const finalUpdated: ChatSession = options.skipUpdateTimestamp ? updated : { ...updated, updatedAt: now };
        const metadata = yield* Schema.decode(ChatMetadata)(finalUpdated).pipe(Effect.orDie);

        yield* store.update((s) => ({
          ...s,
          sessions: { ...s.sessions, [sessionId]: metadata },
          activeSession: isActive ? finalUpdated : s.activeSession,
        }));

        yield* storage.saveSession(options.metadataOnly ? metadata : finalUpdated);
      }).pipe(
        Effect.catchAll((err) => {
          if (err instanceof SessionNotFoundError) return Effect.fail(err);
          return store.notify('error', (err as { message: string })?.message || String(err)).pipe(Effect.flatMap(() => Effect.fail(err)));
        }),
      );

    const updateActiveSession = (f: (session: ChatSession, now: number) => ChatSession, skipUpdateTimestamp = false) =>
      Effect.gen(function* () {
        const activeId = (yield* SubscriptionRef.get(store.state)).activeSessionId;
        if (!activeId) return yield* Effect.fail(new SessionNotFoundError({ sessionId: 'active' }));
        return yield* updateSession(activeId, f, { skipUpdateTimestamp });
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
          let lastSavedContent = '';
          let lastUISaveContent = '';
          let lastSaveTime = Date.now();
          let lastUITime = Date.now();

          // ~30fps for smooth rendering without overloading React
          const UI_UPDATE_INTERVAL = 33;
          const STORAGE_SAVE_INTERVAL = 1000;

          yield* Stream.runForEach(stream, (token) =>
            Effect.gen(function* () {
              fullContent += token;
              const now = Date.now();

              // Throttle UI updates to prevent React reconciliation bottleneck
              if (now - lastUITime > UI_UPDATE_INTERVAL) {
                lastUITime = now;
                lastUISaveContent = fullContent;
                yield* chatService.updateMessage(sessionId, id, fullContent, false, true, true);
              }

              // Throttle Storage updates to prevent IDB write bottleneck
              if (now - lastSaveTime > STORAGE_SAVE_INTERVAL) {
                lastSaveTime = now;
                lastSavedContent = fullContent;
                yield* chatService.updateMessage(sessionId, id, fullContent, false, true);
              }
            }),
          );

          // Ensure final state is synchronized to both UI and Storage
          if (fullContent !== lastUISaveContent) {
            yield* chatService.updateMessage(sessionId, id, fullContent, false, true, true);
          }
          if (fullContent !== lastSavedContent) {
            yield* chatService.updateMessage(sessionId, id, fullContent, false, true);
          }

          // Update timestamp once when stream is finished
          yield* chatService.updateSession(sessionId, (s) => s);
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              const msg = (err as { message: string })?.message || String(err);
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
      generate,
      stop,
      createSession: () =>
        Effect.gen(function* () {
          const now = Date.now();
          const id = uuid();
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

          const metadata = yield* Schema.decode(ChatMetadata)(newSession).pipe(Effect.orDie);

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
            const { [id]: _, ...sessions } = state.sessions;
            return {
              ...state,
              sessions,
              activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
              activeSession: state.activeSessionId === id ? null : state.activeSession,
            };
          });
          yield* storage.deleteSession(id);
        }),

      deleteSessions: (ids) =>
        Effect.gen(function* () {
          for (const id of ids) {
            yield* stop(id);
          }
          yield* store.update((state) => {
            const sessions = { ...state.sessions };
            ids.forEach((id) => delete sessions[id]);
            const isActiveDeleted = state.activeSessionId && ids.has(state.activeSessionId);
            return {
              ...state,
              sessions,
              activeSessionId: isActiveDeleted ? null : state.activeSessionId,
              activeSession: isActiveDeleted ? null : state.activeSession,
            };
          });
          for (const id of ids) {
            yield* storage.deleteSession(id);
          }
        }),

      importSessions: (sessions) =>
        Effect.gen(function* () {
          const metadatas: Record<string, ChatMetadata> = {};
          for (const [id, session] of Object.entries(sessions)) {
            metadatas[id] = yield* Schema.decode(ChatMetadata)(session).pipe(Effect.orDie);
            yield* storage.saveSession(session);
          }
          yield* store.update((s) => ({
            ...s,
            sessions: { ...s.sessions, ...metadatas },
          }));
        }),

      addMessage: (sessionId, message) =>
        Effect.gen(function* () {
          let messagesToSave: ChatMessage[] = [message];
          yield* updateSession(sessionId, (session) => {
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
              (session.title === 'New Chat' || session.title.endsWith('...')) &&
              Object.keys(session.messages).length === 0 &&
              message.role === 'user' &&
              message.content
                ? truncate(message.content.split('\n')[0], 40)
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

      updateMessage: (sessionId, messageId, content, isError, skipUpdateTimestamp, uiOnly) =>
        Effect.gen(function* () {
          let updatedMessage: ChatMessage | undefined;
          yield* updateSession(
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
            { skipUpdateTimestamp },
          );

          if (!updatedMessage) {
            return yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

          if (!uiOnly) {
            yield* storage.saveMessage(sessionId, updatedMessage);
          }
        }),

      deleteMessage: (sessionId, messageId) =>
        Effect.gen(function* () {
          let idsToDelete: string[] = [];
          let updatedParent: ChatMessage | undefined;

          yield* updateSession(sessionId, (session) => {
            const messageToDelete = session.messages[messageId];
            if (!messageToDelete) return session;

            const messages = { ...session.messages };
            idsToDelete = [];
            const collectIds = (id: string) => {
              const msg = messages[id];
              if (!msg) return;
              idsToDelete.push(id);
              msg.childrenIds?.forEach(collectIds);
            };
            collectIds(messageId);

            idsToDelete.forEach((id) => delete messages[id]);

            if (messageToDelete.parentId && messages[messageToDelete.parentId]) {
              updatedParent = {
                ...messages[messageToDelete.parentId],
                childrenIds: messages[messageToDelete.parentId].childrenIds?.filter((id) => id !== messageId),
              };
              messages[messageToDelete.parentId] = updatedParent;
            }

            let activeMessageId = session.activeMessageId;
            if (idsToDelete.includes(activeMessageId || '')) {
              activeMessageId = messageToDelete.parentId || Object.keys(messages)[Object.keys(messages).length - 1];
            }

            return { ...session, messages, activeMessageId };
          });

          if (idsToDelete.length > 0) {
            for (const id of idsToDelete) {
              yield* storage.deleteMessage(id);
            }
            if (updatedParent) {
              yield* storage.saveMessage(sessionId, updatedParent);
            }
          }
        }).pipe(
          Effect.catchAll((err) => {
            if (err instanceof SessionNotFoundError) return Effect.fail(err);
            const msg = (err as { message: string })?.message || String(err);
            return store.notify('error', `Failed to delete message: ${msg}`).pipe(Effect.flatMap(() => Effect.fail(err)));
          }),
        ),

      renameSession: (sessionId, title) => updateSession(sessionId, (session) => ({ ...session, title }), { metadataOnly: true }),

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
          const id = uuid();

          const path = getMessagePath(sourceSession, messageId);
          const branchedMessages: Record<string, ChatMessage> = {};

          // We create new identities for the path
          // to ensure the branch is isolated from future changes in the source,
          const idMap = new Map<string, string>();
          const messagesToSave: ChatMessage[] = [];

          for (const m of path) {
            const newMsgId = uuid();
            idMap.set(m.id, newMsgId);

            const branchedMsg: ChatMessage = {
              ...m,
              id: newMsgId,
              parentId: m.parentId ? idMap.get(m.parentId) : undefined,
              childrenIds: [], // Branches start fresh
            };

            branchedMessages[newMsgId] = branchedMsg;
            messagesToSave.push(branchedMsg);
          }

          // Restore internal links for the new set
          for (const m of messagesToSave) {
            if (m.parentId && branchedMessages[m.parentId]) {
              const parent = branchedMessages[m.parentId];
              branchedMessages[m.parentId] = {
                ...parent,
                childrenIds: [...(parent.childrenIds || []), m.id],
              };
            }
          }

          // Update the list of messages to save with linked versions
          const finalMessagesToSave = Object.values(branchedMessages);

          const newActiveMessageId = idMap.get(messageId);

          const newSession: ChatSession = {
            ...sourceSession,
            id,
            title: `${sourceSession.title} (Branch)`,
            messages: branchedMessages,
            activeMessageId: newActiveMessageId,
            createdAt: now,
            updatedAt: now,
          };

          const metadata = yield* Schema.decode(ChatMetadata)(newSession).pipe(Effect.orDie);
          yield* store.update((state) => ({
            ...state,
            sessions: { [id]: metadata, ...state.sessions },
            activeSessionId: id,
            activeSession: newSession,
          }));

          yield* storage.saveSession(newSession);
          yield* storage.saveMessages(id, finalMessagesToSave);

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
