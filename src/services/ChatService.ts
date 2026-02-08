import { Context, Effect, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { MessageNotFoundError, ThreadNotFoundError } from '../app/Error';
import { Attachment, ChatMessage, ChatMetadata, ChatThread } from '../app/Schema';
import { branchThreadPath, createInitialThread, generateThreadTitle, getMessagePath } from '../helpers/ThreadHelper';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { formatError, randomId } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';
import { StoreService } from './StoreService';

export interface ChatService {
  readonly createThread: () => Effect.Effect<ChatMetadata>;
  readonly deleteThread: (id: string) => Effect.Effect<void>;
  readonly deleteThreads: (ids: Set<string>) => Effect.Effect<void>;
  readonly importThreads: (threads: Record<string, ChatThread>) => Effect.Effect<void>;
  readonly addMessage: (threadId: string, message: ChatMessage) => Effect.Effect<void, ThreadNotFoundError>;
  readonly updateMessage: (
    threadId: string,
    messageId: string,
    content: string,
    isError?: boolean,
    skipUpdateTimestamp?: boolean,
    uiOnly?: boolean,
    metadataOnly?: boolean,
  ) => Effect.Effect<void, ThreadNotFoundError | MessageNotFoundError>;
  readonly deleteMessage: (threadId: string, messageId: string) => Effect.Effect<void, ThreadNotFoundError | MessageNotFoundError>;
  readonly renameThread: (threadId: string, title: string) => Effect.Effect<void, ThreadNotFoundError>;
  readonly updateThread: (
    threadId: string,
    f: (thread: ChatThread, now: number) => ChatThread,
    options?: {
      readonly skipUpdateTimestamp?: boolean;
      readonly metadataOnly?: boolean;
    },
  ) => Effect.Effect<void, ThreadNotFoundError>;
  readonly updateActiveThread: (
    f: (thread: ChatThread, now: number) => ChatThread,
    skipUpdateTimestamp?: boolean,
  ) => Effect.Effect<void, ThreadNotFoundError>;
  readonly getThreadPath: (threadId: string, messageId: string) => Effect.Effect<ReadonlyArray<ChatMessage>, ThreadNotFoundError>;
  readonly branchChat: (threadId: string, messageId: string) => Effect.Effect<ChatMetadata, ThreadNotFoundError | MessageNotFoundError>;
  readonly generate: (threadId: string, messagesToProcess: ReadonlyArray<ChatMessage>) => Effect.Effect<void>;
  readonly stop: (threadId?: string) => Effect.Effect<void>;
  readonly sendMessage: (content: string, attachments?: ReadonlyArray<Attachment>) => Effect.Effect<void>;
  readonly regenerateMessage: (threadId: string, messageId: string) => Effect.Effect<void>;
}

export const ChatService = Context.GenericTag<ChatService>('@services/ChatService');

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const store = yield* StoreService;
    const storage = yield* StorageService;
    const llm = yield* LLMProvider;
    const fibers = new Map<string, Fiber.Fiber<void, ThreadNotFoundError | MessageNotFoundError>>();

    const updateThread = (
      threadId: string,
      f: (thread: ChatThread, now: number) => ChatThread,
      options: { readonly skipUpdateTimestamp?: boolean; readonly metadataOnly?: boolean } = {},
    ) =>
      Effect.gen(function* () {
        const now = Date.now();
        const thread = yield* store.getThread(threadId);

        if (!thread) return yield* Effect.fail(new ThreadNotFoundError({ threadId }));

        const updated = f(thread, now);
        const finalUpdated: ChatThread = options.skipUpdateTimestamp ? updated : { ...updated, updatedAt: now };
        const metadata = yield* Schema.decode(ChatMetadata)(finalUpdated).pipe(Effect.orDie);

        const state = yield* SubscriptionRef.get(store.state);
        const isActive = state.activeThreadId === threadId && state.activeThread?.id === threadId;

        const storeUpdate = store.update((s) => ({
          ...s,
          threads: options.skipUpdateTimestamp ? s.threads : { ...s.threads, [threadId]: metadata },
          activeThread: isActive ? finalUpdated : s.activeThread,
        }));

        const storageUpdate = storage.saveThread(options.metadataOnly ? metadata : finalUpdated);

        yield* Effect.all([storeUpdate, storageUpdate], { discard: true });
      }).pipe(
        Effect.catchAll((err) => {
          if (err instanceof ThreadNotFoundError) return Effect.fail(err);
          return store.notify('error', formatError(err)).pipe(Effect.flatMap(() => Effect.fail(err)));
        }),
      );

    const updateActiveThread = (f: (thread: ChatThread, now: number) => ChatThread, skipUpdateTimestamp = false) =>
      Effect.gen(function* () {
        const activeId = (yield* SubscriptionRef.get(store.state)).activeThreadId;
        if (!activeId) return yield* Effect.fail(new ThreadNotFoundError({ threadId: 'active' }));
        return yield* updateThread(activeId, f, { skipUpdateTimestamp });
      });

    const stop = (threadId?: string) =>
      Effect.gen(function* () {
        if (threadId) {
          const fiber = fibers.get(threadId);
          if (fiber) {
            yield* Fiber.interrupt(fiber);
            fibers.delete(threadId);
          }
        } else {
          for (const fiber of fibers.values()) {
            yield* Fiber.interrupt(fiber);
          }
          fibers.clear();
        }
      });

    const generate = (threadId: string, messagesToProcess: ReadonlyArray<ChatMessage>) =>
      Effect.gen(function* () {
        const state = yield* SubscriptionRef.get(store.state);
        const settings = state.settings;
        const threadHeader = state.threads[threadId];

        if (!threadHeader) return;

        yield* stop(threadId);

        yield* store.update((s) => ({
          ...s,
          backgroundThreadIds: [...new Set([...s.backgroundThreadIds, threadId])],
        }));

        const id = randomId();
        const assistantMessage: ChatMessage = {
          id,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          parentId: messagesToProcess[messagesToProcess.length - 1]?.id,
        };

        const streamEffect = Effect.gen(function* () {
          yield* chatService.addMessage(threadId, assistantMessage);

          const thread = yield* storage.getThread(threadId);
          if (!thread) return;

          const systemPrompt = synthesizeSystemPrompt(settings, thread);
          const model = thread.general.model || settings.model;

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
          let lastUITime = Date.now();
          let lastSaveTime = Date.now();

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
                yield* chatService.updateMessage(threadId, id, fullContent, false, true, true, false);
              }

              // Throttle Storage updates to prevent IDB write bottleneck
              if (now - lastSaveTime > STORAGE_SAVE_INTERVAL) {
                lastSaveTime = now;
                lastSavedContent = fullContent;
                yield* chatService.updateMessage(threadId, id, fullContent, false, true, false, false);
              }
            }),
          );

          // Ensure final state is synchronized to both UI and Storage
          if (fullContent !== lastUISaveContent) {
            yield* chatService.updateMessage(threadId, id, fullContent, false, true, true, false);
          }
          if (fullContent !== lastSavedContent) {
            yield* chatService.updateMessage(threadId, id, fullContent, false, true, false, false);
          }

          // Update timestamp once when stream is finished
          yield* chatService.updateMessage(threadId, id, fullContent, false, false, false, true);
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              const msg = formatError(err);
              yield* chatService.updateMessage(threadId, id, `*[Error: ${msg}]*`, true);
              yield* store.notify('error', `Chat error: ${msg}`);
            }),
          ),
          Effect.ensuring(
            Effect.gen(function* () {
              fibers.delete(threadId);
              const currentState = yield* SubscriptionRef.get(store.state);
              yield* store.update((s) => ({
                ...s,
                backgroundThreadIds: s.backgroundThreadIds.filter((sid) => sid !== threadId),
              }));

              if (currentState.activeThreadId !== threadId) {
                yield* store.notify('success', `Response generated for "${threadHeader.title}"`);
              }
            }),
          ),
        );

        const fiber = yield* Effect.forkDaemon(streamEffect);
        fibers.set(threadId, fiber);
      });

    const chatService: ChatService = ChatService.of({
      updateThread,
      generate,
      stop,
      sendMessage: (content, attachments = []) =>
        Effect.gen(function* () {
          const { activeThreadId, activeThread } = yield* SubscriptionRef.get(store.state);
          let targetThreadId = activeThreadId;

          if (!targetThreadId) {
            const thread = yield* chatService.createThread();
            targetThreadId = thread.id;
          }

          const userMessage: ChatMessage = {
            id: randomId(),
            role: 'user',
            content,
            attachments: [...attachments],
            timestamp: Date.now(),
            parentId: activeThread?.activeMessageId,
          };

          yield* chatService.addMessage(targetThreadId, userMessage);
          const history = yield* chatService.getThreadPath(targetThreadId, userMessage.id);
          yield* chatService.generate(targetThreadId, history);
        }).pipe(Effect.orDie),
      regenerateMessage: (threadId, messageId) =>
        Effect.gen(function* () {
          const { activeThread } = yield* SubscriptionRef.get(store.state);
          if (!activeThread || activeThread.id !== threadId) return;

          const originalMessage = activeThread.messages[messageId];
          if (!originalMessage) return;

          const history =
            originalMessage.role === 'assistant'
              ? originalMessage.parentId
                ? yield* chatService.getThreadPath(threadId, originalMessage.parentId)
                : []
              : yield* chatService.getThreadPath(threadId, messageId);

          yield* chatService.generate(threadId, history);
        }).pipe(Effect.orDie),
      createThread: () =>
        Effect.gen(function* () {
          const { settings, availableModels } = yield* SubscriptionRef.get(store.state);
          const newThread = createInitialThread(settings, availableModels);
          const metadata = yield* Schema.decode(ChatMetadata)(newThread).pipe(Effect.orDie);

          yield* store.update((state) => ({
            ...state,
            threads: { [newThread.id]: metadata, ...state.threads },
            activeThreadId: newThread.id,
            activeThread: newThread,
          }));

          yield* storage.saveThread(newThread);
          return metadata;
        }),

      deleteThread: (id) =>
        Effect.gen(function* () {
          yield* stop(id);
          yield* store.update((state) => {
            const { [id]: _, ...threads } = state.threads;
            return {
              ...state,
              threads,
              activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
              activeThread: state.activeThreadId === id ? null : state.activeThread,
            };
          });
          yield* storage.deleteThread(id);
        }),

      deleteThreads: (ids) =>
        Effect.gen(function* () {
          for (const id of ids) {
            yield* stop(id);
          }
          yield* store.update((state) => {
            const threads = { ...state.threads };
            ids.forEach((id) => delete threads[id]);
            const isActiveDeleted = state.activeThreadId && ids.has(state.activeThreadId);
            return {
              ...state,
              threads,
              activeThreadId: isActiveDeleted ? null : state.activeThreadId,
              activeThread: isActiveDeleted ? null : state.activeThread,
            };
          });
          for (const id of ids) {
            yield* storage.deleteThread(id);
          }
        }),

      importThreads: (threads) =>
        Effect.gen(function* () {
          const metadatas: Record<string, ChatMetadata> = {};
          const saveEffects: Effect.Effect<void>[] = [];

          for (const [id, thread] of Object.entries(threads)) {
            metadatas[id] = yield* Schema.decode(ChatMetadata)(thread).pipe(Effect.orDie);
            saveEffects.push(storage.saveThread(thread));
          }

          yield* Effect.all(
            [
              store.update((s) => ({
                ...s,
                threads: { ...s.threads, ...metadatas },
              })),
              ...saveEffects,
            ],
            { discard: true },
          );
        }),

      addMessage: (threadId, message) =>
        Effect.gen(function* () {
          let messagesToSave: ChatMessage[] = [message];
          yield* updateThread(threadId, (thread) => {
            const messages = { ...thread.messages };
            let parent: ChatMessage | undefined;

            if (message.parentId && messages[message.parentId]) {
              const p = messages[message.parentId];
              parent = {
                ...p,
                childrenIds: [...(p.childrenIds || []), message.id],
              };
              messages[message.parentId] = parent;
              messagesToSave.push(parent);
            }

            messages[message.id] = message;

            return {
              ...thread,
              messages,
              activeMessageId: message.id,
              title: generateThreadTitle(thread, message),
            };
          });

          yield* storage.saveMessages(threadId, messagesToSave);
        }),

      updateMessage: (threadId, messageId, content, isError, skipUpdateTimestamp, uiOnly, metadataOnly) =>
        Effect.gen(function* () {
          let updatedMessage: ChatMessage | undefined;

          if (metadataOnly) {
            yield* updateThread(threadId, (s) => s);
            return;
          }

          yield* updateThread(
            threadId,
            (thread) => {
              const msg = thread.messages[messageId];
              if (!msg) return thread;
              updatedMessage = { ...msg, content, isError };
              return {
                ...thread,
                messages: {
                  ...thread.messages,
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
            yield* storage.saveMessage(threadId, updatedMessage);
          }
        }),

      deleteMessage: (threadId, messageId) =>
        Effect.gen(function* () {
          let idsToDelete: string[] = [];
          let updatedParent: ChatMessage | undefined;

          yield* updateThread(threadId, (thread) => {
            const messageToDelete = thread.messages[messageId];
            if (!messageToDelete) return thread;

            const messages = { ...thread.messages };
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

            const activeMessageId = idsToDelete.includes(thread.activeMessageId || '')
              ? messageToDelete.parentId || Object.keys(messages).pop()
              : thread.activeMessageId;

            return { ...thread, messages, activeMessageId };
          });

          if (idsToDelete.length > 0) {
            for (const id of idsToDelete) {
              yield* storage.deleteMessage(id);
            }
            if (updatedParent) {
              yield* storage.saveMessage(threadId, updatedParent);
            }
          }
        }).pipe(
          Effect.catchAll((err) => {
            if (err instanceof ThreadNotFoundError) return Effect.fail(err);
            return store.notify('error', `Failed to delete message: ${formatError(err)}`).pipe(Effect.flatMap(() => Effect.fail(err)));
          }),
        ),

      renameThread: (threadId, title) => updateThread(threadId, (thread) => ({ ...thread, title }), { metadataOnly: true }),

      updateActiveThread,

      getThreadPath: (threadId, messageId) =>
        Effect.gen(function* () {
          const thread = yield* store.getThread(threadId);

          if (!thread) {
            return yield* Effect.fail(new ThreadNotFoundError({ threadId }));
          }

          return getMessagePath(thread, messageId);
        }),

      branchChat: (threadId, messageId) =>
        Effect.gen(function* () {
          const sourceThread = yield* store.getThread(threadId);

          if (!sourceThread) return yield* Effect.fail(new ThreadNotFoundError({ threadId }));
          if (!sourceThread.messages[messageId]) return yield* Effect.fail(new MessageNotFoundError({ messageId }));

          const { branchedMessages, newActiveMessageId } = branchThreadPath(sourceThread, messageId);
          const now = Date.now();
          const id = randomId();

          const newThread: ChatThread = {
            ...sourceThread,
            id,
            title: `${sourceThread.title} (Branch)`,
            messages: branchedMessages,
            activeMessageId: newActiveMessageId,
            createdAt: now,
            updatedAt: now,
          };

          const metadata = yield* Schema.decode(ChatMetadata)(newThread).pipe(Effect.orDie);
          yield* store.update((s) => ({
            ...s,
            threads: { [id]: metadata, ...s.threads },
            activeThreadId: id,
            activeThread: newThread,
          }));

          yield* storage.saveThread(newThread);
          yield* storage.saveMessages(id, Object.values(branchedMessages));

          return newThread;
        }),
    });

    // Handle thread resumption
    yield* Effect.gen(function* () {
      const state = yield* SubscriptionRef.get(store.state);
      for (const threadId of state.backgroundThreadIds) {
        const thread = yield* store.getThread(threadId);
        if (!thread) continue;

        const messages = Object.values(thread.messages).sort((a, b) => b.timestamp - a.timestamp);
        const lastMessage = messages[0];
        const lastUserMessage = messages.find((m) => m.role === 'user');

        if (lastMessage && lastUserMessage) {
          if (lastMessage.role === 'assistant' && !lastMessage.isError) {
            // It was an assistant message (empty or partial) that was interrupted
            yield* chatService.deleteMessage(threadId, lastMessage.id);
            const path = getMessagePath(thread, lastUserMessage.id);
            yield* chatService.generate(threadId, path);
          } else if (lastMessage.role === 'user') {
            // It was a user message that hadn't triggered generate yet
            const path = getMessagePath(thread, lastMessage.id);
            yield* chatService.generate(threadId, path);
          } else {
            // Clear stale loading state for finished or errored messages
            yield* store.update((s) => ({
              ...s,
              backgroundThreadIds: s.backgroundThreadIds.filter((id) => id !== threadId),
            }));
          }
        } else {
          // No valid state to resume
          yield* store.update((s) => ({
            ...s,
            backgroundThreadIds: s.backgroundThreadIds.filter((id) => id !== threadId),
          }));
        }
      }
    }).pipe(Effect.forkDaemon);

    return chatService;
  }),
);
