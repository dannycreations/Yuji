import { Context, Effect, Stream } from 'effect';

import { DEFAULT_GUIDE_PROMPT } from '../app/Constant';
import { LLMProviderError } from '../app/Error';

import type { Message, ModelConfig, Settings } from '../app/Schema';

export const synthesizeSystemPrompt = (settings: Settings, sessionPrompt?: string, overrideGlobal?: boolean): string => {
  const parts: string[] = [settings.systemPrompt];

  if (settings.userName) parts.push(`The user's name is ${settings.userName}.`);
  if (settings.userOccupation) parts.push(`The user acts as a ${settings.userOccupation}.`);
  if (settings.assistantTraits && settings.assistantTraits.length > 0) {
    parts.push(`You should act ${settings.assistantTraits.join(', ')}.`);
  }
  if (settings.additionalContext) {
    parts.push(`\nAdditional Context:\n${settings.additionalContext}`);
  }

  const globalSystemPrompt = parts.join(' ');

  const basePrompt =
    sessionPrompt && overrideGlobal === false
      ? `${globalSystemPrompt}\n\nAdditional Instructions:\n${sessionPrompt}`
      : sessionPrompt || globalSystemPrompt;

  return `${basePrompt}\n\n${DEFAULT_GUIDE_PROMPT}`.trim();
};

interface LLMModel {
  readonly id: string;
}

export interface LLMProvider {
  readonly streamCompletion: (
    messages: ReadonlyArray<Message>,
    settings: Settings,
    config: ModelConfig,
    systemPrompt: string,
  ) => Effect.Effect<Stream.Stream<string, LLMProviderError>, LLMProviderError>;
  readonly fetchModels: (settings: Settings) => Effect.Effect<{ readonly data: ReadonlyArray<LLMModel> }, LLMProviderError>;
}

export const LLMProvider = Context.GenericTag<LLMProvider>('@providers/LLMProvider');
