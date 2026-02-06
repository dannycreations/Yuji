import clsx from 'clsx';
import { Effect } from 'effect';
import { useRef } from 'react';

import { useClickOutside } from '../../../hooks/useClickOutside';
import { useModalAnimation } from '../../../hooks/useModalAnimation';
import { useStore, useStoreEffect } from '../../../hooks/useStore';
import { StoreService } from '../../../services/StoreService';
import { Button } from '../Button';

import type { FC } from 'react';

export const ConfirmModal: FC = () => {
  const confirm = useStore((s) => s.confirm);
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', id, variant = 'danger' } = confirm;
  const containerRef = useRef<HTMLDivElement>(null);

  const onCancel = useStoreEffect(() =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      if (id) yield* store.clearConfirm(id);
      yield* store.update((s) => ({ ...s, confirm: { ...s.confirm, isOpen: false } }));
    }),
  );

  const onConfirm = useStoreEffect(() =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      if (id) {
        const onConfirm = yield* store.getOnConfirm(id);
        if (onConfirm) onConfirm();
        yield* store.clearConfirm(id);
      }
      yield* store.update((s) => ({ ...s, confirm: { ...s.confirm, isOpen: false } }));
    }),
  );

  const { isClosing, handleClose } = useModalAnimation(onCancel);

  useClickOutside(containerRef, handleClose);

  if (!confirm.isOpen) return null;

  return (
    <div className={clsx('modal-overlay', isClosing ? 'animate-fade-out' : 'animate-fade-in')}>
      <div ref={containerRef} className={clsx('confirm-modal-container', isClosing ? 'animate-slide-down' : 'animate-slide-up')}>
        <div className="confirm-modal-content">
          <div className="modal-header">
            <h3 className="header-title">{title}</h3>
          </div>
          <div className="confirm-modal-message">
            {message
              .split(/(\*\*.*?\*\*)/)
              .map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}
          </div>
        </div>

        <div className="confirm-modal-actions">
          <Button onClick={handleClose}>{cancelLabel}</Button>
          <Button onClick={onConfirm} variant={variant === 'info' ? 'primary' : variant}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
