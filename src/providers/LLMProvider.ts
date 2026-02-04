import { Context, Effect, Stream } from 'effect';

import { DEFAULT_GUIDE_PROMPT } from '../app/Constant';
import { LLMProviderError } from '../app/Error';

import type { ChatSession, Message, ModelConfig, Settings } from '../app/Schema';

export const synthesizeSystemPrompt = (settings: Settings, session: ChatSession): string => {
  const instruction = session.general.overrideInstruction ? session.instruction.systemPrompt : settings.instruction.systemPrompt;
  const personalisation = session.general.overridePersonalisation ? session.personalisation : settings.personalisation;

  const parts = [instruction, '\n\n', DEFAULT_GUIDE_PROMPT, '\n\n'];
  const parts2 = ['## Personalisation', '\n\n'];

  if (personalisation.userName) {
    parts2.push(`- The user's name is ${personalisation.userName}.\n`);
  }
  if (personalisation.userOccupation && personalisation.userOccupation.length > 0) {
    parts2.push(`- The user acts as ${personalisation.userOccupation.join(', ')}.\n`);
  }
  if (personalisation.assistantTraits && personalisation.assistantTraits.length > 0) {
    parts2.push(`- You should act ${personalisation.assistantTraits.join(', ')}.\n`);
  }
  if (personalisation.additionalContext) {
    parts2.push(`- Additional context: ${personalisation.additionalContext}\n`);
  }

  return [...parts, ...parts2].join('').trim();
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
