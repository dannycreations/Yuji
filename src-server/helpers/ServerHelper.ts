import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Config, Effect, Option } from 'effect';

const isLocalhost = (address: string) => address === 'localhost' || address === '127.0.0.1' || address === '::ffff:127.0.0.1' || address === '::1';

const serverApiTokenConfig = Config.string('SERVER_API_TOKEN');

export const authMiddleware = HttpMiddleware.make((httpApp) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const remoteAddress = Option.getOrElse(request.remoteAddress, () => '');

    // If it's localhost, we allow it to be without bearer token
    if (isLocalhost(remoteAddress)) {
      return yield* httpApp;
    }

    // If not localhost, we force authentication
    const authHeader = request.headers['authorization'];
    const expectedToken = yield* Config.withDefault(serverApiTokenConfig, '');

    if (!expectedToken) {
      return yield* HttpServerResponse.json({ error: 'Server configuration error: SERVER_API_TOKEN not set' }, { status: 500 });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return yield* HttpServerResponse.json({ error: 'Unauthorized: Missing or invalid Bearer token' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token !== expectedToken) {
      return yield* HttpServerResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    return yield* httpApp;
  }),
);
