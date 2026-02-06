import { toTitleCase } from '../utilities/CommonUtil';

import type { ChatSession, GlobalSettings, Model } from '../app/Schema';

export const getActiveModels = (availableModels: readonly Model[], disabledModels: readonly string[]): Model[] =>
  availableModels.filter((m) => !disabledModels.includes(m.id));

export const filterModels = (models: Model[], search: string): Model[] => {
  const query = search.trim().toLowerCase();
  return query ? models.filter((m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) : models;
};

export const getModelId = (settings: GlobalSettings, availableModels: readonly Model[]): string => {
  const active = getActiveModels(availableModels, settings.disabledModels);
  return active.find((m) => m.id === settings.model)?.id ?? active[0]?.id ?? 'gpt-4o';
};

export const getCurrentModelId = (activeSession: ChatSession | null, settings: GlobalSettings, availableModels: readonly Model[]): string => {
  const sessionModelId = activeSession?.general?.model;
  return sessionModelId && !settings.disabledModels.includes(sessionModelId) ? sessionModelId : getModelId(settings, availableModels);
};

export const getModelName = (availableModels: readonly Model[], modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  if (!model) return 'Yuji';
  return model.name === model.id ? model.name : toTitleCase(model.name);
};
