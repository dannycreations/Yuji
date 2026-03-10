import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useClickOutside } from '../../../hooks/useClickOutside';
import { ButtonInput } from '../InputArea';

import type { FC, ReactNode } from 'react';

export const ModalHeader: FC<{ readonly title: ReactNode; readonly onClose?: () => void }> = ({ title, onClose }) => (
  <div className="modal-header">
    <div className="header-title">{title}</div>
    {onClose && (
      <ButtonInput onClick={onClose} className="ml-auto">
        <X size={18} />
      </ButtonInput>
    )}
  </div>
);

export const ModalFooter: FC<{ readonly children: ReactNode; readonly className?: string }> = ({ children, className }) => (
  <div className={clsx('modal-footer', className)}>{children}</div>
);

interface ModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly containerClassName?: string;
}

export const Modal: FC<ModalProps> = ({ isOpen, onClose, children, className, containerClassName }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, onClose);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className={clsx('modal-overlay', className)} onClick={(e) => e.stopPropagation()}>
      <div ref={containerRef} className={clsx('modal-container', containerClassName)} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
};
