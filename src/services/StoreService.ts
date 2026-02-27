import { Context, Effect, Either, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '../app/Constant';
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
  const filtered = existingNotifications.filter((n) => n.message !== message || n.type !== type);

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
        const threads = Object.fromEntries(threadHeaders.map((h) => [h.id, h]));
        const { activeThreadId, settings } = metadata;
        const activeThread = activeThreadId
          ? yield* storage.getThread(activeThreadId, { limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed(null)))
          : null;

        return {
          ...INITIAL_STATE,
          ...metadata,
          settings: {
            ...DEFAULT_SETTINGS,
            ...settings,
            model: activeThread?.general.model || settings.model,
          },
          activeThread,
          threads,
          isHydrated: true,
        } as AppRuntimeState;
      }
      return { ...INITIAL_STATE, isHydrated: true };
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
        Stream.mapEffect((s) => Schema.decode(AppStoreState)(s).pipe(Effect.orDie)),
        Stream.changes,
        Stream.runForEach((meta) => storage.saveMetadata(meta)),
        Effect.orDie,
      ),
    );

    let snapshotCache: AppRuntimeState | null = null;
    const update = (f: (state: AppRuntimeState) => AppRuntimeState) =>
      Effect.sync(() => {
        snapshotCache = null;
      }).pipe(Effect.flatMap(() => SubscriptionRef.update(state, f)));

    const getSnapshot = () => {
      if (snapshotCache) return snapshotCache;
      snapshotCache = SubscriptionRef.get(state).pipe(Effect.runSync);
      return snapshotCache;
    };

    return StoreService.of({
      state,
      getSnapshot,
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
          // If the thread is already active and being updated (e.g. streaming), do not reload from storage
          // to avoid overwriting the volatile live state with stale/partial data from disk.
          if (s.activeThreadId === threadId && s.activeThread?.id === threadId && Object.keys(s.activeThread.messages).length > 0) {
            return;
          }

          const thread = yield* storage.getThread(threadId, { limit: MAX_MEM_MESSAGES }).pipe(Effect.catchAll(() => Effect.succeed(null)));
          if (!thread) return;

          yield* update((s) => {
            if (s.activeThreadId !== threadId) return s;
            // Final check: if the thread became active and populated while we were loading, don't overwrite.
            if (s.activeThread?.id === threadId && Object.keys(s.activeThread.messages).length > Object.keys(thread.messages).length) {
              return s;
            }

            return {
              ...s,
              activeThread: thread,
              settings: { ...s.settings, model: thread.general.model || s.settings.model },
            };
          });
        }).pipe(Effect.orDie),
      loadMoreMessages: () =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          if (!s.activeThread) return;

          const { id: tid, messages } = s.activeThread;
          const lastKey = Object.values(messages).reduce((min, m) => (m.timestamp < min ? m.timestamp : min), Infinity);

          const more = yield* storage.getMessages(tid, { lastKey, limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed([])));
          if (more.length === 0) return;

          yield* update((s) => {
            if (s.activeThread?.id !== tid) return s;
            const next = { ...s.activeThread.messages };
            for (const m of more) next[m.id] = m;

            const list = Object.values(next);
            if (list.length <= MAX_MEM_MESSAGES) return { ...s, activeThread: { ...s.activeThread, messages: next } };

            const final: Record<string, ThreadMessage> = {};
            const activeId = s.activeThread.activeMessageId;
            if (activeId) {
              for (const m of getMessagePath(s.activeThread, activeId)) final[m.id] = m;
            }

            list.sort((a, b) => b.timestamp - a.timestamp);
            for (let i = 0; i < list.length && Object.keys(final).length < MAX_MEM_MESSAGES; i++) {
              const m = list[i];
              if (!final[m.id]) final[m.id] = m;
            }

            return { ...s, activeThread: { ...s.activeThread, messages: final } };
          });
        }),
      loadMoreThreads: () =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          const lastKey = Object.values(s.threads).reduce((min, t) => (t.updatedAt < min ? t.updatedAt : min), Infinity);

          const more = yield* storage.getThreadsMetadata({ lastKey, limit: 30 }).pipe(Effect.catchAll(() => Effect.succeed([])));
          if (more.length === 0) return;

          yield* update((s) => {
            const next = { ...s.threads };
            for (const t of more) next[t.id] = t;

            const list = Object.values(next);
            if (list.length <= MAX_MEM_THREADS) return { ...s, threads: next };

            const res: Record<string, ThreadMetadata> = {};
            for (const id of s.pinnedThreadIds) {
              const t = next[id];
              if (t) res[id] = t;
            }
            const activeId = s.activeThreadId;
            if (activeId && next[activeId]) res[activeId] = next[activeId];

            list.sort((a, b) => b.updatedAt - a.updatedAt);
            for (let i = 0; i < list.length && Object.keys(res).length < MAX_MEM_THREADS; i++) {
              const t = list[i];
              if (!res[t.id]) res[t.id] = t;
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
