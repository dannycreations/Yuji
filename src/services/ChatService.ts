import { Context, Effect, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { MessageNotFoundError, ThreadNotFoundError } from '../app/Error';
import { Attachment, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';
import { branchThreadPath, createInitialThread, generateThreadTitle, getMessagePath } from '../helpers/ThreadHelper';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { formatError, randomId } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';
import { StoreService } from './StoreService';
import { ToolService } from './ToolService';

import type { ToolCall } from '../app/Schema';

export interface ChatService {
  readonly createThread: (mode?: 'chat' | 'agent') => Effect.Effect<ThreadMetadata, Error>;
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
    options?: {
      readonly instruction?: string;
    },
  ) => Effect.Effect<void>;
  readonly stop: (threadId?: string) => Effect.Effect<void>;
  readonly sendMessage: (
    content: string,
    attachments?: ReadonlyArray<Attachment>,
    options?: {
      readonly instruction?: string;
    },
  ) => Effect.Effect<void, ThreadNotFoundError | Error>;
  readonly regenerateMessage: (
    threadId: string,
    messageId: string,
    options?: {
      readonly instruction?: string;
    },
  ) => Effect.Effect<void, Error>;
  readonly editMessage: (
    threadId: string,
    messageId: string,
    content: string,
    options?: {
      readonly attachments?: ReadonlyArray<Attachment>;
      readonly generateNext?: boolean;
      readonly instruction?: string;
    },
  ) => Effect.Effect<void, Error>;
}

export const ChatService = Context.GenericTag<ChatService>('@services/ChatService');

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const store = yield* StoreService;
    const storage = yield* StorageService;
    const llm = yield* LLMProvider;
    const tools = yield* ToolService;
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

        const getBaseThread = () => {
          const isActive = s.activeThreadId === threadId && s.activeThread?.id === threadId;
          if (isActive) {
            return Effect.succeed(s.activeThread);
          }

          if (options.metadataOnly) {
            return storage.getThreadMetadata(threadId);
          }

          return storage.getThread(threadId);
        };

        const thread = yield* getBaseThread();

        if (!thread) {
          return yield* Effect.fail(new ThreadNotFoundError({ threadId }));
        }

        const updated = f(thread as Thread, now);
        const finalThread = options.skipUpdateTimestamp ? updated : { ...updated, updatedAt: now };

        yield* store.update((s) => {
          const isTargetActive = s.activeThreadId === threadId;

          if (options.uiOnly && isTargetActive && options.skipUpdateTimestamp) {
            if (s.activeThread === finalThread) {
              return s;
            }

            return { ...s, activeThread: finalThread };
          }

          const prevMeta = s.threads[threadId];

          const isMetadataChanged =
            !options.skipUpdateTimestamp ||
            !prevMeta ||
            finalThread.title !== prevMeta.title ||
            finalThread.activeMessageId !== prevMeta.activeMessageId ||
            finalThread.archived !== prevMeta.archived ||
            finalThread.updatedAt !== prevMeta.updatedAt;

          let nextThreads = s.threads;

          if (isMetadataChanged) {
            nextThreads = {
              ...s.threads,
              [threadId]: {
                id: finalThread.id,
                title: finalThread.title,
                mode: finalThread.mode,
                createdAt: finalThread.createdAt,
                updatedAt: finalThread.updatedAt,
                activeMessageId: finalThread.activeMessageId,
                archived: finalThread.archived,
              } satisfies ThreadMetadata,
            };
          }

          const isStateUnchanged = isTargetActive && s.activeThread === finalThread && s.threads === nextThreads;

          if (isStateUnchanged) {
            return s;
          }

          const nextSettings = isTargetActive ? { ...s.settings, model: finalThread.general.model || s.settings.model } : s.settings;

          return {
            ...s,
            threads: nextThreads,
            activeThread: isTargetActive ? finalThread : s.activeThread,
            settings: nextSettings,
          };
        });

        if (options.uiOnly) {
          return;
        }

        if (options.metadataOnly) {
          return yield* storage.patchThread(threadId, {
            title: finalThread.title,
            mode: finalThread.mode,
            updatedAt: finalThread.updatedAt,
            activeMessageId: finalThread.activeMessageId,
            archived: finalThread.archived,
          });
        }

        if (!options.skipUpdateTimestamp) {
          return yield* storage.saveThread(finalThread);
        }

        return yield* storage.patchThread(threadId, {
          title: finalThread.title,
          mode: finalThread.mode,
          activeMessageId: finalThread.activeMessageId,
          archived: finalThread.archived,
        });
      });

    const stop = (threadId?: string) =>
      Effect.gen(function* () {
        if (!threadId) {
          const allFibers = Array.from(fibers.values());
          fibers.clear();
          const interruptAll = Effect.all(allFibers.map(Fiber.interrupt), {
            concurrency: 'unbounded',
            discard: true,
          });
          return yield* interruptAll;
        }

        const fiber = fibers.get(threadId);
        if (!fiber) {
          return;
        }

        fibers.delete(threadId);
        yield* Fiber.interrupt(fiber);
      });

    const generate = (threadId: string, messagesToProcess: ReadonlyArray<ThreadMessage>, options: { readonly instruction?: string } = {}) =>
      Effect.gen(function* () {
        const state = yield* SubscriptionRef.get(store.state);
        const settings = state.settings;
        const threadHeader = state.threads[threadId];

        if (!threadHeader) {
          return;
        }

        yield* stop(threadId);

        yield* store.update((s) => ({
          ...s,
          backgroundThreadIds: [...new Set([...s.backgroundThreadIds, threadId])],
        }));

        const streamEffect = Effect.gen(function* () {
          let currentPath = messagesToProcess;
          let turnCount = 0;
          const MAX_TURNS = 20;

          while (turnCount < MAX_TURNS) {
            turnCount++;
            const id = randomId();
            const lastMsg = currentPath[currentPath.length - 1];
            const assistantMessage: ThreadMessage = {
              id,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              parentId: lastMsg?.id,
            };

            yield* chat.addMessage(threadId, assistantMessage);

            const thread = yield* storage.getThread(threadId);
            if (!thread) {
              return;
            }

            let systemPrompt = synthesizeSystemPrompt(settings, thread);
            if (options.instruction) {
              systemPrompt += `\n\n## Priority instruction for this response\n\n${options.instruction}`;
            }

            const model = thread.general.model || settings.model;
            const activeTools =
              threadHeader.mode === 'agent'
                ? state.availableTools.filter((t) => t.function && !settings.disabledTools.includes(t.function.name))
                : undefined;

            const stream = yield* llm.streamCompletion(
              currentPath,
              settings,
              {
                provider: 'openai',
                model,
                temperature: 0.7,
                tools: activeTools,
              },
              systemPrompt,
            );

            let fullContent = '';
            let toolCallsAccumulator: ToolCall[] = [];
            let lastSavedContent = '';
            let lastUISaveContent = '';
            let lastUITime = 0;
            let lastSaveTime = 0;

            const UI_UPDATE_INTERVAL = 60;
            const STORAGE_SAVE_INTERVAL = 3000;

            yield* Stream.runForEach(stream, (token) =>
              Effect.gen(function* () {
                if (token.startsWith('TOOL_CALLS:')) {
                  const delta = JSON.parse(token.slice(11));
                  for (const d of delta) {
                    if (d.index === undefined) {
                      continue;
                    }

                    const idx = d.index;
                    const current = toolCallsAccumulator[idx];

                    if (!current) {
                      toolCallsAccumulator[idx] = {
                        id: d.id ?? '',
                        type: 'function',
                        function: {
                          name: d.function?.name ?? '',
                          arguments: d.function?.arguments ?? '',
                        },
                      };

                      continue;
                    }

                    const nextName = current.function.name + (d.function?.name ?? '');
                    const nextArguments = current.function.arguments + (d.function?.arguments ?? '');

                    toolCallsAccumulator[idx] = {
                      ...current,
                      id: d.id ?? current.id,
                      function: {
                        ...current.function,
                        name: nextName,
                        arguments: nextArguments,
                      },
                    };
                  }
                  return;
                }

                fullContent += token;
                const now = performance.now();
                const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;

                if (isVisible && now - lastUITime >= UI_UPDATE_INTERVAL) {
                  lastUITime = now;
                  lastUISaveContent = fullContent;

                  yield* chat.updateMessage(threadId, id, fullContent, {
                    skipUpdateTimestamp: true,
                    uiOnly: true,
                  });
                }

                if (now - lastSaveTime >= STORAGE_SAVE_INTERVAL) {
                  lastSaveTime = now;
                  lastSavedContent = fullContent;

                  yield* chat.updateMessage(threadId, id, fullContent, {
                    skipUpdateTimestamp: true,
                  });
                }
              }),
            );

            if (fullContent !== lastUISaveContent) {
              yield* chat.updateMessage(threadId, id, fullContent, {
                skipUpdateTimestamp: true,
                uiOnly: true,
              });
            }

            if (fullContent !== lastSavedContent) {
              yield* chat.updateMessage(threadId, id, fullContent, {
                skipUpdateTimestamp: true,
              });
            }

            yield* chat.updateMessage(threadId, id, fullContent, { metadataOnly: true });

            if (toolCallsAccumulator.length === 0) {
              break;
            }

            const cleanToolCalls = toolCallsAccumulator.filter(Boolean);
            yield* chat.updateMessage(threadId, id, fullContent, {
              skipUpdateTimestamp: true,
              uiOnly: false,
            });

            yield* updateThread(threadId, (t) => {
              const msg = t.messages[id];
              if (!msg) {
                return t;
              }

              return {
                ...t,
                messages: {
                  ...t.messages,
                  [id]: { ...msg, toolCalls: cleanToolCalls },
                },
              };
            });

            const toolRequests = cleanToolCalls.map((call) => {
              try {
                return {
                  id: call.id,
                  name: call.function.name,
                  arguments: JSON.parse(call.function.arguments || '{}'),
                };
              } catch (e) {
                return {
                  id: call.id,
                  name: call.function.name,
                  arguments: {},
                  parseError: `Invalid JSON in arguments: ${formatError(e)}`,
                };
              }
            });

            const validRequests = toolRequests.filter((r) => !('parseError' in r));
            const failedRequests = toolRequests.filter((r) => 'parseError' in r);

            const toolResults = yield* tools.execute(validRequests, settings);
            const finalResults = [...toolResults, ...failedRequests.map((r) => ({ id: r.id, error: r.parseError }))];

            let lastToolMsgId = id;
            for (const res of finalResults) {
              const toolMessage: ThreadMessage = {
                id: randomId(),
                role: 'tool',
                content:
                  'error' in res
                    ? `Error: ${res.error}`
                    : typeof (res as { result: unknown }).result === 'string'
                      ? (res as { result: string }).result
                      : JSON.stringify((res as { result: unknown }).result),
                timestamp: Date.now(),
                parentId: lastToolMsgId,
                toolCallId: res.id,
              };

              yield* chat.addMessage(threadId, toolMessage);
              lastToolMsgId = toolMessage.id;
            }

            const updatedThread = yield* storage.getThread(threadId);
            if (!updatedThread) {
              return;
            }
            currentPath = getMessagePath(updatedThread, lastToolMsgId);
          }
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              const msg = formatError(err);
              const { activeThread } = yield* SubscriptionRef.get(store.state);
              const lastMsgId = activeThread?.id === threadId ? activeThread.activeMessageId : undefined;
              if (lastMsgId) {
                yield* chat.updateMessage(threadId, lastMsgId, `*[Error: ${msg}]*`, { isError: true });
              }

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
          let state = yield* SubscriptionRef.get(store.state);
          let targetThreadId = state.activeThreadId;

          if (!targetThreadId) {
            const thread = yield* chat.createThread();
            targetThreadId = thread.id;
            state = yield* SubscriptionRef.get(store.state);
          }

          const userMessage: ThreadMessage = {
            id: randomId(),
            role: 'user',
            content,
            attachments: [...attachments],
            timestamp: Date.now(),
            parentId: state.activeThread?.activeMessageId,
          };

          yield* chat.addMessage(targetThreadId, userMessage);
          const history = yield* chat.getThreadPath(targetThreadId, userMessage.id);
          yield* chat.generate(targetThreadId, history, options);
        }),
      regenerateMessage: (threadId, messageId, options) =>
        Effect.gen(function* () {
          const { activeThread } = yield* SubscriptionRef.get(store.state);

          if (!activeThread) {
            return;
          }

          if (activeThread.id !== threadId) {
            return;
          }

          const originalMessage = activeThread.messages[messageId];

          if (!originalMessage) {
            return;
          }

          const history = yield* chat.getThreadPath(threadId, messageId);

          if (history.length === 0) {
            return;
          }

          const lastMessage = history[history.length - 1];
          if (lastMessage.role !== 'assistant') {
            yield* chat.generate(threadId, history, options);
            return;
          }

          const context = history.slice(0, -1);
          yield* chat.generate(threadId, context, options);
        }),
      editMessage: (threadId, messageId, content, options) =>
        Effect.gen(function* () {
          const { activeThread } = yield* SubscriptionRef.get(store.state);
          if (!activeThread) {
            return;
          }

          if (activeThread.id !== threadId) {
            return;
          }

          const oldMessage = activeThread.messages[messageId];
          if (!oldMessage) {
            return;
          }

          const newMsgId = randomId();
          const nextAttachments = options?.attachments ? [...options.attachments] : oldMessage.attachments;

          const newMessage: ThreadMessage = {
            ...oldMessage,
            id: newMsgId,
            content,
            attachments: nextAttachments,
            timestamp: Date.now(),
            parentId: oldMessage.parentId,
            childrenIds: [],
          };

          yield* chat.addMessage(threadId, newMessage);

          if (!options?.generateNext) {
            return;
          }

          const history = yield* chat.getThreadPath(threadId, newMsgId);
          yield* chat.generate(threadId, history, options);
        }),
      createThread: (mode) =>
        Effect.gen(function* () {
          const { settings, availableModels, availableTools } = yield* SubscriptionRef.get(store.state);
          const targetMode = mode ?? settings.mode;
          const finalMode = targetMode === 'agent' && availableTools.length === 0 ? 'chat' : targetMode;

          const newThread = createInitialThread({ ...settings, mode: finalMode }, availableModels);
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

          if (len === 0) {
            return;
          }

          const stopAll = Effect.all(ids.map(stop), {
            concurrency: 'unbounded',
            discard: true,
          });

          yield* stopAll;

          const idSet = new Set(ids);
          yield* store.update((state) => {
            const threads = { ...state.threads };
            for (const id of ids) delete threads[id];
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
            if (thread.messages) {
              saveEffects.push(storage.saveMessages(id, Object.values(thread.messages)));
            }
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

            const p = message.parentId ? messages[message.parentId] : undefined;
            if (p) {
              const parent: ThreadMessage = {
                ...p,
                childrenIds: [...(p.childrenIds || []), message.id],
              };
              messages[message.parentId!] = parent;
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
              if (!msg) {
                return thread;
              }

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
                  [messageId]: updatedMessage,
                },
              };
            },
            {
              skipUpdateTimestamp: options.skipUpdateTimestamp,
              uiOnly: options.uiOnly,
            },
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
          const idsToDelete = yield* storage.getDescendantIds(threadId, messageId);
          let updatedParent: ThreadMessage | undefined;

          yield* updateThread(
            threadId,
            (thread) => {
              const messageToDelete = thread.messages[messageId];
              if (!messageToDelete) {
                return thread;
              }

              const messages = { ...thread.messages };
              for (const id of idsToDelete) {
                delete messages[id];
              }

              const parentId = messageToDelete.parentId;
              const p = parentId ? messages[parentId] : undefined;
              if (p) {
                updatedParent = {
                  ...p,
                  childrenIds: p.childrenIds?.filter((id) => id !== messageId),
                };
                messages[parentId!] = updatedParent;
              }

              let activeMessageId = thread.activeMessageId;
              if (activeMessageId && idsToDelete.includes(activeMessageId)) {
                activeMessageId = messageToDelete.parentId || Object.keys(messages).pop();
              }

              return {
                ...thread,
                messages,
                activeMessageId,
              };
            },
            { metadataOnly: false },
          );

          if (idsToDelete.length === 0) {
            return;
          }

          yield* storage.deleteMessages(threadId, idsToDelete);
          if (updatedParent) {
            yield* storage.saveMessages(threadId, [updatedParent]);
          }
        }),
      renameThread: (threadId, title) => updateThread(threadId, (thread) => ({ ...thread, title }), { metadataOnly: true }),
      updateActiveThread: (f: (thread: Thread, now: number) => Thread, skipUpdateTimestamp = false) =>
        Effect.gen(function* () {
          const activeId = (yield* SubscriptionRef.get(store.state)).activeThreadId;
          if (!activeId) {
            return yield* Effect.fail(new ThreadNotFoundError({ threadId: 'active' }));
          }

          return yield* updateThread(activeId, f, { skipUpdateTimestamp });
        }),
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

          if (!sourceThread) {
            return yield* Effect.fail(new ThreadNotFoundError({ threadId }));
          }

          if (!sourceThread.messages[messageId]) {
            return yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

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
        if (!thread) {
          continue;
        }

        const messages = thread.messages ? Object.values(thread.messages).sort((a, b) => b.timestamp - a.timestamp) : [];
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
