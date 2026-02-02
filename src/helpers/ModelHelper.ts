import { toTitleCase } from '../utilities/CommonUtil';

import type { AppState, Model } from '../app/Schema';

export const getDefaultModelId = (settings: AppState['settings'], availableModels: AppState['availableModels']): string => {
  const active = availableModels.filter((m) => !settings.disabledModels.includes(m.id));
  return active.find((m) => m.id === settings.defaultModel)?.id || active[0]?.id || 'gpt-4o';
};

export const getModelName = (availableModels: ReadonlyArray<Model>, modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  return model ? toTitleCase(model.name) : 'Yuji';
};

export const getEffectiveModelId = (
  settings: AppState['settings'],
  availableModels: AppState['availableModels'],
  sessions: AppState['sessions'],
  sessionId: string | null,
): string => {
  const effectiveDefault = getDefaultModelId(settings, availableModels);
  const session = sessionId ? sessions[sessionId] : null;
  return session?.general.model || effectiveDefault;
};

export const getEffectiveModelName = (
  settings: AppState['settings'],
  availableModels: AppState['availableModels'],
  sessions: AppState['sessions'],
  sessionId: string | null,
): string => {
  const id = getEffectiveModelId(settings, availableModels, sessions, sessionId);
  return getModelName(availableModels, id);
};
