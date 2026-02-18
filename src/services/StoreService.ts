import { Context, Effect, Either, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { YujiRuntime } from '../app/Runtime';
import { AppRuntimeState, AppStoreState, ConfirmOptions, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';
import { getMessagePath } from '../helpers/ThreadHelper';
import { formatError, randomId } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppRuntimeState>;
  readonly getSnapshot: () => AppRuntimeState;
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void>;
  readonly patch: (updates: Partial<AppRuntimeState>) => Effect.Effect<void>;
  readonly setActiveThread: (threadOrId: Thread | string | null) => Effect.Effect<void>;
  readonly updateSetting: (
    updates: Partial<AppRuntimeState['settings']> | ((settings: AppRuntimeState['settings']) => AppRuntimeState['settings']),
  ) => Effect.Effect<void>;
  readonly toggle: (key: keyof Pick<AppRuntimeState, 'isSidebarOpen' | 'isSettingOpen'>) => Effect.Effect<void>;
  readonly togglePin: (threadId: string) => Effect.Effect<void>;
  readonly toggleArchive: (threadId: string) => Effect.Effect<void>;
  readonly setConfirm: (options: ConfirmOptions) => Effect.Effect<void>;
  readonly executeConfirm: (id: string) => Effect.Effect<void>;
  readonly notify: (type: 'error' | 'warning' | 'info' | 'success', message: string) => Effect.Effect<void>;
  readonly clearNotification: (id: string) => Effect.Effect<void>;
  readonly loadMessages: (threadId: string) => Effect.Effect<void>;
  readonly loadMoreMessages: () => Effect.Effect<void>;
  readonly loadMoreThreads: () => Effect.Effect<void>;
  readonly searchThreads: (query: string) => Effect.Effect<void>;
  readonly clearDatabase: () => Effect.Effect<void>;
  readonly subscribe: (onStoreChange: () => void) => () => void;
  readonly getThread: (id: string) => Effect.Effect<Thread | null>;
}

export const StoreService = Context.GenericTag<StoreService>('@services/StoreService');

const createNotification = (
  type: 'error' | 'warning' | 'info' | 'success',
  message: string,
  existingNotifications: readonly AppRuntimeState['notifications'][number][],
): AppRuntimeState['notifications'] => {
  const existing = existingNotifications.find((n) => n.message === message && n.type === type);
  const filtered = existing ? existingNotifications.filter((n) => n.id !== existing.id) : existingNotifications;

  return [
    {
      id: randomId(8),
      type,
      message,
      timestamp: Date.now(),
    },
    ...filtered,
  ];
};

const INITIAL_STATE: AppRuntimeState = {
  threads: {},
  activeThreadId: null,
  activeThread: null,
  settings: DEFAULT_SETTINGS,
  availableModels: [],
  isSidebarOpen: true,
  isSettingOpen: false,
  isHydrated: false,
  confirm: {
    isOpen: false,
    title: '',
    message: '',
  },
  notifications: [],
  pinnedThreadIds: [],
  backgroundThreadIds: [],
  initializationError: undefined,
};

export const MAX_MEM_MESSAGES = 50;
export const MAX_MEM_THREADS = 100;

const OnConfirmStore = new Map<string, () => void>();

export const StoreServiceLive = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const loadState = Effect.gen(function* () {
      const result = yield* Effect.all({
        metadata: storage.getMetadata(),
        threadHeaders: storage.getThreadsMetadata({ limit: 30 }),
      }).pipe(
        Effect.timeout('10 seconds'),
        Effect.catchAll(() => Effect.fail(new Error('Database initialization timed out. This may happen if another tab is blocking the database.'))),
        Effect.either,
      );

      if (Either.isLeft(result)) {
        const err = result.left;
        console.error('Database initialization failed:', err);
        return {
          ...INITIAL_STATE,
          isHydrated: true,
          initializationError: formatError(err),
        } as AppRuntimeState;
      }

      const { metadata, threadHeaders } = result.right;

      if (metadata) {
        const threadsMap: Record<string, ThreadMetadata> = {};
        for (let i = 0; i < threadHeaders.length; i++) {
          threadsMap[threadHeaders[i].id] = threadHeaders[i];
        }

        let activeThread: Thread | null = null;
        const settings = metadata.settings;

        if (metadata.activeThreadId) {
          activeThread = yield* storage.getThread(metadata.activeThreadId, { limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed(null)));
        }

        // Only keep pinned and most recent threads in initial memory
        // Others will be loaded via loadMoreThreads or search
        const pinnedSet = new Set(metadata.pinnedThreadIds);
        const filteredThreadsMap: Record<string, ThreadMetadata> = {};

        // Use a more memory-efficient inclusion check
        const headerIds = new Set(threadHeaders.map((h) => h.id));
        for (const id in threadsMap) {
          if (pinnedSet.has(id) || headerIds.has(id)) {
            filteredThreadsMap[id] = threadsMap[id];
          }
        }

        return {
          ...INITIAL_STATE,
          ...metadata,
          settings: {
            ...DEFAULT_SETTINGS,
            ...settings,
            model: activeThread?.general.model || settings.model,
          },
          activeThread,
          threads: filteredThreadsMap,
          isHydrated: true,
        } as AppRuntimeState;
      }
      return { ...INITIAL_STATE, isHydrated: true };
    });

    const initialState = yield* loadState;
    const state = yield* SubscriptionRef.make(initialState);

    const subscribe = (onStoreChange: () => void) => {
      const fiber = YujiRuntime.runFork(Stream.runForEach(state.changes, () => Effect.sync(onStoreChange)));
      return () => {
        YujiRuntime.runFork(Fiber.interrupt(fiber));
      };
    };

    // Metadata (Debounced & Differential)
    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.mapEffect((s) => Schema.decode(AppStoreState)(s).pipe(Effect.orDie)),
        Stream.changes,
        Stream.debounce('100 millis'),
        Stream.runForEach((meta) => storage.saveMetadata(meta)),
        Effect.orDie,
      ),
    );

    const update = (f: (state: AppRuntimeState) => AppRuntimeState) => SubscriptionRef.update(state, f);
    const persist = (f: (state: AppRuntimeState) => AppRuntimeState) =>
      Effect.gen(function* () {
        yield* update(f);
        const s = yield* SubscriptionRef.get(state);
        const meta = yield* Schema.decode(AppStoreState)(s).pipe(Effect.orDie);
        yield* storage.saveMetadata(meta);
      });

    return StoreService.of({
      state,
      getSnapshot: () => SubscriptionRef.get(state).pipe(Effect.runSync),
      update,
      subscribe,
      patch: (updates) => update((s) => ({ ...s, ...updates })),
      getThread: (id) =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          if (s.activeThreadId === id && s.activeThread?.id === id) {
            return s.activeThread;
          }
          const thread = yield* storage.getThread(id);
          if (thread && s.activeThreadId === id) {
            yield* update((s) => (s.activeThreadId === id ? { ...s, activeThread: thread } : s));
          }
          return thread;
        }),
      setActiveThread: (activeThreadOrId) =>
        update((s) => {
          if (!activeThreadOrId) return { ...s, activeThreadId: null, activeThread: null };
          const id = typeof activeThreadOrId === 'string' ? activeThreadOrId : activeThreadOrId.id;
          const thread = typeof activeThreadOrId === 'string' ? null : activeThreadOrId;

          if (id === s.activeThreadId && s.activeThread?.id === id) return s;

          return {
            ...s,
            activeThreadId: id,
            activeThread: thread,
            settings: { ...s.settings, model: thread?.general.model || s.settings.model },
          };
        }),
      updateSetting: (updates) =>
        persist((s) => ({
          ...s,
          settings: typeof updates === 'function' ? updates(s.settings) : { ...s.settings, ...updates },
        })),
      toggle: (key) => update((s) => ({ ...s, [key]: !s[key] })),
      togglePin: (threadId) =>
        persist((s) => {
          const isPinned = s.pinnedThreadIds.includes(threadId);
          const pinnedThreadIds = isPinned ? s.pinnedThreadIds.filter((id) => id !== threadId) : [...s.pinnedThreadIds, threadId];
          return { ...s, pinnedThreadIds };
        }),
      toggleArchive: (threadId) =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          const thread = s.threads[threadId];
          if (!thread) return;

          const archived = !thread.archived;
          yield* update((s) => ({
            ...s,
            threads: {
              ...s.threads,
              [threadId]: { ...thread, archived },
            },
          }));

          // Update the thread in StorageService
          yield* storage.saveThread({ ...thread, archived });

          if (archived && s.activeThreadId === threadId) {
            yield* SubscriptionRef.update(state, (s) => ({ ...s, activeThreadId: null, activeThread: null }));
          }
        }),
      setConfirm: (options) =>
        Effect.gen(function* () {
          const { onConfirm, ...rest } = options;
          const id = randomId(8);
          OnConfirmStore.set(id, onConfirm);
          yield* update((s) => ({ ...s, confirm: { ...rest, id, isOpen: true } }));
        }),
      executeConfirm: (id) =>
        Effect.gen(function* () {
          const onConfirm = OnConfirmStore.get(id);
          if (onConfirm) onConfirm();
          OnConfirmStore.delete(id);
          yield* update((s) => ({ ...s, confirm: { ...s.confirm, isOpen: false } }));
        }),
      notify: (type, message) =>
        update((s) => ({
          ...s,
          notifications: createNotification(type, message, s.notifications),
        })),
      clearNotification: (id) =>
        update((s) => ({
          ...s,
          notifications: s.notifications.filter((n) => n.id !== id),
        })),
      loadMessages: (threadId) =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          if (s.activeThreadId === threadId && s.activeThread?.id === threadId) return;

          const thread = yield* storage.getThread(threadId, { limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed(null)));
          if (!thread) return;

          yield* update((s) =>
            s.activeThreadId === threadId
              ? {
                  ...s,
                  activeThread: thread,
                  settings: { ...s.settings, model: thread.general.model || s.settings.model },
                }
              : s,
          );
        }).pipe(Effect.orDie),
      loadMoreMessages: () =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          if (!s.activeThread) return;

          const threadId = s.activeThread.id;
          const currentMessages = Object.values(s.activeThread.messages).sort((a, b) => a.timestamp - b.timestamp);
          const lastKey = currentMessages[0]?.id;

          const moreMessages = yield* storage.getMessages(threadId, { lastKey, limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed([])));
          if (moreMessages.length === 0) return;

          yield* update((s) => {
            if (!s.activeThread || s.activeThread.id !== threadId) return s;
            const newMessages = { ...s.activeThread.messages };
            moreMessages.forEach((m) => {
              newMessages[m.id] = m;
            });

            // Keep the active path + the most recent messages up to MAX_MEM_MESSAGES
            const messageList = Object.values(newMessages);

            if (messageList.length <= MAX_MEM_MESSAGES) {
              return {
                ...s,
                activeThread: { ...s.activeThread, messages: newMessages },
              };
            }

            const activePathIds = new Set(
              s.activeThread.activeMessageId ? getMessagePath(s.activeThread, s.activeThread.activeMessageId).map((m) => m.id) : [],
            );

            const sortedByRecent = messageList.sort((a, b) => b.timestamp - a.timestamp);
            const finalMessages: Record<string, ThreadMessage> = {};
            let count = 0;

            // 1. Always keep active path
            for (const id of activePathIds) {
              if (newMessages[id]) {
                finalMessages[id] = newMessages[id];
                count++;
              }
            }

            // 2. Fill remaining quota with most recent messages
            for (let i = 0; i < sortedByRecent.length; i++) {
              if (count >= MAX_MEM_MESSAGES) break;
              const m = sortedByRecent[i];
              if (!finalMessages[m.id]) {
                finalMessages[m.id] = m;
                count++;
              }
            }

            return {
              ...s,
              activeThread: { ...s.activeThread, messages: finalMessages },
            };
          });
        }),
      loadMoreThreads: () =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          const threadList = Object.values(s.threads).sort((a, b) => a.updatedAt - b.updatedAt);
          const lastKey = threadList[0]?.updatedAt;

          const moreHeaders = yield* storage.getThreadsMetadata({ lastKey, limit: 30 }).pipe(Effect.catchAll(() => Effect.succeed([])));

          if (moreHeaders.length === 0) return;

          yield* update((s) => {
            const newThreads = { ...s.threads };
            moreHeaders.forEach((h) => {
              newThreads[h.id] = h;
            });

            // Keep pinned threads + up to MAX_MEM_THREADS most recent/relevant threads
            const threadList = Object.values(newThreads);

            if (threadList.length <= MAX_MEM_THREADS) {
              return { ...s, threads: newThreads };
            }

            const sortedByRecent = threadList.sort((a, b) => b.updatedAt - a.updatedAt);
            const result: Record<string, ThreadMetadata> = {};
            let count = 0;

            // 1. Always keep pinned threads
            for (const id of s.pinnedThreadIds) {
              if (newThreads[id]) {
                result[id] = newThreads[id];
                count++;
              }
            }

            // 2. Always keep the active thread header
            if (s.activeThreadId && newThreads[s.activeThreadId] && !result[s.activeThreadId]) {
              result[s.activeThreadId] = newThreads[s.activeThreadId];
              count++;
            }

            // 3. Fill remaining quota with most recent threads
            for (let i = 0; i < sortedByRecent.length; i++) {
              if (count >= MAX_MEM_THREADS) break;
              const t = sortedByRecent[i];
              if (!result[t.id]) {
                result[t.id] = t;
                count++;
              }
            }

            return { ...s, threads: result };
          });
        }),
      searchThreads: (query) =>
        Effect.gen(function* () {
          if (!query.trim()) {
            yield* storage.getThreadsMetadata({ limit: 30 }).pipe(
              Effect.flatMap((headers) =>
                update((s) => {
                  const newThreads = { ...s.threads };
                  headers.forEach((h) => {
                    newThreads[h.id] = h;
                  });
                  return { ...s, threads: newThreads };
                }),
              ),
              Effect.catchAll(() => Effect.void),
            );
            return;
          }

          const results = yield* storage.searchThreads(query, { limit: 50 }).pipe(Effect.catchAll(() => Effect.succeed([])));

          yield* update((s) => {
            const nextThreads = { ...s.threads };
            results.forEach((r) => {
              nextThreads[r.id] = r;
            });
            return { ...s, threads: nextThreads };
          });
        }),
      clearDatabase: () => storage.clearDatabase(),
    });
  }),
);
