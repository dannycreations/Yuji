import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { getCurrentModelId, getFilteredModels, getModelName } from '../helpers/ModelHelper';
import { useClickOutside } from '../hooks/useClickOutside';
import { useStore, useStoreAction } from '../hooks/useStore';
import { ChatService } from '../services/ChatService';
import { Button } from './shared/Button';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';
import { ModelItem } from './shared/ModelItem';

import type { FC } from 'react';
import type { GlobalSettings } from '../app/Schema';

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

  const filtered = useMemo(() => getFilteredModels(availableModels, disabledModels, search), [availableModels, disabledModels, search]);

  return (
    <div className="model-picker-dropdown">
      <div className="model-picker-header">
        <InputSearch value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models..." className="input-sm" autoFocus />
      </div>

      <div className="model-picker-list">
        {filtered.map((model) => (
          <ModelItem
            key={model.id}
            model={model}
            availableModels={availableModels}
            isActive={currentModel === model.id}
            showDescription={false}
            onClick={() => {
              onSelect(model.id);
              onClose();
            }}
            rightContent={currentModel === model.id && <Icon name="Check" size={18} className="text-primary" />}
          />
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

  const toggleSidebar = useStoreAction((s) => s.toggle('isSidebarOpen'));
  const updateSetting = useStoreAction((s, updates: Partial<GlobalSettings>) => s.updateSetting(updates));

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
