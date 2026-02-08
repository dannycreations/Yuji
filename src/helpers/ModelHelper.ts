import { toTitleCase } from '../utilities/CommonUtil';

import type { ChatSession, GlobalSettings, Model } from '../app/Schema';

export const getActiveModels = (availableModels: readonly Model[], disabledModels: readonly string[]): Model[] =>
  availableModels.filter((m) => !disabledModels.includes(m.id));

export const sortModels = (models: Model[], disabledModels: readonly string[] = []): Model[] => {
  return [...models].sort((a, b) => {
    const aDisabled = disabledModels.includes(a.id) ? 1 : 0;
    const bDisabled = disabledModels.includes(b.id) ? 1 : 0;
    if (aDisabled !== bDisabled) return aDisabled - bDisabled;
    return a.name.localeCompare(b.name);
  });
};

export const filterModels = (models: Model[], search: string): Model[] => {
  const query = search.trim().toLowerCase();
  return query ? models.filter((m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) : models;
};

export const getModelId = (settings: GlobalSettings, availableModels: readonly Model[]): string => {
  const active = getActiveModels(availableModels, settings.disabledModels);
  return active.find((m) => m.id === settings.model)?.id || active[0]?.id || 'yuji';
};

export const getCurrentModelId = (activeSession: ChatSession | null, settings: GlobalSettings, availableModels: readonly Model[]): string => {
  const sessionModelId = activeSession?.general?.model;
  return sessionModelId && !settings.disabledModels.includes(sessionModelId) ? sessionModelId : getModelId(settings, availableModels);
};

export const getModelName = (availableModels: readonly Model[], modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  return model ? toTitleCase(model.name) : 'Yuji';
};
