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
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void, never>;
  readonly patch: (updates: Partial<AppRuntimeState>) => Effect.Effect<void, never>;
  readonly setActiveThread: (threadOrId: Thread | string | null) => Effect.Effect<void, never>;
  readonly updateSetting: (
    updates: Partial<AppRuntimeState['settings']> | ((settings: AppRuntimeState['settings']) => AppRuntimeState['settings']),
  ) => Effect.Effect<void, never>;
  readonly toggle: (key: keyof Pick<AppRuntimeState, 'isSidebarOpen' | 'isSettingOpen'>) => Effect.Effect<void, never>;
  readonly togglePin: (threadId: string) => Effect.Effect<void, never>;
  readonly toggleArchive: (threadId: string) => Effect.Effect<void, Error>;
  readonly setConfirm: (options: ConfirmOptions) => Effect.Effect<void, never>;
  readonly executeConfirm: (id: string) => Effect.Effect<void, never>;
  readonly notify: (type: 'error' | 'warning' | 'info' | 'success', message: string) => Effect.Effect<void, never>;
  readonly clearNotification: (id: string) => Effect.Effect<void, never>;
  readonly loadMessages: (threadId: string) => Effect.Effect<void, never>;
  readonly loadMoreMessages: () => Effect.Effect<void, never>;
  readonly loadMoreThreads: () => Effect.Effect<void, never>;
  readonly searchThreads: (query: string) => Effect.Effect<void, never>;
  readonly deleteDatabase: () => Effect.Effect<void, Error>;
  readonly subscribe: (onStoreChange: () => void) => () => void;
  readonly getThread: (id: string) => Effect.Effect<Thread | null, Error>;
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
      }).pipe(Effect.timeout('5 seconds'), Effect.sandbox, Effect.either);

      if (Either.isLeft(result)) {
        const err = formatError(result.left);
        yield* Effect.logError('Database initialization failed:', err);
        return {
          ...INITIAL_STATE,
          isHydrated: true,
          initializationError: err,
        } as AppRuntimeState;
      }

      const { metadata, threadHeaders } = result.right;

      if (metadata) {
        const threadsMap: Record<string, ThreadMetadata> = {};
        for (let i = 0, len = threadHeaders.length; i < len; i++) {
          const h = threadHeaders[i];
          threadsMap[h.id] = h;
        }

        const settings = metadata.settings;
        let activeThread: Thread | null = null;

        if (metadata.activeThreadId) {
          activeThread = yield* storage.getThread(metadata.activeThreadId, { limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed(null)));
        }

        // Only keep pinned and most recent threads in initial memory
        // Others will be loaded via loadMoreThreads or search
        const filteredThreadsMap: Record<string, ThreadMetadata> = {};

        for (let i = 0, len = threadHeaders.length; i < len; i++) {
          const h = threadHeaders[i];
          filteredThreadsMap[h.id] = h;
        }

        // Ensure pinned threads are also in memory
        const pIds = metadata.pinnedThreadIds;
        for (let i = 0, pLen = pIds.length; i < pLen; i++) {
          const pid = pIds[i];
          if (!filteredThreadsMap[pid]) {
            const t = threadsMap[pid];
            if (t) filteredThreadsMap[pid] = t;
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
        Stream.runForEach((meta) => storage.saveMetadata(meta)),
        Effect.orDie,
      ),
    );

    const update = (f: (state: AppRuntimeState) => AppRuntimeState) => SubscriptionRef.update(state, f);

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
        update((s) => ({
          ...s,
          settings: typeof updates === 'function' ? updates(s.settings) : { ...s.settings, ...updates },
        })),
      toggle: (key) => update((s) => ({ ...s, [key]: !s[key] })),
      togglePin: (threadId) =>
        update((s) => {
          const idx = s.pinnedThreadIds.indexOf(threadId);
          const pinnedThreadIds = idx !== -1 ? s.pinnedThreadIds.filter((_, i) => i !== idx) : [...s.pinnedThreadIds, threadId];
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
          const active = s.activeThread;
          if (!active) return;

          const threadId = active.id;
          // Use timestamp for lastKey since we updated StorageService to use compound index [threadId, timestamp]
          let oldestTimestamp: number | undefined;
          const msgs = active.messages;
          for (const id in msgs) {
            const m = msgs[id];
            if (!oldestTimestamp || m.timestamp < oldestTimestamp) {
              oldestTimestamp = m.timestamp;
            }
          }
          const lastKey = oldestTimestamp;

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
            const total = messageList.length;

            if (total <= MAX_MEM_MESSAGES) {
              return {
                ...s,
                activeThread: { ...s.activeThread, messages: newMessages },
              };
            }

            const activePath = s.activeThread.activeMessageId ? getMessagePath(s.activeThread, s.activeThread.activeMessageId) : [];
            const finalMessages: Record<string, ThreadMessage> = {};
            let count = 0;

            for (let i = 0, len = activePath.length; i < len; i++) {
              const m = activePath[i];
              finalMessages[m.id] = m;
              count++;
            }

            if (count < MAX_MEM_MESSAGES) {
              messageList.sort((a, b) => b.timestamp - a.timestamp);
              for (let i = 0; i < total && count < MAX_MEM_MESSAGES; i++) {
                const m = messageList[i];
                if (!finalMessages[m.id]) {
                  finalMessages[m.id] = m;
                  count++;
                }
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
          // Avoid full Object.values().sort() just to find the oldest thread
          let oldest: ThreadMetadata | undefined;
          for (const id in s.threads) {
            const t = s.threads[id];
            if (!oldest || t.updatedAt < oldest.updatedAt) {
              oldest = t;
            }
          }
          const lastKey = oldest?.updatedAt;

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
            const pIds = s.pinnedThreadIds;
            for (let i = 0, pLen = pIds.length; i < pLen; i++) {
              const t = newThreads[pIds[i]];
              if (t) {
                result[t.id] = t;
                count++;
              }
            }

            // 2. Always keep the active thread header
            const activeId = s.activeThreadId;
            if (activeId && newThreads[activeId] && !result[activeId]) {
              result[activeId] = newThreads[activeId];
              count++;
            }

            // 3. Fill remaining quota with most recent threads
            for (let i = 0, sLen = sortedByRecent.length; i < sLen; i++) {
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
      deleteDatabase: () => storage.deleteDatabase(),
    });
  }),
);
