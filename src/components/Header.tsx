import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { useClickOutside } from '../hooks/useClickOutside';
import { useAction, useStore } from '../hooks/useStore';
import { StoreService } from '../services/StoreService';
import { toTitleCase } from '../utilities/CommonUtil';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { AppState, Model } from '../app/Schema';

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

  const { currentModelId, currentModelName } = useMemo(() => {
    const disabled = settings.disabledModels || [];
    const active = availableModels.filter((m) => !disabled.includes(m.id));
    const effectiveDefault = active.find((m) => m.id === settings.defaultModel)?.id || active[0]?.id || 'gpt-4o';

    const session = activeSessionId ? sessions[activeSessionId] : null;
    const id = session?.modelConfig?.model || effectiveDefault;

    const targetId = optimisticModelId || id;
    const model = active.find((m) => m.id === targetId);
    const name = model ? toTitleCase(model.name) : 'Yuji';

    return { currentModelId: id, currentModelName: name };
  }, [availableModels, settings.disabledModels, settings.defaultModel, activeSessionId, sessions, optimisticModelId]);

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
    <div className="sticky-header">
      <div className="flex items-center gap-2">
        {!isSidebarOpen && (
          <button onClick={toggleSidebar} className="btn-icon" title="Open Sidebar">
            <Icon name="PanelLeftOpen" size={20} />
          </button>
        )}

        <div className="relative" ref={pickerRef}>
          <button onClick={() => setShowModelPicker(!showModelPicker)} className="header-model-button">
            <span>{currentModelName}</span>
            <Icon name="ChevronDown" size={16} className="text-text-secondary" />
          </button>

          {showModelPicker && <ModelPicker currentModel={currentModelId} onSelect={handleModelSelect} onClose={() => setShowModelPicker(false)} />}
        </div>
      </div>
    </div>
  );
};
