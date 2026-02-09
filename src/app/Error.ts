import { Data } from 'effect';

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
