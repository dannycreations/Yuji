import { Context, Effect, Either, Fiber, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS, MODELS } from '../app/Constant';
import { YujiRuntime } from '../app/Runtime';
import { AppRuntimeState, AppStoreState, ConfirmOptions, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';
import { getMessagePath } from '../helpers/ThreadHelper';
import { randomId } from '../utilities/CommonUtil';
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
  availableModels: MODELS,
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

const OnConfirmStore = new Map<string, () => void>();

export const StoreServiceLive = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const loadState = Effect.gen(function* () {
      const result = yield* Effect.all({
        metadata: storage.getMetadata(),
        threadHeaders: storage.getThreadsMetadata({ limit: 30 }),
      }).pipe(Effect.sandbox, Effect.either);

      if (Either.isLeft(result)) {
        console.error('[StoreService] Database initialization failed:', result.left);
        return {
          ...INITIAL_STATE,
          isHydrated: true,
          initializationError: String(result.left),
        };
      }

      const { metadata, threadHeaders } = result.right;

      if (metadata) {
        const threadsMap: Record<string, ThreadMetadata> = {};
        for (const header of threadHeaders) {
          threadsMap[header.id] = header;
        }

        let activeThread: Thread | null = null;
        let settings = metadata.settings;

        if (metadata.activeThreadId) {
          activeThread = yield* storage.getThread(metadata.activeThreadId, { limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed(null)));
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
          threads: threadsMap,
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

    // Persistence Loop: Metadata (Debounced & Differential)
    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.mapEffect(Schema.decode(AppStoreState)),
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

          // Persistence: Update the thread in StorageService
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
          const currentMessages = Object.values(s.activeThread.messages);
          const offset = currentMessages.length;

          const moreMessages = yield* storage.getMessages(threadId, { offset, limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed([])));
          if (moreMessages.length === 0) return;

          yield* update((s) => {
            if (!s.activeThread || s.activeThread.id !== threadId) return s;
            const newMessages = { ...s.activeThread.messages };
            moreMessages.forEach((m) => {
              newMessages[m.id] = m;
            });

            // If we have more than 100 messages, trim the bottom
            // Strategy: Keep the active path + the most recent messages up to MAX_MEM_MESSAGES
            const MAX_MEM_MESSAGES = 100;
            const messageList = Object.values(newMessages);

            let finalMessages = newMessages;
            if (messageList.length > MAX_MEM_MESSAGES) {
              const activePathIds = new Set(
                s.activeThread.activeMessageId ? getMessagePath(s.activeThread, s.activeThread.activeMessageId).map((m) => m.id) : [],
              );

              const sortedByRecent = messageList.sort((a, b) => b.timestamp - a.timestamp);
              const result: Record<string, ThreadMessage> = {};

              // 1. Always keep active path
              activePathIds.forEach((id) => {
                if (newMessages[id]) result[id] = newMessages[id];
              });

              // 2. Fill remaining quota with most recent messages
              for (const m of sortedByRecent) {
                if (Object.keys(result).length >= MAX_MEM_MESSAGES) break;
                result[m.id] = m;
              }

              finalMessages = result;
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
          const currentCount = Object.keys(s.threads).length;
          const moreHeaders = yield* storage.getThreadsMetadata({ offset: currentCount, limit: 30 }).pipe(Effect.catchAll(() => Effect.succeed([])));

          if (moreHeaders.length === 0) return;

          yield* update((s) => {
            const newThreads = { ...s.threads };
            moreHeaders.forEach((h) => {
              newThreads[h.id] = h;
            });
            return { ...s, threads: newThreads };
          });
        }),
      clearDatabase: () => storage.clearDatabase(),
    });
  }),
);
