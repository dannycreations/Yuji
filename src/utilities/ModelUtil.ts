import { toTitleCase } from './CommonUtil';

import type { AppState, Model } from '../app/Schema';

export const getDefaultModelId = (settings: AppState['settings'], availableModels: AppState['availableModels']): string => {
  const disabled = settings.disabledModels || [];
  const active = availableModels.filter((m) => !disabled.includes(m.id));
  return active.find((m) => m.id === settings.defaultModel)?.id || active[0]?.id || 'gpt-4o';
};

export const getEffectiveModelId = (
  settings: AppState['settings'],
  availableModels: AppState['availableModels'],
  sessions: AppState['sessions'],
  sessionId: string | null,
): string => {
  const effectiveDefault = getDefaultModelId(settings, availableModels);

  const session = sessionId ? sessions[sessionId] : null;
  return (session?.general.overrideModel && session?.general.model) || effectiveDefault;
};

export const getModelName = (availableModels: ReadonlyArray<Model>, modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  return model ? toTitleCase(model.name) : 'Yuji';
};
