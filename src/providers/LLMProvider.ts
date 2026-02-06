import { Context, Effect, Stream } from 'effect';

import { DEFAULT_GUIDE_PROMPT } from '../app/Constant';
import { LLMProviderError } from '../app/Error';

import type { ChatMessage, ChatSession, GlobalSettings, ModelConfig } from '../app/Schema';

export const synthesizeSystemPrompt = (settings: GlobalSettings, session: ChatSession): string => {
  const instruction = session.general.overrideInstruction ? session.instruction.systemPrompt : settings.instruction.systemPrompt;
  const personalisation = session.general.overridePersonalisation ? session.personalisation : settings.personalisation;

  const parts = [instruction, '\n\n', DEFAULT_GUIDE_PROMPT, '\n\n## Personalisation\n\n'];

  const { userName, userOccupation, assistantTraits, additionalContext } = personalisation;

  if (userName) parts.push(`- The user's name is ${userName}.\n`);
  if (userOccupation?.length) parts.push(`- The user acts as ${userOccupation.join(', ')}.\n`);
  if (assistantTraits?.length) parts.push(`- You should act ${assistantTraits.join(', ')}.\n`);
  if (additionalContext) parts.push(`- Additional context: ${additionalContext}\n`);

  return parts.join('').trim();
};

interface LLMModel {
  readonly id: string;
}

export interface LLMProvider {
  readonly streamCompletion: (
    messages: ReadonlyArray<ChatMessage>,
    settings: GlobalSettings,
    config: ModelConfig,
    systemPrompt: string,
  ) => Effect.Effect<Stream.Stream<string, LLMProviderError>, LLMProviderError>;
  readonly fetchModels: (settings: GlobalSettings) => Effect.Effect<{ readonly data: readonly LLMModel[] }, LLMProviderError>;
}

export const LLMProvider = Context.GenericTag<LLMProvider>('@providers/LLMProvider');
