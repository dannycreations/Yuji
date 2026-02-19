import { Context, Effect, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { MessageNotFoundError, ThreadNotFoundError } from '../app/Error';
import { Attachment, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';
import { branchThreadPath, createInitialThread, generateThreadTitle, getMessagePath } from '../helpers/ThreadHelper';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { formatError, randomId } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';
import { StoreService } from './StoreService';

export interface ChatService {
  readonly createThread: () => Effect.Effect<ThreadMetadata, Error>;
  readonly deleteThreads: (ids: string | Iterable<string>) => Effect.Effect<void, Error>;
  readonly importThreads: (threads: Record<string, Thread>) => Effect.Effect<void, Error>;
  readonly addMessage: (threadId: string, message: ThreadMessage) => Effect.Effect<void, ThreadNotFoundError | Error>;
  readonly updateMessage: (
    threadId: string,
    messageId: string,
    content: string,
    options?: {
      readonly attachments?: ReadonlyArray<Attachment>;
      readonly isError?: boolean;
      readonly skipUpdateTimestamp?: boolean;
      readonly uiOnly?: boolean;
      readonly metadataOnly?: boolean;
    },
  ) => Effect.Effect<void, ThreadNotFoundError | MessageNotFoundError | Error>;
  readonly deleteMessage: (threadId: string, messageId: string) => Effect.Effect<void, ThreadNotFoundError | MessageNotFoundError | Error>;
  readonly renameThread: (threadId: string, title: string) => Effect.Effect<void, ThreadNotFoundError | Error>;
  readonly updateThread: (
    threadId: string,
    f: (thread: Thread, now: number) => Thread,
    options?: {
      readonly skipUpdateTimestamp?: boolean;
      readonly metadataOnly?: boolean;
    },
  ) => Effect.Effect<void, ThreadNotFoundError | Error>;
  readonly updateActiveThread: (
    f: (thread: Thread, now: number) => Thread,
    skipUpdateTimestamp?: boolean,
  ) => Effect.Effect<void, ThreadNotFoundError | Error>;
  readonly getThreadPath: (threadId: string, messageId: string) => Effect.Effect<ReadonlyArray<ThreadMessage>, ThreadNotFoundError | Error>;
  readonly branchChat: (threadId: string, messageId: string) => Effect.Effect<ThreadMetadata, ThreadNotFoundError | MessageNotFoundError | Error>;
  readonly generate: (
    threadId: string,
    messagesToProcess: ReadonlyArray<ThreadMessage>,
    options?: { readonly instruction?: string },
  ) => Effect.Effect<void>;
  readonly stop: (threadId?: string) => Effect.Effect<void>;
  readonly sendMessage: (
    content: string,
    attachments?: ReadonlyArray<Attachment>,
    options?: { readonly instruction?: string },
  ) => Effect.Effect<void>;
  readonly regenerateMessage: (
    threadId: string,
    messageId: string,
    options?: {
      readonly instruction?: string;
    },
  ) => Effect.Effect<void>;
}

export const ChatService = Context.GenericTag<ChatService>('@services/ChatService');

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const store = yield* StoreService;
    const storage = yield* StorageService;
    const llm = yield* LLMProvider;
    const fibers = new Map<string, Fiber.Fiber<void, ThreadNotFoundError | MessageNotFoundError | Error>>();

    const updateThread = (
      threadId: string,
      f: (thread: Thread, now: number) => Thread,
      options: {
        readonly skipUpdateTimestamp?: boolean;
        readonly metadataOnly?: boolean;
        readonly uiOnly?: boolean;
      } = {},
    ) =>
      Effect.gen(function* () {
        const now = Date.now();
        const s = yield* SubscriptionRef.get(store.state);

        const thread = s.activeThreadId === threadId && s.activeThread?.id === threadId ? s.activeThread : yield* storage.getThread(threadId);

        if (!thread) return yield* Effect.fail(new ThreadNotFoundError({ threadId }));

        const updated = f(thread, now);
        const finalThread = options.skipUpdateTimestamp ? updated : { ...updated, updatedAt: now };

        yield* store.update((s) => ({
          ...s,
          threads: options.skipUpdateTimestamp
            ? s.threads
            : {
                ...s.threads,
                [threadId]: {
                  id: finalThread.id,
                  title: finalThread.title,
                  createdAt: finalThread.createdAt,
                  updatedAt: finalThread.updatedAt,
                  activeMessageId: finalThread.activeMessageId,
                  archived: finalThread.archived,
                } satisfies ThreadMetadata,
              },
          activeThread: s.activeThreadId === threadId ? finalThread : s.activeThread,
        }));

        if (!options.uiOnly) {
          const finalMetadata = yield* Schema.decode(ThreadMetadata)(finalThread).pipe(Effect.orDie);
          yield* storage.patchThread(threadId, finalMetadata);

          if (!options.metadataOnly && !options.skipUpdateTimestamp) {
            yield* storage.saveThread(finalThread);
          }
        }
      });

    const updateActiveThread = (f: (thread: Thread, now: number) => Thread, skipUpdateTimestamp = false) =>
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
            fibers.delete(threadId);
            yield* Fiber.interrupt(fiber);
          }
        } else {
          const allFibers = Array.from(fibers.values());
          fibers.clear();
          yield* Effect.all(allFibers.map(Fiber.interrupt), { concurrency: 'unbounded', discard: true });
        }
      });

    const generate = (threadId: string, messagesToProcess: ReadonlyArray<ThreadMessage>, options: { readonly instruction?: string } = {}) =>
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
        const assistantMessage: ThreadMessage = {
          id,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          parentId: messagesToProcess[messagesToProcess.length - 1]?.id,
        };

        const streamEffect = Effect.gen(function* () {
          yield* chat.addMessage(threadId, assistantMessage);

          const thread = yield* storage.getThread(threadId);
          if (!thread) return;

          let systemPrompt = synthesizeSystemPrompt(settings, thread);

          if (options.instruction) {
            systemPrompt += `\n\n## Priority instruction for this response\n\n${options.instruction}`;
          }

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
          let lastUITime = performance.now();
          let lastSaveTime = performance.now();

          // ~20fps for smoother scrolling while still feeling responsive
          const UI_UPDATE_INTERVAL = 50;
          const STORAGE_SAVE_INTERVAL = 2000;

          yield* Stream.runForEach(stream, (token) =>
            Effect.gen(function* () {
              fullContent += token;
              const now = performance.now();

              // Throttle UI updates to prevent React reconciliation bottleneck
              if (now - lastUITime >= UI_UPDATE_INTERVAL) {
                lastUITime = now;
                lastUISaveContent = fullContent;
                yield* chat.updateMessage(threadId, id, fullContent, { skipUpdateTimestamp: true, uiOnly: true });
              }

              // Throttle Storage updates to prevent IDB write bottleneck
              if (now - lastSaveTime >= STORAGE_SAVE_INTERVAL) {
                lastSaveTime = now;
                lastSavedContent = fullContent;
                yield* chat.updateMessage(threadId, id, fullContent, { skipUpdateTimestamp: true });
              }
            }),
          );

          // Ensure final state is synchronized to both UI and Storage
          if (fullContent !== lastUISaveContent) {
            yield* chat.updateMessage(threadId, id, fullContent, { skipUpdateTimestamp: true, uiOnly: true });
          }
          if (fullContent !== lastSavedContent) {
            yield* chat.updateMessage(threadId, id, fullContent, { skipUpdateTimestamp: true });
          }

          // Update timestamp once when stream is finished
          yield* chat.updateMessage(threadId, id, fullContent, { metadataOnly: true });
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              const msg = formatError(err);
              yield* chat.updateMessage(threadId, id, `*[Error: ${msg}]*`, { isError: true });
              yield* store.notify('error', `Chat error: ${msg}`);
            }),
          ),
          Effect.ensuring(
            Effect.gen(function* () {
              fibers.delete(threadId);
              let wasActive = false;
              yield* store.update((s) => {
                wasActive = s.activeThreadId === threadId;
                return {
                  ...s,
                  backgroundThreadIds: s.backgroundThreadIds.filter((sid) => sid !== threadId),
                };
              });

              if (!wasActive) {
                yield* store.notify('success', `Response generated for "${threadHeader.title}"`);
              }
            }),
          ),
        );

        const fiber = yield* Effect.forkDaemon(streamEffect);
        fibers.set(threadId, fiber);
      });

    const chat: ChatService = ChatService.of({
      updateThread,
      generate,
      stop,
      sendMessage: (content, attachments = [], options) =>
        Effect.gen(function* () {
          const { activeThreadId, activeThread } = yield* SubscriptionRef.get(store.state);
          let targetThreadId = activeThreadId;

          if (!targetThreadId) {
            const thread = yield* chat.createThread();
            targetThreadId = thread.id;
          }

          const userMessage: ThreadMessage = {
            id: randomId(),
            role: 'user',
            content,
            attachments: [...attachments],
            timestamp: Date.now(),
            parentId: activeThread?.activeMessageId,
          };

          yield* chat.addMessage(targetThreadId, userMessage);
          const history = yield* chat.getThreadPath(targetThreadId, userMessage.id);
          yield* chat.generate(targetThreadId, history, options);
        }).pipe(
          Effect.catchAll((err) => store.notify('error', `Failed to send message: ${formatError(err)}`)),
          Effect.orDie,
        ),
      regenerateMessage: (threadId, messageId, options) =>
        Effect.gen(function* () {
          const { activeThread } = yield* SubscriptionRef.get(store.state);
          if (!activeThread || activeThread.id !== threadId) return;

          const originalMessage = activeThread.messages[messageId];
          if (!originalMessage) return;

          const history =
            originalMessage.role === 'assistant'
              ? originalMessage.parentId
                ? yield* chat.getThreadPath(threadId, originalMessage.parentId)
                : []
              : yield* chat.getThreadPath(threadId, messageId);

          yield* chat.generate(threadId, history, options);
        }).pipe(
          Effect.catchAll((err) => store.notify('error', `Failed to regenerate: ${formatError(err)}`)),
          Effect.orDie,
        ),
      createThread: () =>
        Effect.gen(function* () {
          const { settings, availableModels } = yield* SubscriptionRef.get(store.state);
          const newThread = createInitialThread(settings, availableModels);
          const metadata = yield* Schema.decode(ThreadMetadata)(newThread).pipe(Effect.orDie);

          yield* store.update((state) => ({
            ...state,
            threads: { [newThread.id]: metadata, ...state.threads },
            activeThreadId: newThread.id,
            activeThread: newThread,
          }));

          yield* storage.saveThread(newThread);
          return metadata;
        }),

      deleteThreads: (input) =>
        Effect.gen(function* () {
          const ids = typeof input === 'string' ? [input] : Array.from(input);
          const len = ids.length;
          if (len === 0) return;

          yield* Effect.all(ids.map(stop), { concurrency: 'unbounded', discard: true });

          const idSet = new Set(ids);
          yield* store.update((state) => {
            const threads = { ...state.threads };
            for (let i = 0; i < len; i++) delete threads[ids[i]];
            const activeId = state.activeThreadId;
            const isActiveDeleted = activeId && idSet.has(activeId);
            return {
              ...state,
              threads,
              activeThreadId: isActiveDeleted ? null : activeId,
              activeThread: isActiveDeleted ? null : state.activeThread,
            };
          });

          // Atomic batch delete from storage
          yield* storage.deleteThreads(ids);
        }),

      importThreads: (threads) =>
        Effect.gen(function* () {
          const metadatas: Record<string, ThreadMetadata> = {};
          const saveEffects: Effect.Effect<void, Error>[] = [];

          for (const [id, thread] of Object.entries(threads)) {
            metadatas[id] = yield* Schema.decode(ThreadMetadata)(thread).pipe(Effect.orDie);
            saveEffects.push(storage.saveThread(thread));
            saveEffects.push(storage.saveMessages(id, Object.values(thread.messages)));
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
          let messagesToSave: ThreadMessage[] = [message];
          yield* updateThread(threadId, (thread) => {
            const messages = { ...thread.messages };
            let parent: ThreadMessage | undefined;

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

      updateMessage: (threadId, messageId, content, options = {}) =>
        Effect.gen(function* () {
          let updatedMessage: ThreadMessage | undefined;

          if (options.metadataOnly) {
            yield* updateThread(threadId, (s) => s);
            return;
          }

          yield* updateThread(
            threadId,
            (thread) => {
              const msg = thread.messages[messageId];
              if (!msg) return thread;
              updatedMessage = {
                ...msg,
                content,
                attachments: options.attachments ?? msg.attachments,
                isError: options.isError,
              };
              return {
                ...thread,
                messages: {
                  ...thread.messages,
                  [messageId]: updatedMessage!,
                },
              };
            },
            { skipUpdateTimestamp: options.skipUpdateTimestamp },
          );

          if (!updatedMessage) {
            return yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

          if (!options.uiOnly) {
            yield* storage.saveMessages(threadId, [updatedMessage]);
          }
        }),

      deleteMessage: (threadId, messageId) =>
        Effect.gen(function* () {
          let idsToDelete: string[] = [];
          let updatedParent: ThreadMessage | undefined;

          yield* updateThread(threadId, (thread) => {
            const messageToDelete = thread.messages[messageId];
            if (!messageToDelete) return thread;

            const messages = { ...thread.messages };
            idsToDelete = [];
            const stack = [messageId];
            while (stack.length > 0) {
              const id = stack.pop()!;
              const msg = messages[id];
              if (msg) {
                idsToDelete.push(id);
                const children = msg.childrenIds;
                if (children) {
                  for (let i = 0, cLen = children.length; i < cLen; i++) {
                    stack.push(children[i]);
                  }
                }
              }
            }

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
            yield* storage.deleteMessages(idsToDelete);
            if (updatedParent) {
              yield* storage.saveMessages(threadId, [updatedParent]);
            }
          }
        }),

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

          const newThread: Thread = {
            ...sourceThread,
            id,
            title: `${sourceThread.title} (Branch)`,
            messages: branchedMessages,
            activeMessageId: newActiveMessageId,
            createdAt: now,
            updatedAt: now,
          };

          yield* chat.importThreads({ [id]: newThread });
          yield* store.setActiveThread(newThread);

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

        if (lastMessage?.role === 'assistant' && !lastMessage.isError) {
          yield* chat.deleteMessage(threadId, lastMessage.id);
          const path = lastUserMessage ? getMessagePath(thread, lastUserMessage.id) : [];
          if (path.length > 0) yield* chat.generate(threadId, path);
        } else if (lastMessage?.role === 'user') {
          yield* chat.generate(threadId, getMessagePath(thread, lastMessage.id));
        } else {
          yield* store.update((s) => ({
            ...s,
            backgroundThreadIds: s.backgroundThreadIds.filter((id) => id !== threadId),
          }));
        }
      }
    }).pipe(Effect.forkDaemon);

    return chat;
  }),
);
