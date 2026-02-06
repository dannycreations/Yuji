import { toTitleCase } from '../utilities/CommonUtil';

import type { AppRuntimeState, Model } from '../app/Schema';

export const getModelId = (settings: AppRuntimeState['settings'], availableModels: readonly Model[]): string => {
  const active = availableModels.filter((m) => !settings.disabledModels.includes(m.id));
  return active.find((m) => m.id === settings.model)?.id || active[0]?.id || 'gpt-4o';
};

export const getModelName = (availableModels: readonly Model[], modelId: string): string => {
  const model = availableModels.find((m) => m.id === modelId);
  if (!model) return 'Yuji';
  return model.name === model.id ? model.name : toTitleCase(model.name);
};
