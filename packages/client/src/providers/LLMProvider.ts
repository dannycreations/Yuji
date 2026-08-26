import { Context, Effect, Stream } from 'effect';

import { DEFAULT_GUIDE_PROMPT } from '@yuji/client/app/Constant';
import { LLMProviderError } from '@yuji/client/app/Error';

import type { GlobalSetting, Thread, ThreadMessage, ToolDefinition } from '@yuji/client/app/Schema';

export const synthesizeSystemPrompt = (settings: GlobalSetting, thread: Thread): string => {
  const instruction = thread.general.overrideInstruction ? thread.instruction.systemPrompt : settings.instruction.systemPrompt;
  const personalisation = thread.general.overridePersonalisation ? thread.personalisation : settings.personalisation;

  let res = instruction + '\n\n' + DEFAULT_GUIDE_PROMPT + '\n\n## Personalisation\n\n';

  const { userName, userOccupation, assistantTraits, additionalContext } = personalisation;

  if (userName) res += `- The user's name is ${userName}.\n`;
  if (userOccupation?.length) res += `- The user acts as ${userOccupation.join(', ')}.\n`;
  if (assistantTraits?.length) res += `- You should act ${assistantTraits.join(', ')}.\n`;
  if (additionalContext) res += `- Additional context: ${additionalContext}\n`;

  return res.trim();
};

interface LLMModel {
  readonly id: string;
}

export interface LLMProvider {
  readonly fetchModels: (settings: GlobalSetting) => Effect.Effect<{ readonly data: readonly LLMModel[] }, LLMProviderError>;
  readonly streamCompletion: (
    messages: ReadonlyArray<ThreadMessage>,
    settings: GlobalSetting,
    config: {
      readonly model: string;
      readonly temperature: number;
      readonly maxTokens?: number;
      readonly topP?: number;
      readonly tools?: ReadonlyArray<ToolDefinition>;
    },
    systemPrompt: string,
  ) => Effect.Effect<Stream.Stream<string, LLMProviderError>, LLMProviderError>;
}

export const LLMProvider = Context.GenericTag<LLMProvider>('@providers/LLMProvider');
