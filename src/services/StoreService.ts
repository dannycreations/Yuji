import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS, MODELS } from '../app/Constant';
import { AppRuntimeState, AppStoreState, ChatMetadata, ChatSession, ConfirmState } from '../app/Schema';
import { randomString } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppRuntimeState>;
  readonly getSnapshot: () => AppRuntimeState;
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void>;
  readonly setActiveSession: (sessionOrId: ChatSession | string | null) => Effect.Effect<void>;
  readonly updateSetting: (updates: Partial<AppRuntimeState['settings']>) => Effect.Effect<void>;
  readonly toggleSidebar: () => Effect.Effect<void>;
  readonly toggleSetting: () => Effect.Effect<void>;
  readonly togglePin: (sessionId: string) => Effect.Effect<void>;
  readonly setConfirm: (options: Omit<ConfirmState, 'isOpen' | 'id'> & { readonly onConfirm: () => void }) => Effect.Effect<void>;
  readonly getOnConfirm: (id: string) => Effect.Effect<(() => void) | undefined>;
  readonly clearConfirm: (id: string) => Effect.Effect<void>;
  readonly notify: (type: 'error' | 'warning' | 'info' | 'success', message: string) => Effect.Effect<void>;
  readonly clearNotification: (id: string) => Effect.Effect<void>;
  readonly loadMessages: (sessionId: string) => Effect.Effect<void>;
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
      id: randomString(8),
      type,
      message,
      timestamp: Date.now(),
    },
    ...filtered,
  ];
};

const INITIAL_STATE: AppRuntimeState = {
  sessions: {},
  activeSessionId: null,
  activeSession: null,
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
  pinnedSessionIds: [],
  backgroundSessionIds: [],
};

const OnConfirmStore = new Map<string, () => void>();

export const StoreServiceLive = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const loadState = Effect.gen(function* () {
      const metadata = yield* storage.getMetadata();
      const sessionHeaders = yield* storage.getSessionsMetadata();

      if (metadata) {
        const sessionsMap: Record<string, ChatMetadata> = {};
        for (const header of sessionHeaders) {
          sessionsMap[header.id] = header;
        }

        let activeSession: ChatSession | null = null;
        if (metadata.activeSessionId) {
          activeSession = yield* storage.getSession(metadata.activeSessionId);
        }

        return Schema.decodeSync(AppRuntimeState)({
          ...INITIAL_STATE,
          ...metadata,
          activeSession,
          sessions: sessionsMap,
          isHydrated: true,
        });
      }
      return { ...INITIAL_STATE, isHydrated: true };
    });

    const initialState = yield* loadState;
    const state = yield* SubscriptionRef.make(initialState);

    // Persistence Loop: Metadata
    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.map(Schema.decodeSync(AppStoreState)),
        Stream.changes,
        Stream.debounce('1 seconds'),
        Stream.runForEach((meta) => storage.saveMetadata(meta)),
      ),
    );

    const update = (f: (state: AppRuntimeState) => AppRuntimeState) => SubscriptionRef.update(state, f);

    return StoreService.of({
      state,
      getSnapshot: () => SubscriptionRef.get(state).pipe(Effect.runSync),
      update,
      setActiveSession: (activeSessionOrId) =>
        update((s) => {
          if (!activeSessionOrId) return { ...s, activeSessionId: null, activeSession: null };
          const id = typeof activeSessionOrId === 'string' ? activeSessionOrId : activeSessionOrId.id;
          if (id === s.activeSessionId && s.activeSession?.id === id) return s;

          const session = typeof activeSessionOrId === 'string' ? null : activeSessionOrId;
          return { ...s, activeSessionId: id, activeSession: session };
        }),
      updateSetting: (updates) => update((s) => ({ ...s, settings: { ...s.settings, ...updates } })),
      toggleSidebar: () => update((s) => ({ ...s, isSidebarOpen: !s.isSidebarOpen })),
      toggleSetting: () => update((s) => ({ ...s, isSettingOpen: !s.isSettingOpen })),
      togglePin: (sessionId) =>
        update((s) => {
          const isPinned = s.pinnedSessionIds.includes(sessionId);
          const pinnedSessionIds = isPinned ? s.pinnedSessionIds.filter((id) => id !== sessionId) : [...s.pinnedSessionIds, sessionId];
          return { ...s, pinnedSessionIds };
        }),
      setConfirm: (options) =>
        Effect.gen(function* () {
          const { onConfirm, ...rest } = options;
          const id = randomString(8);
          OnConfirmStore.set(id, onConfirm);
          yield* update((s) => ({
            ...s,
            confirm: {
              ...rest,
              id,
              isOpen: true,
            },
          }));
        }),
      getOnConfirm: (id) => Effect.sync(() => OnConfirmStore.get(id)),
      clearConfirm: (id) => Effect.sync(() => OnConfirmStore.delete(id)),
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
      loadMessages: (sessionId) =>
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(state);
          // Only skip if both ID matches and the session object is correctly populated
          if (currentState.activeSessionId === sessionId && currentState.activeSession?.id === sessionId) return;

          const session = yield* storage.getSession(sessionId);
          if (!session) return;

          yield* update((s) => {
            // Ensure we only update if the user hasn't switched to another session in the meantime
            if (s.activeSessionId !== sessionId) return s;

            return {
              ...s,
              activeSessionId: sessionId,
              activeSession: session,
            };
          });
        }),
    });
  }),
);
