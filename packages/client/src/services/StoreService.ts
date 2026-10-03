import { Context, Effect, Layer, Result, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '@yuji/client/app/Constant';
import { AppRuntimeState, AppStoreState, GlobalSetting, Thread, ThreadMetadata } from '@yuji/client/app/Schema';
import { ensureValidMode } from '@yuji/client/helpers/ThreadHelper';
import { StorageService } from '@yuji/client/services/StorageService';
import { formatError, randomId } from '@yuji/client/utilities/CommonUtil';

import type { ConfirmOptions } from '@yuji/client/app/Schema';

type NotificationType = 'error' | 'warning' | 'info' | 'success';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppRuntimeState>;
  readonly getSnapshot: () => AppRuntimeState;
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void, never>;
  readonly setActiveThread: (threadOrId: Thread | string | null) => Effect.Effect<void, never>;
  readonly updateSetting: (updates: Partial<GlobalSetting>) => Effect.Effect<void, never>;
  readonly toggle: (key: keyof Pick<AppRuntimeState, 'isSidebarOpen' | 'isSettingOpen'>) => Effect.Effect<void, never>;
  readonly togglePin: (threadId: string) => Effect.Effect<void, never>;
  readonly toggleArchive: (threadId: string) => Effect.Effect<void, Error>;
  readonly setConfirm: (options: ConfirmOptions) => Effect.Effect<void, never>;
  readonly executeConfirm: (id: string) => Effect.Effect<void, never>;
  readonly notify: (type: NotificationType, message: string) => Effect.Effect<void, never>;
  readonly clearNotification: (id: string) => Effect.Effect<void, never>;
  readonly loadMessages: (threadId: string) => Effect.Effect<void, never>;
  readonly loadMoreThreads: () => Effect.Effect<void, never>;
  readonly searchThreads: (query: string) => Effect.Effect<void, never>;
  readonly deleteDatabase: () => Effect.Effect<void, Error>;
  readonly subscribe: (onStoreChange: () => void) => () => void;
  readonly getThread: (id: string) => Effect.Effect<Thread | null, Error>;
}

export const StoreService = Context.Service<StoreService>('@services/StoreService');

const MAX_NOTIFICATIONS = 5;

