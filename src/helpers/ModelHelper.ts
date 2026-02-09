import { toTitleCase } from '../utilities/CommonUtil';

import type { GlobalSetting, Model, Thread } from '../app/Schema';

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

export const filterModels = (models: readonly Model[], search: string): Model[] => {
  const query = search.trim().toLowerCase();
  return query ? models.filter((m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) : [...models];
};

export const getFilteredModels = (
  availableModels: readonly Model[],
  disabledModels: readonly string[],
  search: string,
  options: {
    includeDisabled?: boolean;
    sort?: boolean;
  } = {},
): Model[] => {
  const { includeDisabled = false, sort = true } = options;
  let models = includeDisabled ? [...availableModels] : getActiveModels(availableModels, disabledModels);
  models = filterModels(models, search);
  if (sort) {
    return sortModels(models, disabledModels);
  }
  return models;
};

export const getModelId = (settings: GlobalSetting, availableModels: readonly Model[]): string => {
  const active = getActiveModels(availableModels, settings.disabledModels);
  return active.find((m) => m.id === settings.model)?.id || active[0]?.id || 'yuji';
};

export const getCurrentModelId = (activeThread: Thread | null, settings: GlobalSetting, availableModels: readonly Model[]): string => {
  const threadModelId = activeThread?.general?.model;
  return threadModelId && !settings.disabledModels.includes(threadModelId) ? threadModelId : getModelId(settings, availableModels);
};

export const getModelName = (availableModels: readonly Model[], modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  return model ? toTitleCase(model.name) : 'Yuji';
};
