import { toTitleCase } from './CommonUtil';

import type { AppState, Model } from '../app/Schema';

export const getEffectiveModelId = (state: AppState, sessionId: string | null): string => {
  const { settings, sessions, availableModels } = state;
  const disabled = settings.disabledModels || [];
  const active = availableModels.filter((m) => !disabled.includes(m.id));
  const effectiveDefault = active.find((m) => m.id === settings.defaultModel)?.id || active[0]?.id || 'gpt-4o';

  const session = sessionId ? sessions[sessionId] : null;
  return (session?.general.overrideModel && session?.general.model) || effectiveDefault;
};

export const getModelName = (availableModels: ReadonlyArray<Model>, modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  return model ? toTitleCase(model.name) : 'Yuji';
};
