import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { AppStoreState, MODELS } from '../app/Schema';
import { StorageService } from './StorageService';

import type { AppState, ConfirmState } from '../app/Schema';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppState>;
  readonly update: (f: (state: AppState) => AppState) => Effect.Effect<void>;
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
      id: Math.random().toString(36).substring(7),
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
        Stream.runForEach((s) =>
          Schema.encode(Schema.parseJson(AppStoreState))(s).pipe(
            Effect.flatMap((json) => storage.setItem(STORAGE_KEY, json)),
            Effect.catchAll((err) =>
              SubscriptionRef.update(state, (curr) => ({
                ...curr,
                notifications: createNotification('error', `Failed to save state: ${err}`, curr.notifications),
              })),
            ),
          ),
        ),
      ),
    );

    return StoreService.of({
      state,
      update: (f) => SubscriptionRef.update(state, f),
      setConfirm: (options) =>
        Effect.gen(function* () {
          const { onConfirm, ...rest } = options;
          const id = Math.random().toString(36).substring(7);
          OnConfirmStore.set(id, onConfirm);
          yield* SubscriptionRef.update(state, (s) => ({
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
        SubscriptionRef.update(state, (s) => ({
          ...s,
          notifications: createNotification(type, message, s.notifications),
        })),
      clearNotification: (id) =>
        SubscriptionRef.update(state, (s) => ({
          ...s,
          notifications: s.notifications.filter((n) => n.id !== id),
        })),
    });
  }),
);
