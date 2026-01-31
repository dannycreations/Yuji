import { Context, Effect, Stream } from 'effect';

import { LLMProviderError } from '../app/Error';

import type { Message, ModelConfig, Settings } from '../app/Schema';

interface LLMModel {
  readonly id: string;
}

export interface LLMProvider {
  readonly streamCompletion: (
    messages: ReadonlyArray<Message>,
    systemPrompt: string,
    settings: Settings,
    config: ModelConfig,
    sessionPrompt?: string,
    overrideGlobal?: boolean,
  ) => Effect.Effect<Stream.Stream<string, LLMProviderError>, LLMProviderError>;
  readonly fetchModels: (settings: Settings) => Effect.Effect<{ readonly data: ReadonlyArray<LLMModel> }, LLMProviderError>;
}

export const LLMProvider = Context.GenericTag<LLMProvider>('@providers/LLMProvider');
