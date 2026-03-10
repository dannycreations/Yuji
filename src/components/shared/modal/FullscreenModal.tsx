import clsx from 'clsx';
import { X } from 'lucide-react';

import { ButtonInput } from '../InputArea';
import { Modal } from './Modal';

import type { FC, ReactNode } from 'react';

interface FullscreenModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly children: ReactNode;
  readonly headerActions?: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
}

export const FullscreenModal: FC<FullscreenModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  headerActions,
  className,
  bodyClassName,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className={clsx('p-0 bg-background', className)}
      containerClassName="w-full h-full max-w-none rounded-none flex flex-col overflow-hidden"
    >
      <div className="fullscreen-modal-header" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex flex-col min-w-0">
          {title && <h3 className="text-sm font-medium text-text-primary truncate">{title}</h3>}
          {subtitle && <p className="text-xs text-text-tertiary truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {headerActions && <div className="w-px h-4 bg-separator/50 mx-1" />}
          <ButtonInput onClick={onClose} title="Close">
            <X size={18} />
          </ButtonInput>
        </div>
      </div>
      <div className={clsx('fullscreen-modal-body', bodyClassName)} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </Modal>
  );
};
