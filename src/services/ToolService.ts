import { Context, Effect, Layer } from 'effect';

import { GlobalSetting } from '../app/Schema';
import { formatError } from '../utilities/CommonUtil';

export interface ToolService {
  readonly fetch: (settings: GlobalSetting) => Effect.Effect<readonly any[], Error>;
  readonly execute: (name: string, args: unknown, settings: GlobalSetting) => Effect.Effect<unknown, Error>;
}

export const ToolService = Context.GenericTag<ToolService>('@services/ToolService');

export const ToolServiceLive = Layer.succeed(
  ToolService,
  ToolService.of({
    fetch: (settings) =>
      Effect.gen(function* () {
        const baseUrl = settings.toolsUrl || settings.baseUrl;
        const response = yield* Effect.promise(() =>
          fetch(`${baseUrl}/tools`, {
            headers: {
              Authorization: `Bearer ${settings.apiKey}`,
            },
          }),
        );

        if (!response.ok) {
          return yield* Effect.fail(new Error(`Failed to fetch tools: ${response.statusText}`));
        }

        return yield* Effect.promise(() => response.json());
      }).pipe(Effect.catchAll((e) => Effect.fail(new Error(`Fetch tools error: ${formatError(e)}`)))),
    execute: (name, args, settings) =>
      Effect.gen(function* () {
        const baseUrl = settings.toolsUrl || settings.baseUrl;
        const response = yield* Effect.promise(() =>
          fetch(`${baseUrl}/tools/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${settings.apiKey}`,
            },
            body: JSON.stringify({ name, arguments: args }),
          }),
        );

        if (!response.ok) {
          const error = yield* Effect.promise(() => response.json().catch(() => ({ error: response.statusText })));
          return yield* Effect.fail(new Error(error.error || `Failed to execute tool ${name}`));
        }

        const data = yield* Effect.promise(() => response.json());
        return data.result;
      }).pipe(Effect.catchAll((e) => Effect.fail(new Error(`Tool execution error (${name}): ${formatError(e)}`)))),
  }),
);
