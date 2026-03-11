import clsx from 'clsx';
import { Check, Cpu, Plus } from 'lucide-react';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { MODE_LIST } from '../../app/Constant';
import { getFilteredModels, getModelName } from '../../helpers/ModelHelper';
import { useStore } from '../../hooks/useStore';
import { Dropdown, DropdownItem } from './Dropdown';
import { ButtonInput, SearchInput } from './InputArea';

import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, ComponentProps, FC, ReactNode, RefObject } from 'react';

export interface PickerItemProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: LucideIcon;
  readonly iconColor?: string;
  readonly isActive?: boolean;
  readonly isEnabled?: boolean;
  readonly onClick?: () => void;
  readonly rightContent?: ReactNode;
  readonly className?: string;
  readonly badges?: ReactNode;
}

export const PickerItem: FC<PickerItemProps> = ({
  title,
  description,
  icon: Icon,
  iconColor,
  isActive,
  isEnabled = true,
  onClick,
  rightContent,
  className,
  badges,
}) => {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={clsx('model-picker-item group items-center', isActive && 'active', !isEnabled && 'opacity-60', className)}
    >
      {Icon && (
        <div className={clsx('flex-shrink-0 mt-0.5', isEnabled ? iconColor || 'text-text-tertiary' : 'text-text-tertiary')}>
          <Icon size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className={clsx('model-picker-item-title block truncate', !isEnabled && 'text-text-tertiary')}>{title}</span>
          {badges}
        </div>
        {description && <div className="model-picker-item-description truncate">{description}</div>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">{rightContent}</div>
    </Component>
  );
};

interface ModeItemProps {
  readonly isOpen: boolean;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly className?: string;
  readonly onSelect: (mode: 'chat' | 'agent') => void;
  readonly onClose: () => void;
  readonly ignoreRef?: RefObject<HTMLElement | null>;
}

export const ModePicker: FC<ModeItemProps> = ({ isOpen, triggerRef, onSelect, onClose, className, ignoreRef }) => {
  const availableTools = useStore((s) => s.availableTools);
  const hasTools = availableTools.length > 0;

  return (
    <Dropdown isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} className={clsx('w-[200px]', className)} ignoreRef={ignoreRef}>
      {MODE_LIST.map((mode) => {
        const isDisabled = mode.id === 'agent' && !hasTools;
        return (
          <DropdownItem
            key={mode.id}
            icon={mode.icon}
            label={mode.title}
            description={isDisabled ? 'No tools available' : mode.description}
            disabled={isDisabled}
            onMouseDown={(e) => {
              if (isDisabled) return;
              e.preventDefault();
              onSelect(mode.id);
              onClose();
            }}
          />
        );
      })}
    </Dropdown>
  );
};

interface ModelPickerProps {
  readonly isOpen: boolean;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly currentModel: string;
  readonly onSelect: (modelId: string) => void;
  readonly onClose: () => void;
  readonly className?: string;
  readonly ignoreRef?: RefObject<HTMLElement | null>;
}

export const ModelPicker: FC<ModelPickerProps> = ({ isOpen, triggerRef, currentModel, onSelect, onClose, className, ignoreRef }) => {
  const availableModels = useStore((s) => s.availableModels);
  const settings = useStore((s) => s.settings);
  const disabledModels = settings.disabledModels;

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => getFilteredModels(availableModels, disabledModels, search), [availableModels, disabledModels, search]);

  return (
    <Dropdown isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} className={className || 'model-picker-dropdown'} ignoreRef={ignoreRef}>
      <div className="model-picker-header">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models..." className="input-sm" autoFocus />
      </div>

      <div className="model-picker-list h-[320px]">
        {filtered.map((model) => (
          <PickerItem
            key={model.id}
            title={getModelName(availableModels, model.id)}
            description={model.id}
            icon={Cpu}
            iconColor={model.color}
            isActive={currentModel === model.id}
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
