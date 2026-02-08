import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useClickOutside } from '../../../hooks/useClickOutside';
import { useModalAnimation } from '../../../hooks/useModalAnimation';
import { Button } from '../Button';
import { Icon } from '../Icon';

import type { FC, ReactNode } from 'react';

export const ModalHeader: FC<{ readonly title: ReactNode; readonly onClose?: () => void }> = ({ title, onClose }) => (
  <div className="modal-header">
    <div className="header-title">{title}</div>
    {onClose && (
      <Button variant="ghost" size="icon" onClick={onClose} className="ml-auto">
        <Icon name="X" size={18} />
      </Button>
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
  const { isClosing, handleClose } = useModalAnimation(onClose);

  useClickOutside(containerRef, handleClose);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className={clsx('modal-overlay', isClosing ? 'animate-fade-out' : 'animate-fade-in', className)}>
      <div ref={containerRef} className={clsx('modal-container', isClosing ? 'animate-slide-down' : 'animate-slide-up', containerClassName)}>
        {children}
      </div>
    </div>,
    document.body,
  );
};
