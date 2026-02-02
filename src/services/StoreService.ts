import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { AppStoreState, MODELS } from '../app/Schema';
import { randomString } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';

import type { AppState, ConfirmState } from '../app/Schema';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppState>;
  readonly update: (f: (state: AppState) => AppState) => Effect.Effect<void>;
  readonly toggleSidebar: () => Effect.Effect<void>;
  readonly toggleSetting: () => Effect.Effect<void>;
  readonly setConfirm: (
    options: Omit<Schema.Schema.Type<typeof ConfirmState>, 'isOpen' | 'id'> & { readonly onConfirm: () => void },
  ) => Effect.Effect<void>;
  readonly getOnConfirm: (id: string) => Effect.Effect<(() => void) | undefined>;
  readonly clearConfirm: (id: string) => Effect.Effect<void>;
  readonly notify: (type: 'error' | 'warning' | 'info' | 'success', message: string) => Effect.Effect<void>;
  readonly clearNotification: (id: string) => Effect.Effect<void>;
}

export const StoreService = Context.GenericTag<StoreService>('@services/StoreService');

const STORAGE_KEY = 'yuji-storage';

const createNotification = (
  type: 'error' | 'warning' | 'info' | 'success',
  message: string,
  existingNotifications: ReadonlyArray<AppState['notifications'][number]>,
): AppState['notifications'] => {
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

const INITIAL_STATE: AppState = {
  sessions: {},
  activeSessionId: null,
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
};

const OnConfirmStore = new Map<string, () => void>();

export const StoreServiceLive = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const loadState = Effect.gen(function* () {
      const stored = yield* storage.getItem(STORAGE_KEY);
      if (stored) {
        return yield* Schema.decodeUnknown(Schema.parseJson(AppStoreState))(stored).pipe(
          Effect.map((parsed) => ({ ...INITIAL_STATE, ...parsed, isHydrated: true })),
          Effect.orElseSucceed(() => ({ ...INITIAL_STATE, isHydrated: true })),
        );
      }
      return { ...INITIAL_STATE, isHydrated: true };
    });

    const initialState = yield* loadState;
    const state = yield* SubscriptionRef.make(initialState);

    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.runForEach((s) => {
          const sanitizedSessions = Object.fromEntries(
            Object.entries(s.sessions).map(([id, session]) => {
              const validMessages = session.messages.filter((m) => !m.isError);
              const validIds = new Set(validMessages.map((m) => m.id));

              const cleanedMessages = validMessages.map((m) => ({
                ...m,
                childrenIds: m.childrenIds?.filter((childId) => validIds.has(childId)),
              }));

              return [
                id,
                {
                  ...session,
                  messages: cleanedMessages,
                  activeMessageId: session.activeMessageId && validIds.has(session.activeMessageId) ? session.activeMessageId : undefined,
                },
              ];
            }),
          );

          const sanitizedState = { ...s, sessions: sanitizedSessions };
          return Schema.encode(Schema.parseJson(AppStoreState))(sanitizedState).pipe(
            Effect.flatMap((json) => storage.setItem(STORAGE_KEY, json)),
            Effect.catchAll((err) =>
              SubscriptionRef.update(state, (curr) => ({
                ...curr,
                notifications: createNotification('error', `Failed to save state: ${err}`, curr.notifications),
              })),
            ),
          );
        }),
      ),
    );

    const update = (f: (state: AppState) => AppState) => SubscriptionRef.update(state, f);

    return StoreService.of({
      state,
      update,
      toggleSidebar: () => update((s) => ({ ...s, isSidebarOpen: !s.isSidebarOpen })),
      toggleSetting: () => update((s) => ({ ...s, isSettingOpen: !s.isSettingOpen })),
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
    });
  }),
);
