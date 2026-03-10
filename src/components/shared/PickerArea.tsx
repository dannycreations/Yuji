import clsx from 'clsx';
import { Check, Cpu, MessageSquare, Plus, Zap } from 'lucide-react';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { getFilteredModels, getModelName } from '../../helpers/ModelHelper';
import { useStore } from '../../hooks/useStore';
import { toTitleCase } from '../../utilities/CommonUtil';
import { Dropdown } from './Dropdown';
import { ButtonInput, SearchInput } from './InputArea';

import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, ComponentProps, FC, RefObject } from 'react';
import type { Model } from '../../app/Schema';

const MODE_LIST = [
  { id: 'chat', icon: MessageSquare, description: 'Standard conversation mode' },
  { id: 'agent', icon: Zap, description: 'Autonomous task execution' },
] as const;

export const ModePicker: FC<{
  readonly isOpen: boolean;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly currentMode: 'chat' | 'agent';
  readonly onSelect: (mode: 'chat' | 'agent') => void;
  readonly onClose: () => void;
}> = ({ isOpen, triggerRef, currentMode, onSelect, onClose }) => {
  return (
    <Dropdown isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} className="model-picker-dropdown">
      <div className="model-picker-list">
        {MODE_LIST.map((mode) => (
          <button
            key={mode.id}
            onClick={() => {
              onSelect(mode.id);
              onClose();
            }}
            className={`model-picker-item group items-center ${currentMode === mode.id ? 'active' : ''}`}
          >
            <div className={`flex-shrink-0 ${currentMode === mode.id ? 'text-primary' : 'text-text-tertiary'}`}>
              <mode.icon size={18} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className={`model-picker-item-title block ${currentMode === mode.id ? 'text-text-primary' : ''}`}>{toTitleCase(mode.id)}</span>
              </div>
              <div className="model-picker-item-id">{mode.description}</div>
            </div>
            {currentMode === mode.id && <Check size={18} className="text-primary" />}
          </button>
        ))}
      </div>
    </Dropdown>
  );
};

interface ModelItemProps {
  readonly model: Model;
  readonly availableModels: readonly Model[];
  readonly isActive?: boolean;
  readonly isEnabled?: boolean;
  readonly isDefault?: boolean;
  readonly showDescription?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly rightContent?: React.ReactNode;
}

export const ModelItem: FC<ModelItemProps> = ({
  model,
  availableModels,
  isActive,
  isEnabled = true,
  isDefault,
  onClick,
  className,
  rightContent,
}) => {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component onClick={onClick} className={clsx('model-picker-item group items-center', isActive && 'active', className)}>
      <div className={clsx('flex-shrink-0', isEnabled ? model.color || 'text-text-tertiary' : 'text-text-tertiary')}>
        <Cpu size={18} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className={clsx('model-picker-item-title block', !isEnabled && 'text-text-tertiary')}>{getModelName(availableModels, model.id)}</span>
          {isDefault && isEnabled && <div className="badge-primary">Default</div>}
        </div>
        <div className="model-picker-item-id">{model.id}</div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">{rightContent}</div>
    </Component>
  );
};

interface ModelPickerProps {
  readonly isOpen: boolean;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly currentModel: string;
  readonly onSelect: (modelId: string) => void;
  readonly onClose: () => void;
  readonly className?: string;
}

export const ModelPicker: FC<ModelPickerProps> = ({ isOpen, triggerRef, currentModel, onSelect, onClose, className }) => {
  const availableModels = useStore((s) => s.availableModels);
  const settings = useStore((s) => s.settings);
  const disabledModels = settings.disabledModels;

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => getFilteredModels(availableModels, disabledModels, search), [availableModels, disabledModels, search]);

  return (
    <Dropdown isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} className={className || 'model-picker-dropdown'}>
      <div className="model-picker-header">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models..." className="input-sm" autoFocus />
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
            rightContent={currentModel === model.id && <Check size={18} className="text-primary" />}
          />
        ))}
        {filtered.length === 0 && <div className="model-picker-empty">No models found</div>}
      </div>
    </Dropdown>
  );
};

interface FilePickerProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'ref'> {
  readonly onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly icon?: LucideIcon;
  readonly iconSize?: number;
  readonly buttonClassName?: string;
  readonly buttonVariant?: ComponentProps<typeof ButtonInput>['variant'];
}

export const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(
  ({ onFileSelect, icon: IconComponent = Plus, iconSize = 22, buttonClassName = 'p-1!', buttonVariant = 'ghost', title, ...props }, ref) => {
    const internalRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => internalRef.current!);

    return (
      <>
        <input type="file" className="hidden" ref={internalRef} onChange={onFileSelect} {...props} />
        <ButtonInput onClick={() => internalRef.current?.click()} title={title} className={buttonClassName} variant={buttonVariant}>
          <IconComponent size={iconSize} />
        </ButtonInput>
      </>
    );
  },
);
