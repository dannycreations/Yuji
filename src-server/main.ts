import { HttpMiddleware, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { BunFileSystem, BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Schema } from 'effect';

import { ExecuteToolRequest } from './core/Schema.js';
import { tools } from './tools/index.js';

import type { RequestError } from '@effect/platform/HttpClientError';
import type { ParseError } from 'effect/ParseResult';

const router = HttpRouter.empty.pipe(
  HttpRouter.get(
    '/tools',
    Effect.gen(function* () {
      const toolDefinitions = Object.values(tools).map((t) => t.definition);
      return yield* HttpServerResponse.json(toolDefinitions);
    }),
  ),
  HttpRouter.post(
    '/tools/execute',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const body = yield* request.json.pipe(Effect.flatMap(Schema.decodeUnknown(ExecuteToolRequest)));
      const tool = tools[body.name];

      if (!tool) {
        return yield* HttpServerResponse.json({ error: `Tool not found: ${body.name}` }, { status: 404 });
      }

      const result = yield* tool.execute(body.arguments);

      return yield* HttpServerResponse.json({ result });
    }).pipe(
      Effect.catchTags({
        ParseError: (error: ParseError) => HttpServerResponse.json({ error: 'Invalid input', details: error }, { status: 400 }),
        RequestError: (error: RequestError) => HttpServerResponse.json({ error: 'Failed to read request body', details: error }, { status: 400 }),
      }),
    ),
  ),
);

const HttpLive = router.pipe(
  HttpServer.serve(HttpMiddleware.logger),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.provide(BunFileSystem.layer),
);

const program = Layer.launch(HttpLive).pipe(Effect.sandbox, Effect.catchAll(Effect.logError));

Effect.runPromise(program as Effect.Effect<never, never, never>);
