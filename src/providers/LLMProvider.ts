import { Context, Effect, Stream } from 'effect';

import { DEFAULT_GUIDE_PROMPT } from '../app/Constant';
import { LLMProviderError } from '../app/Error';

import type { GlobalSetting, Thread, ThreadMessage } from '../app/Schema';

export const synthesizeSystemPrompt = (settings: GlobalSetting, thread: Thread): string => {
  const instruction = thread.general.overrideInstruction ? thread.instruction.systemPrompt : settings.instruction.systemPrompt;
  const personalisation = thread.general.overridePersonalisation ? thread.personalisation : settings.personalisation;

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
    messages: ReadonlyArray<ThreadMessage>,
    settings: GlobalSetting,
    config: {
      readonly provider: 'openai';
      readonly model: string;
      readonly temperature: number;
      readonly maxTokens?: number;
      readonly topP?: number;
    },
    systemPrompt: string,
  ) => Effect.Effect<Stream.Stream<string, LLMProviderError>, LLMProviderError>;
  readonly fetchModels: (settings: GlobalSetting) => Effect.Effect<{ readonly data: readonly LLMModel[] }, LLMProviderError>;
}

export const LLMProvider = Context.GenericTag<LLMProvider>('@providers/LLMProvider');
