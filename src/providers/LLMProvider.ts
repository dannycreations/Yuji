import { Context, Effect, Stream } from 'effect';

import { DEFAULT_GUIDE_PROMPT } from '../app/Constant';
import { LLMProviderError } from '../app/Error';

import type { ChatSession, Message, ModelConfig, Settings } from '../app/Schema';

export const synthesizeSystemPrompt = (settings: Settings, session: ChatSession): string => {
  const instruction =
    session.general.overrideInstruction && session.instruction.systemPrompt ? session.instruction.systemPrompt : settings.instruction.systemPrompt;

  const personalisation = session.general.overridePersonalisation ? session.personalisation : settings.personalisation;

  const parts: string[] = [instruction, '\n\n', DEFAULT_GUIDE_PROMPT];

  if (personalisation?.userName) parts.push(`The user's name is ${personalisation.userName}.`);
  if (personalisation?.userOccupation) parts.push(`The user acts as a ${personalisation.userOccupation}.`);
  if (personalisation?.assistantTraits && personalisation.assistantTraits.length > 0) {
    parts.push(`You should act ${personalisation.assistantTraits.join(', ')}.`);
  }
  if (personalisation?.additionalContext) {
    parts.push(`\nAdditional Context:\n${personalisation.additionalContext}`);
  }

  return parts.join(' ').trim();
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
