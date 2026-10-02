import { Config, Effect, Option } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

const isLocalhost = (address: string) => address === 'localhost' || address === '127.0.0.1' || address === '::ffff:127.0.0.1' || address === '::1';

const serverApiKeyConfig = Config.String('SERVER_API_KEY');

export const authMiddleware = HttpRouter.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const remoteAddress = Option.getOrElse(request.remoteAddress ?? Option.none(), () => '');

      // If it's localhost, we allow it to be without bearer key
      if (isLocalhost(remoteAddress)) {
        return yield* httpApp;
      }

      // If not localhost, we force authentication
      const authHeader = request.headers['authorization'];
      const expectedKey = yield* Config.withDefault(serverApiKeyConfig, '');

      if (!expectedKey) {
        return yield* HttpServerResponse.json({ error: 'Server configuration error: SERVER_API_KEY not set' }, { status: 500 });
      }

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return yield* HttpServerResponse.json({ error: 'Unauthorized: Missing or invalid Bearer key' }, { status: 401 });
      }

      const key = authHeader.substring(7);
      if (key !== expectedKey) {
        return yield* HttpServerResponse.json({ error: 'Unauthorized: Invalid key' }, { status: 401 });
      }

      return yield* httpApp;
    }),
  { global: true },
);
