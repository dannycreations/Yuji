import { Data } from 'effect';

export class LLMProviderError extends Data.TaggedError('LLMProviderError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class SessionNotFoundError extends Data.TaggedError('SessionNotFoundError')<{
  readonly sessionId: string;
}> {}

export class MessageNotFoundError extends Data.TaggedError('MessageNotFoundError')<{
  readonly messageId: string;
}> {}

export class ParseError extends Data.TaggedError('ParseError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
