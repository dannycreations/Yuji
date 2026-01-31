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
  readonly getOnConfirm: (id: string) => (() => void) | undefined;
}

export const StoreService = Context.GenericTag<StoreService>('@services/StoreService');

const STORAGE_KEY = 'yuji-storage';

const INITIAL_STATE: AppState = {
  sessions: {},
  activeSessionId: null,
  settings: DEFAULT_SETTINGS,
  availableModels: MODELS,
  isSidebarOpen: true,
  isSettingsOpen: false,
  confirm: {
    isOpen: false,
    title: '',
    message: '',
  },
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
          Effect.map((parsed) => ({ ...INITIAL_STATE, ...parsed })),
          Effect.orElseSucceed(() => INITIAL_STATE),
        );
      }
      return INITIAL_STATE;
    });

    const initialState = yield* loadState;
    const state = yield* SubscriptionRef.make(initialState);

    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.runForEach((s) =>
          Schema.encode(Schema.parseJson(AppStoreState))(s).pipe(
            Effect.flatMap((json) => storage.setItem(STORAGE_KEY, json)),
            Effect.ignore,
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
      getOnConfirm: (id) => OnConfirmStore.get(id),
    });
  }),
);
