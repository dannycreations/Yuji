import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS, MODELS } from '../app/Constant';
import { AppRuntimeState, AppStoreState, ChatMetadata, ChatSession, ConfirmState } from '../app/Schema';
import { randomId } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppRuntimeState>;
  readonly getSnapshot: () => AppRuntimeState;
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void>;
  readonly patch: (updates: Partial<AppRuntimeState>) => Effect.Effect<void>;
  readonly setActiveSession: (sessionOrId: ChatSession | string | null) => Effect.Effect<void>;
  readonly updateSetting: (
    updates: Partial<AppRuntimeState['settings']> | ((settings: AppRuntimeState['settings']) => AppRuntimeState['settings']),
  ) => Effect.Effect<void>;
  readonly toggle: (key: keyof Pick<AppRuntimeState, 'isSidebarOpen' | 'isSettingOpen'>) => Effect.Effect<void>;
  readonly togglePin: (sessionId: string) => Effect.Effect<void>;
  readonly setConfirm: (options: Omit<ConfirmState, 'isOpen' | 'id'> & { readonly onConfirm: () => void }) => Effect.Effect<void>;
  readonly executeConfirm: (id: string) => Effect.Effect<void>;
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
      id: randomId(8),
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
        Stream.runForEach((meta) => storage.saveMetadata(meta)),
      ),
    );

    const update = (f: (state: AppRuntimeState) => AppRuntimeState) => SubscriptionRef.update(state, f);

    return StoreService.of({
      state,
      getSnapshot: () => SubscriptionRef.get(state).pipe(Effect.runSync),
      update,
      patch: (updates) => update((s) => ({ ...s, ...updates })),
      setActiveSession: (activeSessionOrId) =>
        update((s) => {
          if (!activeSessionOrId) return { ...s, activeSessionId: null, activeSession: null };
          const id = typeof activeSessionOrId === 'string' ? activeSessionOrId : activeSessionOrId.id;
          if (id === s.activeSessionId && s.activeSession?.id === id) return s;

          const session = typeof activeSessionOrId === 'string' ? null : activeSessionOrId;
          return { ...s, activeSessionId: id, activeSession: session };
        }),
      updateSetting: (updates) =>
        update((s) => ({
          ...s,
          settings: typeof updates === 'function' ? updates(s.settings) : { ...s.settings, ...updates },
        })),
      toggle: (key) => update((s) => ({ ...s, [key]: !s[key] })),
      togglePin: (sessionId) =>
        update((s) => {
          const isPinned = s.pinnedSessionIds.includes(sessionId);
          const pinnedSessionIds = isPinned ? s.pinnedSessionIds.filter((id) => id !== sessionId) : [...s.pinnedSessionIds, sessionId];
          return { ...s, pinnedSessionIds };
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
