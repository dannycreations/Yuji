import { ToolExecuteRequest } from '@client/app/Schema.js';
import { HttpMiddleware, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { BunFileSystem, BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Schema } from 'effect';

import { authMiddleware } from './helpers/ServerHelper.js';
import { EXTERNAL_TOOL_LIST, TOOL_LIST } from './tools/index.js';

import type { ToolDefinition, ToolExecuteResponse } from '@client/app/Schema.js';
import type { RequestError } from '@effect/platform/HttpServerError';
import type { ParseError } from 'effect/ParseResult';

const router = HttpRouter.empty.pipe(
  HttpRouter.use(authMiddleware),
  HttpRouter.get(
    '/tools',
    Effect.gen(function* () {
      const toolDefinitions = Object.values(EXTERNAL_TOOL_LIST).map((t) => t.definition);
      return yield* HttpServerResponse.json(toolDefinitions as ToolDefinition[]);
    }),
  ),
  HttpRouter.post(
    '/tools/execute',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const calls = yield* request.json.pipe(Effect.flatMap(Schema.decodeUnknown(ToolExecuteRequest)));

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
              Effect.catchAll((e) => Effect.succeed({ error: String(e) })),
              Effect.map((res) => ({ id: item.id, result: res })),
            );
            return result;
          }),
        ),
        { concurrency: 'inherit' },
      );

      return yield* HttpServerResponse.json(results as ToolExecuteResponse);
    }).pipe(
      Effect.catchTags({
        ParseError: (error: ParseError) => HttpServerResponse.json({ error: 'Invalid input', details: error }, { status: 400 }),
        RequestError: (error: RequestError) => HttpServerResponse.json({ error: 'Failed to read request body', details: error }, { status: 400 }),
      }),
    ),
  ),
  HttpRouter.all('*', HttpServerResponse.empty({ status: 404 })),
  HttpMiddleware.cors(),
);

const HttpLive = router.pipe(
  HttpServer.serve(HttpMiddleware.logger),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 1730 })),
  Layer.provide(BunFileSystem.layer),
);

const program = Layer.launch(HttpLive).pipe(Effect.sandbox, Effect.catchAll(Effect.logError));

Effect.runPromise(program as Effect.Effect<never, never, never>);