const createNotification = (
  type: NotificationType,
  message: string,
  existing: AppRuntimeState['notifications'],
): AppRuntimeState['notifications'] => {
  const isSame = (n: AppRuntimeState['notifications'][number]) => n.type === type && n.message === message;
  const head = existing[0];

  // Returning the existing array keeps the original id and timestamp, so an
  // identical notification does not restart its auto-dismiss timer.
  if (head && isSame(head)) {
    return existing;
  }

  const incoming: AppRuntimeState['notifications'][number] = { id: randomId(8), type, message, timestamp: Date.now() };

  return [incoming, ...existing.filter((n) => !isSame(n))].slice(0, MAX_NOTIFICATIONS);
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

const withValidMode = <T extends { mode?: string | null }>(item: T): T & { mode: 'chat' | 'agent' } => ({
  ...item,
  mode: ensureValidMode(item.mode),
});

const OnConfirmStore = new Map<string, () => void>();

export const StoreServiceLive = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const loadState = Effect.gen(function* () {
      const result = yield* Effect.all({
        metadata: storage.getMetadata(),
        threadHeaders: storage.getThreadsMetadata({ limit: 30 }),
      }).pipe(Effect.timeout('5 seconds'), Effect.sandbox, Effect.result);

      if (Result.isFailure(result)) {
        const err = formatError(result.failure);
        yield* Effect.logError('Database initialization failed:', err);
        return {
          ...INITIAL_STATE,
          initializationError: err,
        } as AppRuntimeState;
      }

      const { metadata, threadHeaders } = result.success;
      if (!metadata) {
        return INITIAL_STATE;
      }

      const threads = Object.fromEntries(threadHeaders.map((h) => [h.id, withValidMode(h)]));
      const { activeThreadId, settings } = metadata;
      const baseSettings = withValidMode({ ...DEFAULT_SETTINGS, ...settings });

      const activeThread = activeThreadId ? yield* storage.getThread(activeThreadId).pipe(Effect.catch(() => Effect.succeed(null))) : null;

      return {
        ...INITIAL_STATE,
        ...metadata,
        settings: activeThread?.general.model ? { ...baseSettings, model: activeThread.general.model } : baseSettings,
        activeThread: activeThread ? withValidMode(activeThread) : null,
        threads,
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

    // Notify listeners as soon as the state changes
    yield* Effect.forkDetach(SubscriptionRef.changes(state).pipe(Stream.runForEach(() => Effect.sync(() => listeners.forEach((l) => l())))));

    // Metadata (Debounced & Differential)
    yield* Effect.forkDetach(
      SubscriptionRef.changes(state).pipe(
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

    // Agent mode needs tools to run, so it is unavailable until some are discovered.
    const update = (f: (state: AppRuntimeState) => AppRuntimeState) =>
      SubscriptionRef.update(state, (s) => {
        const next = f(s);
        if (next.availableTools.length === 0 && next.settings.mode === 'agent') {
          return {
            ...next,
            settings: { ...next.settings, mode: 'chat' as const },
          };
        }
        return next;
      });

    // The ref returns the same object until it changes, which is what lets
    // useSyncExternalStore compare snapshots by identity.
    const getSnapshot = () => SubscriptionRef.get(state).pipe(Effect.runSync);

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
      updateSetting: (updates) => update((s) => ({ ...s, settings: { ...s.settings, ...updates } })),
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
          // A load must never shrink the message set on screen, because the
          // live state can hold streaming content that has not reached disk.
          const adoptLoadedThread = (thread: Thread) =>
            update((s) => {
              if (s.activeThreadId !== threadId) {
                return s;
              }

              const liveMessages = s.activeThread?.id === threadId ? s.activeThread.messages : {};

              if (Object.keys(liveMessages).length >= Object.keys(thread.messages).length) {
                return s;
              }

              return {
                ...s,
                activeThread: withValidMode({ ...thread, messages: { ...thread.messages, ...liveMessages } }),
                settings: {
                  ...s.settings,
                  model: thread.general.model || s.settings.model,
                },
              };
            });

          const s = yield* SubscriptionRef.get(state);
          // If the thread is already active and being updated (e.g. streaming), do not reload from storage
          // to avoid overwriting the volatile live state with stale/partial data from disk.
          const isCurrentActive = s.activeThreadId === threadId && s.activeThread?.id === threadId && Object.keys(s.activeThread.messages).length > 0;

          if (isCurrentActive) {
            return;
          }

          // PHASE 1: Fast load of active path + siblings for immediate interaction
          const partialThread = yield* storage.getThread(threadId, { limit: 20, loadSiblings: true }).pipe(Effect.catch(() => Effect.succeed(null)));

          if (partialThread) {
            yield* adoptLoadedThread(partialThread);
          }

          // PHASE 2: Background load of everything else to ensure full history availability
          yield* Effect.gen(function* () {
            const fullThread = yield* storage.getThread(threadId).pipe(Effect.catch(() => Effect.succeed(null)));
            if (fullThread) {
              yield* adoptLoadedThread(fullThread);
            }
          }).pipe(Effect.forkDetach);
        }).pipe(Effect.orDie),
      loadMoreThreads: () =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          const threadList = Object.values(s.threads);
          if (threadList.length === 0) {
            return;
          }

          const lastKey = threadList.reduce((oldest, t) => Math.min(oldest, t.updatedAt), Infinity);

          const more = yield* storage.getThreadsMetadata({ lastKey, limit: 30 }).pipe(Effect.catch(() => Effect.succeed([])));

          if (more.length === 0) {
            return;
          }

          yield* update((s) => {
            const next = { ...s.threads };
            for (const t of more) {
              next[t.id] = withValidMode(t);
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
                    newThreads[h.id] = withValidMode(h);
                  });
                  return { ...s, threads: newThreads };
                }),
              ),
              Effect.catch(() => Effect.void),
            );
            return;
          }

          const results = yield* storage.searchThreads(query, { limit: 50 }).pipe(Effect.catch(() => Effect.succeed([])));

          yield* update((s) => {
            const nextThreads = { ...s.threads };
            results.forEach((r) => {
              nextThreads[r.id] = withValidMode(r);
            });
            return { ...s, threads: nextThreads };
          });
        }),
      deleteDatabase: () => storage.deleteDatabase(),
    });
  }),
);
