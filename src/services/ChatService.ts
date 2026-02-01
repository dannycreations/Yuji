import { Context, Effect, Layer, SubscriptionRef } from 'effect';

import { DEFAULT_SYSTEM_PROMPT } from '../app/Constant';
import { MessageNotFoundError, SessionNotFoundError } from '../app/Error';
import { PlatformService } from './PlatformService';
import { StoreService } from './StoreService';

import type { ChatSession, Message } from '../app/Schema';

export interface ChatService {
  readonly createSession: () => Effect.Effect<ChatSession>;
  readonly deleteSession: (id: string) => Effect.Effect<void>;
  readonly addMessage: (sessionId: string, message: Message) => Effect.Effect<void, SessionNotFoundError>;
  readonly updateMessage: (sessionId: string, messageId: string, content: string) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly deleteMessage: (sessionId: string, messageId: string) => Effect.Effect<void, SessionNotFoundError | MessageNotFoundError>;
  readonly renameSession: (sessionId: string, title: string) => Effect.Effect<void, SessionNotFoundError>;
  readonly getSessionPath: (sessionId: string, messageId: string) => Effect.Effect<ReadonlyArray<Message>, SessionNotFoundError>;
  readonly branchChat: (sessionId: string, messageId: string) => Effect.Effect<ChatSession, SessionNotFoundError | MessageNotFoundError>;
}

