import { Context, Effect, Either, Layer, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '@yuji/client/app/Constant';
import { AppRuntimeState, AppStoreState, Thread, ThreadMetadata } from '@yuji/client/app/Schema';
import { ensureValidMode } from '@yuji/client/helpers/ThreadHelper';
import { StorageService } from '@yuji/client/services/StorageService';
import { formatError, randomId } from '@yuji/client/utilities/CommonUtil';

import type { ConfirmOptions } from '@yuji/client/app/Schema';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppRuntimeState>;
  readonly getSnapshot: () => AppRuntimeState;
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void, never>;
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
  existing: readonly AppRuntimeState['notifications'][number][],
): AppRuntimeState['notifications'] => {
  const first = existing[0];

  const isDuplicate = existing.length > 0 && first.message === message && first.type === type;

  if (isDuplicate) {
    return existing as AppRuntimeState['notifications'];
  }

  const next: AppRuntimeState['notifications'][number][] = [{ id: randomId(8), type, message, timestamp: Date.now() }];

  for (const n of existing) {
    const isSame = n.message === message && n.type === type;

    if (isSame) {
      continue;
    }

    next.push(n);
  }

  if (next.length > 5) {
    return next.slice(0, 5);
  }

  return next;
};

const INITIAL_STATE: AppRuntimeState = {
  threads: {},
  activeThreadId: null,
  activeThread: null,
  settings: DEFAULT_SETTINGS,
  availableModels: [],
  availableTools: [],
  isSidebarOpen: typeof window !== 'undefined' ? window.innerWidth > 768 : true,
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

const MAX_MEM_THREADS = 100;

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
      if (!metadata) {
        return {
          ...INITIAL_STATE,
          isHydrated: true,
        } as AppRuntimeState;
      }

      const threads = Object.fromEntries(threadHeaders.map((h) => [h.id, { ...h, mode: ensureValidMode(h.mode) }]));
      const { activeThreadId, settings } = metadata;

      if (!activeThreadId) {
        return {
          ...INITIAL_STATE,
          ...metadata,
          settings: {
            ...DEFAULT_SETTINGS,
            ...settings,
            mode: ensureValidMode(settings.mode),
          },
          threads,
          isHydrated: true,
        } as AppRuntimeState;
      }

      const activeThread = yield* storage.getThread(activeThreadId).pipe(Effect.catchAll(() => Effect.succeed(null)));

      return {
        ...INITIAL_STATE,
        ...metadata,
        settings: {
          ...DEFAULT_SETTINGS,
          ...settings,
          model: activeThread?.general.model || settings.model,
          mode: ensureValidMode(settings.mode),
        },
        activeThread: activeThread ? { ...activeThread, mode: ensureValidMode(activeThread.mode) } : null,
        threads,
        isHydrated: true,
      } as AppRuntimeState;
    });

    const initialState = yield* loadState;
    const state = yield* SubscriptionRef.make(initialState);

    const listeners = new Set<() => void>();
    const subscribe = (onStoreChange: () => void) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    };

    // Keep cache fresh on changes and notify listeners immediately
    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.runForEach(() =>
          Effect.sync(() => {
            snapshotCache = null;
            listeners.forEach((l) => l());
          }),
        ),
      ),
    );

    // Metadata (Debounced & Differential)
    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.map(
          (s) =>
            ({
              activeThreadId: s.activeThreadId,
              settings: s.settings,
              availableModels: s.availableModels,
              availableTools: s.availableTools,
              pinnedThreadIds: s.pinnedThreadIds,
              backgroundThreadIds: s.backgroundThreadIds,
            }) satisfies AppStoreState,
        ),
        Stream.changes,
        Stream.runForEach((meta) => storage.saveMetadata(meta)),
        Effect.orDie,
      ),
    );

    let snapshotCache: AppRuntimeState | null = null;
    const update = (f: (state: AppRuntimeState) => AppRuntimeState) =>
      Effect.sync(() => {
        snapshotCache = null;
      }).pipe(
        Effect.flatMap(() =>
          SubscriptionRef.update(state, (s) => {
            const next = f(s);
            if (next.availableTools.length === 0 && next.settings.mode === 'agent') {
              return {
                ...next,
                settings: { ...next.settings, mode: 'chat' as const },
              };
            }
            return next;
          }),
        ),
      );

    const getSnapshot = () => {
      if (snapshotCache) {
        return snapshotCache;
      }

      snapshotCache = SubscriptionRef.get(state).pipe(Effect.runSync);
      return snapshotCache;
    };

    return StoreService.of({
      state,
      getSnapshot,
      update,
      subscribe,
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
          if (!activeThreadOrId) {
            return { ...s, activeThreadId: null, activeThread: null };
          }

          const id = typeof activeThreadOrId === 'string' ? activeThreadOrId : activeThreadOrId.id;
          const thread = typeof activeThreadOrId === 'string' ? null : activeThreadOrId;

          if (id === s.activeThreadId && s.activeThread?.id === id) {
            return s;
          }

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
      togglePin: (id) =>
        update((s) => ({
          ...s,
          pinnedThreadIds: s.pinnedThreadIds.includes(id) ? s.pinnedThreadIds.filter((item) => item !== id) : [...s.pinnedThreadIds, id],
        })),
      toggleArchive: (threadId) =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          const thread = s.threads[threadId];
          if (!thread) {
            return;
          }

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
          if (onConfirm) {
            onConfirm();
          }

          OnConfirmStore.delete(id);
          yield* update((s) => ({
            ...s,
            confirm: { ...s.confirm, isOpen: false },
          }));
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
          // If the thread is already active and being updated (e.g. streaming), do not reload from storage
          // to avoid overwriting the volatile live state with stale/partial data from disk.
          const isCurrentActive = s.activeThreadId === threadId && s.activeThread?.id === threadId && Object.keys(s.activeThread.messages).length > 0;

          if (isCurrentActive) {
            return;
          }

          // PHASE 1: Fast load of active path + siblings for immediate interaction
          const partialThread = yield* storage
            .getThread(threadId, { limit: 20, loadSiblings: true })
            .pipe(Effect.catchAll(() => Effect.succeed(null)));

          if (partialThread) {
            yield* update((s) => {
              if (s.activeThreadId !== threadId) {
                return s;
              }

              const isMoreDataExisting =
                s.activeThread?.id === threadId && Object.keys(s.activeThread.messages).length >= Object.keys(partialThread.messages).length;

              // If we already have more data (maybe from a previous full load or streaming), don't downgrade
              if (isMoreDataExisting) {
                return s;
              }

              return {
                ...s,
                activeThread: { ...partialThread, mode: ensureValidMode(partialThread.mode) },
                settings: {
                  ...s.settings,
                  model: partialThread.general.model || s.settings.model,
                },
              };
            });
          }

          // PHASE 2: Background load of everything else to ensure full history availability
          yield* Effect.gen(function* () {
            const fullThread = yield* storage.getThread(threadId).pipe(Effect.catchAll(() => Effect.succeed(null)));

            if (!fullThread) {
              return;
            }

            yield* update((s) => {
              if (s.activeThreadId !== threadId) {
                return s;
              }

              const isMoreDataExisting =
                s.activeThread?.id === threadId && Object.keys(s.activeThread.messages).length > Object.keys(fullThread.messages).length;

              // If the thread is already populated (e.g. by sendMessage), don't overwrite
              if (isMoreDataExisting) {
                return s;
              }

              // If streaming happened during load, preserve those new messages
              const currentMessages = s.activeThread?.id === threadId ? s.activeThread.messages : {};
              const mergedMessages = { ...fullThread.messages, ...currentMessages };

              return {
                ...s,
                activeThread: { ...fullThread, mode: ensureValidMode(fullThread.mode), messages: mergedMessages },
                settings: {
                  ...s.settings,
                  model: fullThread.general.model || s.settings.model,
                },
              };
            });
          }).pipe(Effect.forkDaemon);
        }).pipe(Effect.orDie),
      loadMoreThreads: () =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          const threadList = Object.values(s.threads);
          if (threadList.length === 0) {
            return;
          }

          const lastKey = threadList.reduce((acc, t) => {
            const result = t.updatedAt < acc ? t.updatedAt : acc;
            return result;
          }, Infinity);

          const more = yield* storage.getThreadsMetadata({ lastKey, limit: 30 }).pipe(Effect.catchAll(() => Effect.succeed([])));

          if (more.length === 0) {
            return;
          }

          yield* update((s) => {
            const next = { ...s.threads };
            for (const t of more) {
              next[t.id] = { ...t, mode: ensureValidMode(t.mode) };
            }

            const list = Object.values(next);
            if (list.length <= MAX_MEM_THREADS) {
              return { ...s, threads: next };
            }

            const res: Record<string, ThreadMetadata> = {};
            const pinnedIds = s.pinnedThreadIds;
            for (const id of pinnedIds) {
              const t = next[id];
              if (t) {
                res[id] = t;
              }
            }

            const activeId = s.activeThreadId;
            if (activeId && next[activeId]) {
              res[activeId] = next[activeId];
            }

            list.sort((a, b) => b.updatedAt - a.updatedAt);

            for (const t of list) {
              const isFull = Object.keys(res).length >= MAX_MEM_THREADS;

              if (isFull) {
                break;
              }

              if (!res[t.id]) {
                res[t.id] = t;
              }
            }

            return { ...s, threads: res };
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
                    newThreads[h.id] = { ...h, mode: ensureValidMode(h.mode) };
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
              nextThreads[r.id] = { ...r, mode: ensureValidMode(r.mode) };
            });
            return { ...s, threads: nextThreads };
          });
        }),
      deleteDatabase: () => storage.deleteDatabase(),
    });
  }),
);
