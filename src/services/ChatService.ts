import { Context, Effect, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SYSTEM_PROMPT } from '../app/Constant';
import { MessageNotFoundError, ThreadNotFoundError } from '../app/Error';
import { ChatMessage, ChatMetadata, ChatThread } from '../app/Schema';
import { getModelId } from '../helpers/ModelHelper';
import { getMessagePath } from '../helpers/ThreadHelper';
import { LLMProvider, synthesizeSystemPrompt } from '../providers/LLMProvider';
import { truncate, uuid } from '../utilities/CommonUtil';
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
        const state = yield* SubscriptionRef.get(store.state);
        let thread: ChatThread | null = null;

        const isActive = state.activeThreadId === threadId && state.activeThread?.id === threadId;
        if (isActive) {
          thread = state.activeThread;
        } else if (!options.metadataOnly) {
          thread = yield* storage.getThread(threadId);
        } else if (state.threads[threadId]) {
          thread = state.threads[threadId] as unknown as ChatThread;
        }

        if (!thread) return yield* Effect.fail(new ThreadNotFoundError({ threadId }));

        const updated = f(thread, now);
        const finalUpdated: ChatThread = options.skipUpdateTimestamp ? updated : { ...updated, updatedAt: now };
        const metadata = yield* Schema.decode(ChatMetadata)(finalUpdated).pipe(Effect.orDie);

        yield* store.update((s) => ({
          ...s,
          threads: { ...s.threads, [threadId]: metadata },
          activeThread: isActive ? finalUpdated : s.activeThread,
        }));

        yield* storage.saveThread(options.metadataOnly ? metadata : finalUpdated);
      }).pipe(
        Effect.catchAll((err) => {
          if (err instanceof ThreadNotFoundError) return Effect.fail(err);
          return store.notify('error', (err as { message: string })?.message || String(err)).pipe(Effect.flatMap(() => Effect.fail(err)));
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

        const id = crypto.randomUUID();
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
                yield* chatService.updateMessage(threadId, id, fullContent, false, true, true);
              }

              // Throttle Storage updates to prevent IDB write bottleneck
              if (now - lastSaveTime > STORAGE_SAVE_INTERVAL) {
                lastSaveTime = now;
                lastSavedContent = fullContent;
                yield* chatService.updateMessage(threadId, id, fullContent, false, true);
              }
            }),
          );

          // Ensure final state is synchronized to both UI and Storage
          if (fullContent !== lastUISaveContent) {
            yield* chatService.updateMessage(threadId, id, fullContent, false, true, true);
          }
          if (fullContent !== lastSavedContent) {
            yield* chatService.updateMessage(threadId, id, fullContent, false, true);
          }

          // Update timestamp once when stream is finished
          yield* chatService.updateThread(threadId, (s) => s);
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              const msg = (err as { message: string })?.message || String(err);
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
      createThread: () =>
        Effect.gen(function* () {
          const now = Date.now();
          const id = uuid();
          const { settings, availableModels } = yield* SubscriptionRef.get(store.state);
          const { personalisation } = settings;

          const newThread: ChatThread = {
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

          const metadata = yield* Schema.decode(ChatMetadata)(newThread).pipe(Effect.orDie);

          yield* store.update((state) => ({
            ...state,
            threads: { [id]: metadata, ...state.threads },
            activeThreadId: id,
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
          for (const [id, thread] of Object.entries(threads)) {
            metadatas[id] = yield* Schema.decode(ChatMetadata)(thread).pipe(Effect.orDie);
            yield* storage.saveThread(thread);
          }
          yield* store.update((s) => ({
            ...s,
            threads: { ...s.threads, ...metadatas },
          }));
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

            const title =
              (thread.title === 'New Chat' || thread.title.endsWith('...')) &&
              Object.keys(thread.messages).length === 0 &&
              message.role === 'user' &&
              message.content
                ? truncate(message.content.split('\n')[0], 40)
                : thread.title;

            return {
              ...thread,
              messages,
              activeMessageId: message.id,
              title,
            };
          });

          yield* storage.saveMessages(threadId, messagesToSave);
        }),

      updateMessage: (threadId, messageId, content, isError, skipUpdateTimestamp, uiOnly) =>
        Effect.gen(function* () {
          let updatedMessage: ChatMessage | undefined;
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

            let activeMessageId = thread.activeMessageId;
            if (idsToDelete.includes(activeMessageId || '')) {
              activeMessageId = messageToDelete.parentId || Object.keys(messages)[Object.keys(messages).length - 1];
            }

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
            const msg = (err as { message: string })?.message || String(err);
            return store.notify('error', `Failed to delete message: ${msg}`).pipe(Effect.flatMap(() => Effect.fail(err)));
          }),
        ),

      renameThread: (threadId, title) => updateThread(threadId, (thread) => ({ ...thread, title }), { metadataOnly: true }),

      updateActiveThread,

      getThreadPath: (threadId, messageId) =>
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(store.state);
          const thread = state.activeThreadId === threadId && state.activeThread ? state.activeThread : yield* storage.getThread(threadId);

          if (!thread) {
            return yield* Effect.fail(new ThreadNotFoundError({ threadId }));
          }

          return getMessagePath(thread, messageId);
        }),

      branchChat: (threadId, messageId) =>
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(store.state);
          const sourceThread = state.activeThreadId === threadId && state.activeThread ? state.activeThread : yield* storage.getThread(threadId);

          if (!sourceThread) {
            return yield* Effect.fail(new ThreadNotFoundError({ threadId }));
          }
          const targetMessage = sourceThread.messages[messageId];
          if (!targetMessage) {
            return yield* Effect.fail(new MessageNotFoundError({ messageId }));
          }

          const now = Date.now();
          const id = uuid();

          const path = getMessagePath(sourceThread, messageId);
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
          yield* store.update((state) => ({
            ...state,
            threads: { [id]: metadata, ...state.threads },
            activeThreadId: id,
            activeThread: newThread,
          }));

          yield* storage.saveThread(newThread);
          yield* storage.saveMessages(id, finalMessagesToSave);

          return newThread;
        }),
    });

    // Handle thread resumption
    yield* Effect.gen(function* () {
      const state = yield* SubscriptionRef.get(store.state);
      for (const threadId of state.backgroundThreadIds) {
        const thread = yield* storage.getThread(threadId);
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
