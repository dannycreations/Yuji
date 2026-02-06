import { toTitleCase } from '../utilities/CommonUtil';

import type { AppRuntimeState, Model } from '../app/Schema';

export const getModelId = (settings: AppRuntimeState['settings'], availableModels: AppRuntimeState['availableModels']): string => {
  const active = availableModels.filter((m) => !settings.disabledModels.includes(m.id));
  return active.find((m) => m.id === settings.model)?.id || active[0]?.id || 'gpt-4o';
};

export const getModelName = (availableModels: ReadonlyArray<Model>, modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  return model ? toTitleCase(model.name) : 'Yuji';
};

export const getEffectiveModelId = (
  settings: AppRuntimeState['settings'],
  availableModels: AppRuntimeState['availableModels'],
  sessions: AppRuntimeState['sessions'],
  sessionId: string | null,
): string => {
  const session = sessionId ? sessions[sessionId] : null;
  const sessionModelId = session?.general.model;

  if (sessionModelId && !settings.disabledModels.includes(sessionModelId)) {
    return sessionModelId;
  }

  return getModelId(settings, availableModels);
};

export const getEffectiveModelName = (
  settings: AppRuntimeState['settings'],
  availableModels: AppRuntimeState['availableModels'],
  sessions: AppRuntimeState['sessions'],
  sessionId: string | null,
): string => {
  return getModelName(availableModels, getEffectiveModelId(settings, availableModels, sessions, sessionId));
};