export const ChatService = Context.GenericTag<ChatService>('@services/ChatService');

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const platform = yield* PlatformService;
    const store = yield* StoreService;

    return ChatService.of({
      createSession: () =>
        Effect.gen(function* () {
          const id = yield* platform.nextId;
          const now = yield* platform.now;
          const { settings, availableModels } = yield* SubscriptionRef.get(store.state);

          const disabledModels = settings.disabledModels || [];
          const activeModels = availableModels.filter((m) => !disabledModels.includes(m.id));
          const effectiveDefaultModel = activeModels.find((m) => m.id === settings.defaultModel)?.id || activeModels[0]?.id || 'gpt-4o';

          const newSession: ChatSession = {
            id,
            title: 'New Chat',
            messages: [],
            createdAt: now,
            updatedAt: now,
            general: {
              model: effectiveDefaultModel,
              overrideModel: false,
              overrideInstruction: false,
              overridePersonalisation: false,
            },
            instruction: {
              systemPrompt: DEFAULT_SYSTEM_PROMPT,
            },
            personalisation: {
              userName: settings.personalisation.userName,
              userOccupation: settings.personalisation.userOccupation,
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
        store.update((state) => {
          const { [id]: _, ...rest } = state.sessions;
          let newActiveId = state.activeSessionId;
          if (state.activeSessionId === id) {
            const keys = Object.keys(rest);
            newActiveId = keys.length > 0 ? keys[0] : null;
          }
          return { ...state, sessions: rest, activeSessionId: newActiveId };
        }),

      addMessage: (sessionId, message) =>
        Effect.gen(function* () {
          const now = yield* platform.now;

          yield* store
            .update((state) => {
              const currentSession = state.sessions[sessionId];
              if (!currentSession) return state;

              const messages = [...currentSession.messages];

              if (message.parentId) {
                const parentIndex = messages.findIndex((m) => m.id === message.parentId);
                if (parentIndex !== -1) {
                  const parent = messages[parentIndex];
                  messages[parentIndex] = {
                    ...parent,
                    childrenIds: [...(parent.childrenIds || []), message.id],
                  };
                }
              }

              messages.push(message);

              const title =
                currentSession.messages.length === 0 && message.role === 'user' && message.content
                  ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                  : currentSession.title;

              return {
                ...state,
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...currentSession,
                    messages,
                    activeMessageId: message.id,
                    title,
                    updatedAt: now,
                  },
                },
              };
            })
            .pipe(
              Effect.catchAll((err) =>
                Effect.gen(function* () {
                  yield* store.notify('error', `Failed to add message: ${err}`);
                  return yield* Effect.fail(err);
                }),
              ),
            );

          const { sessions } = yield* SubscriptionRef.get(store.state);
          if (!sessions[sessionId]) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }
        }),

      updateMessage: (sessionId, messageId, content) =>
        Effect.gen(function* () {
          const now = yield* platform.now;

          yield* store
            .update((state) => {
              const currentSession = state.sessions[sessionId];
              if (!currentSession) return state;

              const updatedMessages = currentSession.messages.map((m) => (m.id === messageId ? { ...m, content } : m));

              return {
                ...state,
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...currentSession,
                    messages: updatedMessages,
                    updatedAt: now,
                  },
                },
              };
            })
            .pipe(
              Effect.catchAll((err) =>
                Effect.gen(function* () {
                  yield* store.notify('error', `Failed to update message: ${err}`);
                  return yield* Effect.fail(err);
                }),
              ),
            );

          const { sessions } = yield* SubscriptionRef.get(store.state);
          const session = sessions[sessionId];
          if (!session) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }
          if (!session.messages.find((m) => m.id === messageId)) {
            yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }
        }),

      deleteMessage: (sessionId, messageId) =>
        Effect.gen(function* () {
          const now = yield* platform.now;

          yield* store
            .update((state) => {
              const session = state.sessions[sessionId];
              if (!session) return state;

              const messageToDelete = session.messages.find((m) => m.id === messageId);
              if (!messageToDelete) return state;

              // Remove message from messages array
              const newMessages = session.messages.filter((m) => m.id !== messageId);

              // Update parent's childrenIds if applicable
              if (messageToDelete.parentId) {
                const parentIndex = newMessages.findIndex((m) => m.id === messageToDelete.parentId);
                if (parentIndex !== -1) {
                  const parent = newMessages[parentIndex];
                  newMessages[parentIndex] = {
                    ...parent,
                    childrenIds: parent.childrenIds?.filter((id) => id !== messageId),
                  };
                }
              }

              // Update activeMessageId if it was the one deleted
              let activeMessageId = session.activeMessageId;
              if (activeMessageId === messageId) {
                activeMessageId = messageToDelete.parentId || (newMessages.length > 0 ? newMessages[newMessages.length - 1].id : undefined);
              }

              return {
                ...state,
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...session,
                    messages: newMessages,
                    activeMessageId,
                    updatedAt: now,
                  },
                },
              };
            })
            .pipe(
              Effect.catchAll((err) =>
                Effect.gen(function* () {
                  yield* store.notify('error', `Failed to delete message: ${err}`);
                  return yield* Effect.fail(err);
                }),
              ),
            );

          const { sessions } = yield* SubscriptionRef.get(store.state);
          const session = sessions[sessionId];
          if (!session) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }
          // We don't fail if message is not found after update because we just deleted it or it didn't exist
        }),

      renameSession: (sessionId, title) =>
        Effect.gen(function* () {
          const now = yield* platform.now;

          yield* store
            .update((state) => {
              const session = state.sessions[sessionId];
              if (!session) return state;

              return {
                ...state,
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...session,
                    title,
                    updatedAt: now,
                  },
                },
              };
            })
            .pipe(
              Effect.catchAll((err) =>
                Effect.gen(function* () {
                  yield* store.notify('error', `Failed to rename session: ${err}`);
                  return yield* Effect.fail(err);
                }),
              ),
            );

          const { sessions } = yield* SubscriptionRef.get(store.state);
          if (!sessions[sessionId]) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }
        }),

      getSessionPath: (sessionId, messageId) =>
        Effect.gen(function* () {
          const { sessions } = yield* SubscriptionRef.get(store.state);
          const session = sessions[sessionId];
          if (!session) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }

          const findPath = (currId: string): ReadonlyArray<Message> => {
            const msg = session.messages.find((m) => m.id === currId);
            if (!msg) return [];
            return msg.parentId ? [...findPath(msg.parentId), msg] : [msg];
          };

          return findPath(messageId);
        }),

      branchChat: (sessionId, messageId) =>
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(store.state);
          const sourceSession = currentState.sessions[sessionId];
          if (!sourceSession) {
            yield* Effect.fail(new SessionNotFoundError({ sessionId }));
          }
          const messageIndex = sourceSession.messages.findIndex((m) => m.id === messageId);
          if (messageIndex === -1) {
            yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

          const id = yield* platform.nextId;
          const now = yield* platform.now;
          const branchedMessages = sourceSession.messages.slice(0, messageIndex + 1);

          const newSession: ChatSession = {
            ...sourceSession,
            id,
            title: `${sourceSession.title} (Branch)`,
            messages: branchedMessages,
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
  }),
);
