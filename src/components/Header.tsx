import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { filterModels, getActiveModels, getCurrentModelId, getModelName } from '../helpers/ModelHelper';
import { useClickOutside } from '../hooks/useClickOutside';
import { useStore, useStoreAction, useToggleSidebar, useUpdateSetting } from '../hooks/useStore';
import { ChatService } from '../services/ChatService';
import { Button } from './shared/Button';
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
  const availableModels = useStore((s) => s.availableModels);
  const settings = useStore((s) => s.settings);
  const disabledModels = settings.disabledModels;

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const active = getActiveModels(availableModels, disabledModels);
    return filterModels(active, search);
  }, [availableModels, disabledModels, search]);

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
              <span className="model-picker-item-title block">{getModelName(availableModels, model.id)}</span>
              <div className="model-picker-item-id">{model.id}</div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
              {model.isNew && <Icon name="Star" size={12} className="text-yellow-500" />}
              {currentModel === model.id && <Icon name="Check" size={18} className="text-primary" />}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="p-3 text-center text-xs text-text-tertiary">No models found</div>}
      </div>
    </div>
  );
};

export const Header: FC = () => {
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [optimisticModelId, setOptimisticModelId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useClickOutside(pickerRef, () => setShowModelPicker(false));

  const settings = useStore((s) => s.settings);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const activeSession = useStore((s) => s.activeSession);
  const availableModels = useStore((s) => s.availableModels);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);

  const toggleSidebar = useToggleSidebar();
  const updateSetting = useUpdateSetting();

  const setSessionModel = useStoreAction((_, model: string) =>
    Effect.flatMap(ChatService, (chat) =>
      chat.updateActiveSession((s) => ({
        ...s,
        general: { ...s.general, model },
      })),
    ),
  );

  const currentModelId = useMemo(() => getCurrentModelId(activeSession, settings, availableModels), [settings, availableModels, activeSession]);

  const currentModelName = useMemo(() => {
    const id = optimisticModelId || currentModelId;
    return getModelName(availableModels, id);
  }, [availableModels, currentModelId, optimisticModelId]);

  const handleModelSelect = (modelId: string) => {
    // 1. Immediate UI feedback (High Priority)
    setOptimisticModelId(modelId);
    setShowModelPicker(false);

    // 2. Defer heavy store mutations (Low Priority)
    setTimeout(() => {
      updateSetting({ model: modelId });
      if (activeSessionId) {
        setSessionModel(modelId);
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
          <Button variant="ghost" size="icon" onClick={toggleSidebar} title="Open Sidebar">
            <Icon name="PanelLeftOpen" size={20} />
          </Button>
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
