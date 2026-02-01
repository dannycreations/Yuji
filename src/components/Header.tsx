import clsx from 'clsx';
import { Effect } from 'effect';
import { useState } from 'react';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { useAction, useStore } from '../hooks/useStore';
import { StoreService } from '../services/StoreService';
import { Icon } from './shared/Icon';
import { InputText } from './shared/InputArea';

import type { FC } from 'react';
import type { AppState, Model } from '../app/Schema';

interface ModelPickerProps {
  readonly currentModel: string;
  readonly onSelect: (modelId: string) => void;
  readonly onClose: () => void;
}

const ModelPicker: FC<ModelPickerProps> = ({ currentModel, onSelect, onClose }) => {
  const availableModels = useStore((s: AppState) => s.availableModels, []);
  const disabledModels = useStore((s: AppState) => s.settings.disabledModels, []);

  const [search, setSearch] = useState('');

  const filtered = availableModels
    .filter((m) => !disabledModels.includes(m.id))
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="model-picker-dropdown">
      <div className="model-picker-header">
        <div className="relative group">
          <InputText
            leftIcon="Search"
            rightIcon="Filter"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="py-2 text-xs"
            autoFocus
          />
        </div>
      </div>

      <div className="model-picker-list">
        {filtered.map((model: Model) => (
          <button
            key={model.id}
            onClick={() => {
              onSelect(model.id);
              onClose();
            }}
            className={clsx('model-picker-item', currentModel === model.id && 'model-picker-item-active')}
          >
            <div className={clsx('flex-shrink-0 mt-0.5', model.color)}>
              <Icon name={model.icon} size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={clsx(
                    'text-sm font-medium truncate',
                    currentModel === model.id ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary',
                  )}
                >
                  {model.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
                  {model.isNew && <Icon name="Star" size={12} className="text-yellow-500" />}
                  {currentModel === model.id && <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />}
                </div>
              </div>
              <div className="text-xs text-text-secondary leading-relaxed line-clamp-1 mt-0.5 group-hover:text-text-secondary/80">
                {model.description}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="p-4 text-center text-xs text-text-secondary">No models found</div>}
      </div>
    </div>
  );
};

export const Header: FC = () => {
  const [showModelPicker, setShowModelPicker] = useState(false);

  const settings = useStore((s: AppState) => s.settings, DEFAULT_SETTINGS);
  const activeSessionId = useStore((s: AppState) => s.activeSessionId, null);
  const sessions = useStore((s: AppState) => s.sessions, {});
  const availableModels = useStore((s: AppState) => s.availableModels, []);
  const isSidebarOpen = useStore((s: AppState) => s.isSidebarOpen, true);

  const updateStore = useAction((f: (s: AppState) => AppState) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      return yield* store.update(f);
    }),
  );

  const toggleSidebar = () => updateStore((s) => ({ ...s, isSidebarOpen: !s.isSidebarOpen }));

  const setSessionModel = useAction((sessionId: string, model: string) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;
        return {
          ...state,
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              modelConfig: {
                ...(session.modelConfig || { provider: 'openai', temperature: 0.7 }),
                model,
                provider: 'openai',
              },
            },
          },
        };
      });
    }),
  );

  const setGlobalModel = useAction((modelId: string) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((s) => ({
        ...s,
        settings: { ...s.settings, defaultModel: modelId },
      }));
    }),
  );

  const disabledModels = settings.disabledModels || [];
  const activeModels = availableModels.filter((m) => !disabledModels.includes(m.id));
  const effectiveDefaultModel = activeModels.find((m) => m.id === settings.defaultModel)?.id || activeModels[0]?.id || 'gpt-4o';

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const currentModelId = activeSession?.modelConfig?.model || effectiveDefaultModel;
  const currentModel = activeModels.find((m) => m.id === currentModelId);

  const handleModelSelect = (modelId: string) => {
    setGlobalModel(modelId);
    if (activeSessionId) {
      setSessionModel(activeSessionId, modelId);
    }
    setShowModelPicker(false);
  };

  return (
    <div className="sticky-header">
      <div className="flex items-center gap-2">
        {!isSidebarOpen && (
          <button onClick={toggleSidebar} className="btn-icon" title="Open Sidebar">
            <Icon name="PanelLeftOpen" size={20} />
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-surface transition-colors text-lg font-bold text-text-primary/90 hover:text-text-primary"
          >
            <span>{currentModel?.name || 'Yuji'}</span>
            <Icon name="ChevronDown" size={16} className="text-text-secondary" />
          </button>

          {showModelPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
              <ModelPicker currentModel={currentModelId} onSelect={handleModelSelect} onClose={() => setShowModelPicker(false)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
