import { toTitleCase } from '../utilities/CommonUtil';

import type { GlobalSetting, Model, Thread } from '../app/Schema';

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
  const query = search.trim().toLowerCase();
  const disabledSet = new Set(disabledModels);

  const filtered: Model[] = [];
  for (const m of availableModels) {
    if (!includeDisabled && disabledSet.has(m.id)) continue;
    if (!query || m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) {
      filtered.push(m);
    }
  }

  if (sort && filtered.length > 1) {
    return filtered.sort((a, b) => {
      if (includeDisabled) {
        const aDisabled = disabledSet.has(a.id) ? 1 : 0;
        const bDisabled = disabledSet.has(b.id) ? 1 : 0;
        if (aDisabled !== bDisabled) return aDisabled - bDisabled;
      }
      return a.name.localeCompare(b.name);
    });
  }

  return filtered;
};

export const getModelId = (settings: GlobalSetting, availableModels: readonly Model[]): string => {
  const disabledSet = new Set(settings.disabledModels);
  let firstActiveId = '';

  for (const m of availableModels) {
    if (!disabledSet.has(m.id)) {
      if (!firstActiveId) firstActiveId = m.id;
      if (m.id === settings.model) return m.id;
    }
  }

  return firstActiveId;
};

export const getCurrentModelId = (activeThread: Thread | null, settings: GlobalSetting, availableModels: readonly Model[]): string => {
  const threadModelId = activeThread?.general?.model;
  const hasModelId = threadModelId && !settings.disabledModels.includes(threadModelId);
  return hasModelId ? threadModelId : getModelId(settings, availableModels);
};

export const getModelName = (availableModels: readonly Model[], modelId: string): string => {
  for (const m of availableModels) {
    if (m.id === modelId) return toTitleCase(m.name);
  }
  return 'Yuji';
};
