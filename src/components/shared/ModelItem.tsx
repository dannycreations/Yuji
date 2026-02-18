import clsx from 'clsx';

import { getModelName } from '../../helpers/ModelHelper';
import { Icon } from './Icon';

import type { FC } from 'react';
import type { Model } from '../../app/Schema';

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
        <Icon name={model.icon} size={18} />
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
