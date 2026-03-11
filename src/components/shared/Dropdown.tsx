import clsx from 'clsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useClickOutside } from '../../hooks/useClickOutside';

import type { LucideIcon } from 'lucide-react';
import type { FC, ReactNode, RefObject } from 'react';

export interface DropdownItemProps {
  readonly icon?: LucideIcon;
  readonly iconClassName?: string;
  readonly label: string;
  readonly description?: string;
  readonly onClick?: () => void;
  readonly onMouseDown?: (e: React.MouseEvent) => void;
  readonly variant?: 'default' | 'danger';
  readonly className?: string;
}

export const DropdownItem: FC<DropdownItemProps> = ({
  icon: IconComponent,
  iconClassName,
  label,
  description,
  onClick,
  onMouseDown,
  variant = 'default',
  className,
}) => {
  return (
    <button
      type="button"
      className={clsx('dropdown-item', variant === 'danger' ? 'danger' : 'text-text-primary', className)}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {IconComponent && <IconComponent size={16} className={clsx(variant !== 'danger' && 'text-text-tertiary', iconClassName)} />}
      <div className="flex-1 min-w-0 text-left">
        <div className="font-medium truncate">{label}</div>
        {description && <div className="text-[11px] text-text-tertiary truncate leading-tight mt-0.5">{description}</div>}
      </div>
    </button>
  );
};

interface DropdownProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
  readonly className?: string;
}

export const Dropdown: FC<DropdownProps> = ({ isOpen, onClose, triggerRef, children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useClickOutside(ref, onClose);

  useEffect(() => {
    if (!isOpen) return;

    const preventDefault = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };

    window.addEventListener('wheel', preventDefault, { passive: false });
    window.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      window.removeEventListener('wheel', preventDefault);
      window.removeEventListener('touchmove', preventDefault);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    const updatePosition = () => {
      if (isOpen && triggerRef.current && ref.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const dropdownRect = ref.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Default to opening downwards
        let top = triggerRect.bottom + 4;
        // Align dropdown left edge with trigger left edge to match icon vertical alignment
        let left = triggerRect.left - 4;

        const MARGIN = 12;
        const spaceBelow = viewportHeight - triggerRect.bottom - MARGIN;
        const spaceAbove = triggerRect.top - MARGIN;

        // If opening downwards would clip AND opening upwards provides more space or fits
        if (spaceBelow < dropdownRect.height && spaceAbove > spaceBelow) {
          top = triggerRect.top - dropdownRect.height - 4;
        }

        // Ensure we don't bleed out of top/bottom regardless of choice
        if (top < MARGIN) {
          top = MARGIN;
        } else if (top + dropdownRect.height > viewportHeight - MARGIN) {
          top = viewportHeight - dropdownRect.height - MARGIN;
        }

        // Horizontal boundary check
        if (left < 4) {
          left = 4;
        } else if (left + dropdownRect.width > viewportWidth - 4) {
          left = viewportWidth - dropdownRect.width - 4;
        }

        setCoords({ top, left });
      } else if (!isOpen) {
        setCoords(null);
      }
    };

    updatePosition();

    if (isOpen) {
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  const content = (
    <div
      ref={ref}
      className={clsx('dropdown-menu fixed origin-top-left', className)}
      style={{
        top: coords ? `${coords.top}px` : '-9999px',
        left: coords ? `${coords.left}px` : '-9999px',
        opacity: coords ? 1 : 0,
        pointerEvents: coords ? 'auto' : 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );

  return createPortal(content, document.body);
};
