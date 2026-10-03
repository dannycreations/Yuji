import { toTitleCase } from '@yuji/client/utilities/CommonUtil';

import type { GlobalSetting, Model, Thread } from '@yuji/client/app/Schema';

export const getFilteredModels = (
  availableModels: readonly Model[],
  disabledModels: readonly string[],
  search: string,
  options: { includeDisabled?: boolean } = {},
): Model[] => {
  const { includeDisabled = false } = options;
  const query = search.trim().toLowerCase();
  const disabledSet = disabledModels.length > 0 ? new Set(disabledModels) : null;

  const filtered: Model[] = [];
  for (let i = 0; i < availableModels.length; i++) {
    const m = availableModels[i];
    if (!includeDisabled && disabledSet?.has(m.id)) {
      continue;
    }

    const matchesQuery = !query || m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
    if (matchesQuery) {
      filtered.push(m);
    }
  }

  if (filtered.length > 1) {
    // Disabled models sort last when they are included at all.
    return filtered.sort((a, b) => {
      if (includeDisabled && disabledSet) {
        const aDisabled = disabledSet.has(a.id) ? 1 : 0;
        const bDisabled = disabledSet.has(b.id) ? 1 : 0;
        if (aDisabled !== bDisabled) return aDisabled - bDisabled;
      }

      // Plain comparison, because locale collation is not worth the cost here.
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  return filtered;
};

export const getModelId = (settings: GlobalSetting, availableModels: readonly Model[]): string => {
  const disabledSet = settings.disabledModels.length > 0 ? new Set(settings.disabledModels) : null;
  let firstActiveId = '';

  for (let i = 0; i < availableModels.length; i++) {
    const m = availableModels[i];
    if (!disabledSet?.has(m.id)) {
      if (!firstActiveId) {
        firstActiveId = m.id;
      }

      if (m.id === settings.model) {
        return m.id;
      }
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
    if (m.id === modelId) {
      return toTitleCase(m.name);
    }
  }
  return 'Yuji';
};
