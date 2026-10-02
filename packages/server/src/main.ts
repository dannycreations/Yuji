import { BunHttpServer, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpServerError } from 'effect/http/HttpServerError';

import { ToolExecuteRequest } from '@yuji/client/app/Schema';
import { authMiddleware } from '@yuji/server/helpers/ServerHelper';
import { EXTERNAL_TOOL_LIST, TOOL_LIST } from '@yuji/server/tools/index';

import type { ToolDefinition, ToolExecuteResponse } from '@yuji/client/app/Schema';

const ToolsRoute = HttpRouter.add(
  'GET',
  '/tools',
  Effect.gen(function* () {
    const toolDefinitions = Object.values(EXTERNAL_TOOL_LIST).map((t) => t.definition);
    return yield* HttpServerResponse.json(toolDefinitions as ToolDefinition[]);
  }),
);

const ExecuteToolsRoute = HttpRouter.add(
  'POST',
  '/tools/execute',
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const calls = yield* request.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(ToolExecuteRequest)));

    const results = yield* Effect.all(
      calls.map((item) =>
        Effect.gen(function* () {
          const tool = TOOL_LIST[item.name];
          if (!tool) {
            return {
              id: item.id,
              error: `Tool not found: ${item.name}`,
            };
          }

          const result = yield* tool.execute(item.arguments).pipe(
            Effect.catch((e) => Effect.succeed({ error: String(e) })),
            Effect.map((res) => ({ id: item.id, result: res })),
          );
          return result;
        }),
      ),
    );

    return yield* HttpServerResponse.json(results as ToolExecuteResponse);
  }).pipe(
    Effect.catchTags({
      SchemaError: (error: Schema.SchemaError) => HttpServerResponse.json({ error: 'Invalid input', details: error.issue }, { status: 400 }),
      HttpServerError: (error: HttpServerError) =>
        HttpServerResponse.json({ error: 'Failed to read request body', details: error.message }, { status: 400 }),
    }),
  ),
);

const NotFoundRoute = HttpRouter.add('*', '*', HttpServerResponse.empty({ status: 404 }));

const HttpLive = HttpRouter.serve(Layer.mergeAll(ToolsRoute, ExecuteToolsRoute, NotFoundRoute, authMiddleware, HttpRouter.cors())).pipe(
  Layer.provide(BunHttpServer.layer({ port: 1730 })),
  Layer.provide(BunServices.layer),
);

const program = Layer.launch(HttpLive).pipe(Effect.sandbox, Effect.catch(Effect.logError));

Effect.runPromise(program as Effect.Effect<never, never, never>);
