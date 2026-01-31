import { Data } from 'effect';

export class LLMProviderError extends Data.TaggedError('LLMProviderError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {
  readonly message!: string;
  constructor(props: { readonly message: string; readonly cause?: unknown }) {
    super(props);
  }
}

export class SessionNotFoundError extends Data.TaggedError('SessionNotFoundError')<{
  readonly sessionId: string;
}> {
  constructor(props: { readonly sessionId: string }) {
    super(props);
  }
}

export class MessageNotFoundError extends Data.TaggedError('MessageNotFoundError')<{
  readonly messageId: string;
}> {
  constructor(props: { readonly messageId: string }) {
    super(props);
  }
}

export class ParseError extends Data.TaggedError('ParseError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {
  readonly message!: string;
  constructor(props: { readonly message: string; readonly cause?: unknown }) {
    super(props);
  }
}
