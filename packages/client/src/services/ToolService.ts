import { HttpClient, HttpClientRequest } from '@effect/platform';
import { Context, Effect, Layer } from 'effect';

import { GlobalSetting } from '@yuji/client/app/Schema';
import { formatError } from '@yuji/client/utilities/CommonUtil';

import type { ToolDefinition, ToolExecuteItem, ToolExecuteResponse } from '@yuji/client/app/Schema';

export interface ToolService {
  readonly fetch: (settings: GlobalSetting) => Effect.Effect<ReadonlyArray<ToolDefinition>, Error>;
  readonly execute: (requests: ToolExecuteItem[], settings: GlobalSetting) => Effect.Effect<ToolExecuteResponse, Error>;
}

export const ToolService = Context.GenericTag<ToolService>('@services/ToolService');

export const ToolServiceLive = Layer.effect(
  ToolService,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk, HttpClient.mapRequest(HttpClientRequest.acceptJson));

    return ToolService.of({
      fetch: (settings) =>
        Effect.gen(function* () {
          const baseUrl = settings.toolsUrl || settings.baseUrl;
          const request = HttpClientRequest.get(`${baseUrl}/tools`).pipe(HttpClientRequest.setHeader('Authorization', `Bearer ${settings.apiKey}`));

          const response = yield* client.execute(request).pipe(Effect.flatMap((res) => res.json));
          return response as ToolDefinition[];
        }).pipe(Effect.catchAll((e) => Effect.fail(new Error(`Fetch tools error: ${formatError(e)}`)))),
      execute: (requests, settings) =>
        Effect.gen(function* () {
          const baseUrl = settings.toolsUrl || settings.baseUrl;
          const request = yield* HttpClientRequest.post(`${baseUrl}/tools/execute`).pipe(
            HttpClientRequest.setHeader('Authorization', `Bearer ${settings.apiKey}`),
            HttpClientRequest.bodyJson(requests),
          );

          const response = yield* client.execute(request).pipe(Effect.flatMap((res) => res.json));
          return response as ToolExecuteResponse;
        }).pipe(Effect.catchAll((e) => Effect.fail(new Error(`Tool execution error: ${formatError(e)}`)))),
    });
  }),
);
