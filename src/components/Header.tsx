import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { useClickOutside } from '../hooks/useClickOutside';
import { useAction, useStore, useUpdateStore } from '../hooks/useStore';
import { StoreService } from '../services/StoreService';
import { toTitleCase } from '../utilities/CommonUtil';
import { getEffectiveModelId, getModelName } from '../utilities/ModelUtil';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { Model } from '../app/Schema';

interface ModelPickerProps {
  readonly currentModel: string;
  readonly onSelect: (modelId: string) => void;
  readonly onClose: () => void;
}

const ModelPicker: FC<ModelPickerProps> = ({ currentModel, onSelect, onClose }) => {
  const { availableModels, disabledModels } = useStore(
    (s) => ({
      availableModels: s.availableModels,
      disabledModels: s.settings.disabledModels,
    }),
    { availableModels: [], disabledModels: [] },
  );

  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      availableModels
        .filter((m) => !disabledModels.includes(m.id))
        .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase())),
    [availableModels, disabledModels, search],
  );

  return (
    <div className="model-picker-dropdown">
      <div className="model-picker-header">
        <InputSearch value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models..." className="input-sm" autoFocus />
      </div>

      <div className="model-picker-list">
        {filtered.map((model: Model) => (
          <button
            key={model.id}
            onClick={() => {
              onSelect(model.id);
              onClose();
            }}
            className={clsx('model-picker-item group items-center', currentModel === model.id && 'active')}
          >
            <div className={clsx('flex-shrink-0', model.color)}>
              <Icon name={model.icon} size={18} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <span className="model-picker-item-title block">{toTitleCase(model.name)}</span>
              <div className="text-[10px] text-text-secondary leading-tight line-clamp-1 group-hover:text-text-secondary/80">{model.id}</div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
              {model.isNew && <Icon name="Star" size={12} className="text-yellow-500" />}
              {currentModel === model.id && <Icon name="Check" size={18} className="text-primary" />}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="p-3 text-center text-xs text-text-secondary">No models found</div>}
      </div>
    </div>
  );
};

export const Header: FC = () => {
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [optimisticModelId, setOptimisticModelId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useClickOutside(pickerRef, () => setShowModelPicker(false));

  const { settings, activeSessionId, sessions, availableModels, isSidebarOpen } = useStore(
    (s) => ({
      settings: s.settings,
      activeSessionId: s.activeSessionId,
      sessions: s.sessions,
      availableModels: s.availableModels,
      isSidebarOpen: s.isSidebarOpen,
    }),
    {
      settings: DEFAULT_SETTINGS,
      activeSessionId: null,
      sessions: {},
      availableModels: [],
      isSidebarOpen: true,
    },
  );

  const updateStore = useUpdateStore();

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
              general: {
                ...session.general,
                model,
                overrideModel: true,
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

  const { currentModelId, currentModelName } = useMemo(() => {
    const id = getEffectiveModelId(settings, availableModels, sessions, activeSessionId);
    const name = getModelName(availableModels, optimisticModelId || id);

    return { currentModelId: id, currentModelName: name };
  }, [availableModels, settings, activeSessionId, sessions, optimisticModelId]);

  const handleModelSelect = (modelId: string) => {
    // 1. Immediate UI feedback (High Priority)
    setOptimisticModelId(modelId);
    setShowModelPicker(false);

    // 2. Defer heavy store mutations (Low Priority)
    setTimeout(() => {
      setGlobalModel(modelId);
      if (activeSessionId) {
        setSessionModel(activeSessionId, modelId);
      }
    }, 0);
  };

  if (optimisticModelId && optimisticModelId === currentModelId && optimisticModelId !== null) {
    setOptimisticModelId(null);
  }

  return (
    <div className="sticky-header border-b border-separator">
      <div className="flex items-center gap-2">
        {!isSidebarOpen && (
          <button onClick={toggleSidebar} className="btn-icon" title="Open Sidebar">
            <Icon name="PanelLeftOpen" size={20} />
          </button>
        )}

        <div className="relative" ref={pickerRef}>
          <button onClick={() => setShowModelPicker(!showModelPicker)} className="header-model-button">
            <span className="header-title">{currentModelName}</span>
            <Icon name="ChevronDown" size={16} className="text-text-secondary" />
          </button>

          {showModelPicker && <ModelPicker currentModel={currentModelId} onSelect={handleModelSelect} onClose={() => setShowModelPicker(false)} />}
        </div>
      </div>
    </div>
  );
};
