import { Effect } from 'effect';

import { ChatService } from '../services/ChatService';
import { useStore, useStoreEffect } from './useStore';

import type { Attachment, Message } from '../app/Schema';

export const useChatAction = () => {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const backgroundSessionIds = useStore((s) => s.backgroundSessionIds);
  const sessions = useStore((s) => s.sessions);

  const isLoading = activeSessionId ? backgroundSessionIds.includes(activeSessionId) : false;

  const handleSend = useStoreEffect((content: string, attachments: Attachment[] = []) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      let currentSessionId = activeSessionId;

      if (!currentSessionId) {
        const session = yield* chat.createSession();
        currentSessionId = session.id;
      }

      const activeSession = sessions[currentSessionId];
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        attachments,
        timestamp: Date.now(),
        parentId: activeSession?.activeMessageId,
      };

      yield* chat.addMessage(currentSessionId, userMessage);
      const history = yield* chat.getSessionPath(currentSessionId, userMessage.id);
      yield* chat.generate(currentSessionId, history);
    }),
  );

  const handleRegenerate = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      const session = sessions[sessionId];
      if (!session) return;

      const originalMessage = session.messages.find((m) => m.id === messageId);
      if (!originalMessage) return;

      const history =
        originalMessage.role === 'assistant'
          ? originalMessage.parentId
            ? yield* chat.getSessionPath(sessionId, originalMessage.parentId)
            : []
          : yield* chat.getSessionPath(sessionId, messageId);

      yield* chat.generate(sessionId, history);
    }),
  );

  const handleEdit = useStoreEffect((sessionId: string, messageId: string, newContent: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateMessage(sessionId, messageId, newContent);
    }),
  );

  const handleDeleteMessage = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.deleteMessage(sessionId, messageId);
    }),
  );

  const handleBranch = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.branchChat(sessionId, messageId);
    }),
  );

  const handleSwitchBranch = useStoreEffect((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateSession(sessionId, (session) => ({
        ...session,
        activeMessageId: messageId,
      }));
    }),
  );

  const handleDeleteSession = useStoreEffect((sessionId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.deleteSession(sessionId);
    }),
  );

  const handleCreateSession = useStoreEffect(() =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.createSession();
    }),
  );

  return {
    isLoading,
    stop: useStoreEffect(() =>
      Effect.gen(function* () {
        const chat = yield* ChatService;
        yield* chat.stop(activeSessionId || undefined);
      }),
    ),
    handleSend,
    handleRegenerate,
    handleEdit,
    handleDeleteMessage,
    handleBranch,
    handleSwitchBranch,
    handleDeleteSession,
    handleCreateSession,
  };
};
