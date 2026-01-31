import { Context, Effect, Layer } from 'effect';

export interface StorageService {
  readonly getItem: (key: string) => Effect.Effect<string | null>;
  readonly setItem: (key: string, value: string) => Effect.Effect<void>;
  readonly removeItem: (key: string) => Effect.Effect<void>;
}

export const StorageService = Context.GenericTag<StorageService>('@services/StorageService');

export const StorageServiceLive = Layer.succeed(
  StorageService,
  StorageService.of({
    getItem: (key) => Effect.sync(() => localStorage.getItem(key)),
    setItem: (key, value) => Effect.sync(() => localStorage.setItem(key, value)),
    removeItem: (key) => Effect.sync(() => localStorage.removeItem(key)),
  }),
);
