import { toTitleCase } from '../utilities/CommonUtil';

import type { ChatSession, GlobalSettings, Model } from '../app/Schema';

export const getModelId = (settings: GlobalSettings, availableModels: readonly Model[]): string => {
  const active = availableModels.filter((m) => !settings.disabledModels.includes(m.id));
  return active.find((m) => m.id === settings.model)?.id || active[0]?.id || 'gpt-4o';
};

export const getCurrentModelId = (activeSession: ChatSession | null, settings: GlobalSettings, availableModels: readonly Model[]): string => {
  const sessionModelId = activeSession?.general?.model;
  if (sessionModelId && !settings.disabledModels.includes(sessionModelId)) {
    return sessionModelId;
  }
  return getModelId(settings, availableModels);
};

export const getModelName = (availableModels: readonly Model[], modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  if (!model) return 'Yuji';
  return model.name === model.id ? model.name : toTitleCase(model.name);
};
