import { Context, Effect, Layer } from 'effect';

export interface PlatformService {
  readonly nextId: Effect.Effect<string>;
  readonly now: Effect.Effect<number>;
}

export const PlatformService = Context.GenericTag<PlatformService>('@services/PlatformService');

export const PlatformServiceLive = Layer.succeed(
  PlatformService,
  PlatformService.of({
    nextId: Effect.sync(() => crypto.randomUUID()),
    now: Effect.sync(() => Date.now()),
  }),
);
