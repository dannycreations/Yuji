import { Effect } from 'effect';

import { ChatService } from '../services/ChatService';
import { uuid } from '../utilities/CommonUtil';
import { useStore, useStoreAction, useStoreEffect } from './useStore';

import type { Attachment, ChatMessage } from '../app/Schema';

export const useChatAction = () => {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeThread = useStore((s) => s.activeThread);
  const backgroundThreadIds = useStore((s) => s.backgroundThreadIds);

  const isLoading = activeThreadId ? backgroundThreadIds.includes(activeThreadId) : false;

  const handleSend = useStoreEffect((content: string, attachments: ReadonlyArray<Attachment> = []) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      let currentThreadId = activeThreadId;

      if (!currentThreadId) {
        const thread = yield* chat.createThread();
        currentThreadId = thread.id;
      }

      const userMessage: ChatMessage = {
        id: uuid(),
        role: 'user',
        content,
        attachments,
        timestamp: Date.now(),
        parentId: activeThread?.activeMessageId,
      };

      yield* chat.addMessage(currentThreadId, userMessage);
      const history = yield* chat.getThreadPath(currentThreadId, userMessage.id);
      yield* chat.generate(currentThreadId, history);
    }),
  );

  const handleRegenerate = useStoreEffect((threadId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      if (!activeThread || activeThread.id !== threadId) return;

      const originalMessage = activeThread.messages[messageId];
      if (!originalMessage) return;

      const history =
        originalMessage.role === 'assistant'
          ? originalMessage.parentId
            ? yield* chat.getThreadPath(threadId, originalMessage.parentId)
            : []
          : yield* chat.getThreadPath(threadId, messageId);

      yield* chat.generate(threadId, history);
    }),
  );

  const handleEdit = useStoreEffect((threadId: string, messageId: string, newContent: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateMessage(threadId, messageId, newContent);
    }),
  );

  const handleDeleteMessage = useStoreEffect((threadId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.deleteMessage(threadId, messageId);
    }),
  );

  const handleBranch = useStoreEffect((threadId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.branchChat(threadId, messageId);
    }),
  );

  const handleSwitchBranch = useStoreEffect((_threadId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateActiveThread((thread) => ({
        ...thread,
        activeMessageId: messageId,
      }));
    }),
  );

  const handleDeleteThread = useStoreEffect((threadId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.deleteThread(threadId);
    }),
  );

  const handleTogglePin = useStoreAction((s, threadId: string) => s.togglePin(threadId));

  const handleCreateThread = useStoreEffect(() =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.createThread();
    }),
  );

  return {
    isLoading,
    stop: useStoreEffect(() =>
      Effect.gen(function* () {
        const chat = yield* ChatService;
        yield* chat.stop(activeThreadId || undefined);
      }),
    ),
    handleSend,
    handleRegenerate,
    handleEdit,
    handleDeleteMessage,
    handleBranch,
    handleSwitchBranch,
    handleDeleteThread,
    handleTogglePin,
    handleCreateThread,
  };
};
