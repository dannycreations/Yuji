import clsx from 'clsx';
import { useRef } from 'react';

import { useClickOutside } from '../../hooks/useClickOutside';
import { Icon } from './Icon';

import type { FC, ReactNode } from 'react';
import type { IconName } from './Icon';

export interface DropdownItemProps {
  readonly icon?: IconName;
  readonly iconClassName?: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly variant?: 'default' | 'danger';
  readonly className?: string;
}

export const DropdownItem: FC<DropdownItemProps> = ({ icon, iconClassName, label, onClick, variant = 'default', className }) => (
  <button
    type="button"
    className={clsx('dropdown-item', variant === 'danger' ? 'danger' : '!text-text-primary', className)}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
  >
    {icon && <Icon name={icon} size={16} className={clsx(variant !== 'danger' && 'text-text-tertiary', iconClassName)} />}
    <span className="flex-1 text-left">{label}</span>
  </button>
);

interface DropdownProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly position: { top: number; left: number };
  readonly children: ReactNode;
  readonly className?: string;
}

export const Dropdown: FC<DropdownProps> = ({ isOpen, onClose, position, children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className={clsx('dropdown-menu fixed w-44 py-1 origin-top-right z-50', className)}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};
