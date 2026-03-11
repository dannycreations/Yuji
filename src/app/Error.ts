import { Data, Effect } from 'effect';

import { StoreService } from '../services/StoreService';
import { formatError } from '../utilities/CommonUtil';

export const reportError = (message: string, error?: unknown) =>
  Effect.gen(function* () {
    const s = yield* StoreService;
    const formatted = error ? `${message}: ${formatError(error)}` : message;
    yield* s.notify('error', formatted);
    yield* Effect.logError(formatted);
  });

export class LLMProviderError extends Data.TaggedError('LLMProviderError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ThreadNotFoundError extends Data.TaggedError('ThreadNotFoundError')<{
  readonly threadId: string;
}> {}

export class MessageNotFoundError extends Data.TaggedError('MessageNotFoundError')<{
  readonly messageId: string;
}> {}
