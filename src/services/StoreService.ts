import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS, MODELS } from '../app/Constant';
import { AppRuntimeState, AppStoreState, ChatMetadata, ChatThread, ConfirmOptions } from '../app/Schema';
import { randomId } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppRuntimeState>;
  readonly getSnapshot: () => AppRuntimeState;
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void>;
  readonly patch: (updates: Partial<AppRuntimeState>) => Effect.Effect<void>;
  readonly setActiveThread: (threadOrId: ChatThread | string | null) => Effect.Effect<void>;
  readonly updateSetting: (
    updates: Partial<AppRuntimeState['settings']> | ((settings: AppRuntimeState['settings']) => AppRuntimeState['settings']),
  ) => Effect.Effect<void>;
  readonly toggle: (key: keyof Pick<AppRuntimeState, 'isSidebarOpen' | 'isSettingOpen'>) => Effect.Effect<void>;
  readonly togglePin: (threadId: string) => Effect.Effect<void>;
  readonly setConfirm: (options: ConfirmOptions) => Effect.Effect<void>;
  readonly executeConfirm: (id: string) => Effect.Effect<void>;
  readonly notify: (type: 'error' | 'warning' | 'info' | 'success', message: string) => Effect.Effect<void>;
  readonly clearNotification: (id: string) => Effect.Effect<void>;
  readonly loadMessages: (threadId: string) => Effect.Effect<void>;
  readonly loadMoreMessages: () => Effect.Effect<void>;
  readonly loadMoreThreads: () => Effect.Effect<void>;
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
};

const OnConfirmStore = new Map<string, () => void>();

export const StoreServiceLive = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const loadState = Effect.gen(function* () {
      const metadata = yield* storage.getMetadata().pipe(Effect.catchAll(() => Effect.succeed(null)));
      const threadHeaders = yield* storage.getThreadsMetadata({ limit: 30 }).pipe(Effect.catchAll(() => Effect.succeed([])));

      if (metadata) {
        const threadsMap: Record<string, ChatMetadata> = {};
        for (const header of threadHeaders) {
          threadsMap[header.id] = header;
        }

        let activeThread: ChatThread | null = null;
        let settings = metadata.settings;

        if (metadata.activeThreadId) {
          activeThread = yield* storage.getThread(metadata.activeThreadId, { limit: 20 }).pipe(Effect.catchAll(() => Effect.succeed(null)));
          if (activeThread?.general.model) {
            settings = { ...settings, model: activeThread.general.model };
          }
        }

        return yield* Schema.decode(AppRuntimeState)({
          ...INITIAL_STATE,
          ...metadata,
          settings,
          activeThread,
          threads: threadsMap,
          isHydrated: true,
        }).pipe(Effect.orDie);
      }
      return { ...INITIAL_STATE, isHydrated: true };
    });

    const initialState = yield* loadState;
    const state = yield* SubscriptionRef.make(initialState);

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
      patch: (updates) => update((s) => ({ ...s, ...updates })),
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
          const currentState = yield* SubscriptionRef.get(state);
          // Only skip if both ID matches and the thread object is correctly populated
          if (currentState.activeThreadId === threadId && currentState.activeThread?.id === threadId) return;

          const thread = yield* storage.getThread(threadId, { limit: 20 });
          if (!thread) return;

          yield* update((s) => {
            // Ensure we only update if the user hasn't switched to another thread in the meantime
            if (s.activeThreadId !== threadId) return s;

            const nextModel = thread.general.model || s.settings.model;

            return {
              ...s,
              activeThreadId: threadId,
              activeThread: thread,
              settings: { ...s.settings, model: nextModel },
            };
          });
        }),
      loadMoreMessages: () =>
        Effect.gen(function* () {
          const s = yield* SubscriptionRef.get(state);
          if (!s.activeThread) return;

          const threadId = s.activeThread.id;
          const currentMessages = Object.values(s.activeThread.messages);
          const offset = currentMessages.length;

          const moreMessages = yield* storage.getMessages(threadId, { offset, limit: 20 });
          if (moreMessages.length === 0) return;

          yield* update((s) => {
            if (!s.activeThread || s.activeThread.id !== threadId) return s;
            const newMessages = { ...s.activeThread.messages };
            moreMessages.forEach((m) => {
              newMessages[m.id] = m;
            });

            // If we have more than 100 messages, trim the bottom
            const MAX_MEM_MESSAGES = 100;
            const messageEntries = Object.entries(newMessages).sort((a, b) => b[1].timestamp - a[1].timestamp);

            let finalMessages = newMessages;
            if (messageEntries.length > MAX_MEM_MESSAGES) {
              finalMessages = Object.fromEntries(messageEntries.slice(0, MAX_MEM_MESSAGES));
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
          const moreHeaders = yield* storage.getThreadsMetadata({ offset: currentCount, limit: 30 });

          if (moreHeaders.length === 0) return;

          yield* update((s) => {
            const newThreads = { ...s.threads };
            moreHeaders.forEach((h) => {
              newThreads[h.id] = h;
            });
            return { ...s, threads: newThreads };
          });
        }),
    });
  }),
);
