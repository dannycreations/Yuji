import { Context, Effect, Layer, SubscriptionRef } from 'effect';

import { DEFAULT_SYSTEM_PROMPT } from '../app/Constant';
import { MessageNotFoundError, SessionNotFoundError } from '../app/Error';
import { getModelId } from '../helpers/ModelHelper';
import { getMessagePath } from '../helpers/SessionHelper';
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
}

export const ChatService = Context.GenericTag<ChatService>('@services/ChatService');

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const store = yield* StoreService;

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

    return ChatService.of({
      updateSession,
      createSession: () =>
        Effect.gen(function* () {
          const now = Date.now();
          const id = crypto.randomUUID();
          const { settings, availableModels } = yield* SubscriptionRef.get(store.state);

          const effectiveModel = getModelId(settings, availableModels);

          const newSession: ChatSession = {
            id,
            title: 'New Chat',
            messages: [],
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
        updateSession(sessionId, (session) => {
          const messages = session.messages.map((m) =>
            m.id === message.parentId ? { ...m, childrenIds: [...(m.childrenIds || []), message.id] } : m,
          );

          const title =
            session.messages.length === 0 && message.role === 'user' && message.content
              ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
              : session.title;

          return {
            ...session,
            messages: [...messages, message],
            activeMessageId: message.id,
            title,
          };
        }),

      updateMessage: (sessionId, messageId, content, isError) =>
        Effect.gen(function* () {
          let messageFound = false;
          yield* updateSession(sessionId, (session) => {
            if (!session.messages.some((m) => m.id === messageId)) {
              return session;
            }
            messageFound = true;
            return {
              ...session,
              messages: session.messages.map((m) => (m.id === messageId ? { ...m, content, isError } : m)),
            };
          });

          if (!messageFound) {
            yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }
        }),

      deleteMessage: (sessionId, messageId) =>
        updateSession(sessionId, (session) => {
          const messageToDelete = session.messages.find((m) => m.id === messageId);
          if (!messageToDelete) return session;

          const newMessages = session.messages
            .filter((m) => m.id !== messageId)
            .map((m) => (m.id === messageToDelete.parentId ? { ...m, childrenIds: m.childrenIds?.filter((id) => id !== messageId) } : m));

          let activeMessageId = session.activeMessageId;
          if (activeMessageId === messageId) {
            activeMessageId = messageToDelete.parentId || (newMessages.length > 0 ? newMessages[newMessages.length - 1].id : undefined);
          }

          return { ...session, messages: newMessages, activeMessageId };
        }),

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
          const messageIndex = sourceSession.messages.findIndex((m) => m.id === messageId);
          if (messageIndex === -1) {
            yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

          const now = Date.now();
          const id = crypto.randomUUID();
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
