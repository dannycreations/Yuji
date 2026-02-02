import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { getEffectiveModelId, getEffectiveModelName, getModelName } from '../helpers/ModelHelper';
import { useClickOutside } from '../hooks/useClickOutside';
import { useStore, useStoreEffect, useToggleSidebar, useUpdateSetting } from '../hooks/useStore';
import { ChatService } from '../services/ChatService';
import { toTitleCase } from '../utilities/CommonUtil';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { ChatSession, Model } from '../app/Schema';

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

  const settings = useStore((s) => s.settings);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const sessions = useStore((s) => s.sessions);
  const availableModels = useStore((s) => s.availableModels);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);

  const toggleSidebar = useToggleSidebar();
  const updateSetting = useUpdateSetting();

  const setSessionModel = useStoreEffect((sessionId: string, model: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateSession(sessionId, (s: ChatSession) => ({
        ...s,
        general: { ...s.general, model },
      }));
    }),
  );

  const { currentModelId, currentModelName } = useMemo(() => {
    const id = getEffectiveModelId(settings, availableModels, sessions, activeSessionId);
    const name = optimisticModelId
      ? getModelName(availableModels, optimisticModelId)
      : getEffectiveModelName(settings, availableModels, sessions, activeSessionId);

    return { currentModelId: id, currentModelName: name };
  }, [availableModels, settings, activeSessionId, sessions, optimisticModelId]);

  const handleModelSelect = (modelId: string) => {
    // 1. Immediate UI feedback (High Priority)
    setOptimisticModelId(modelId);
    setShowModelPicker(false);

    // 2. Defer heavy store mutations (Low Priority)
    setTimeout(() => {
      updateSetting({ model: modelId });
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
