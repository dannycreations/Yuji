import clsx from 'clsx';
import { Effect } from 'effect';
import { useRef, useState } from 'react';

import { useClickOutside } from '../../../hooks/useClickOutside';
import { useStore, useStoreEffect } from '../../../hooks/useStore';
import { StoreService } from '../../../services/StoreService';

import type { FC } from 'react';

export const ConfirmModal: FC = () => {
  const confirm = useStore((s) => s.confirm);

  const [isClosing, setIsClosing] = useState(false);

  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', id, variant = 'danger' } = confirm;

  const containerRef = useRef<HTMLDivElement>(null);

  const onCancel = useStoreEffect(() =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      if (id) yield* store.clearConfirm(id);
      yield* store.update((s) => ({ ...s, confirm: { ...s.confirm, isOpen: false } }));
      setIsClosing(false);
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

  const handleCancel = () => {
    setIsClosing(true);
    // Slightly shorter than animation to ensure state update happens before animation finish
    setTimeout(onCancel, 180);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  useClickOutside(containerRef, handleCancel);

  if (!confirm.isOpen) return null;

  return (
    <div className={clsx('modal-overlay z-[100]', isClosing ? 'animate-fade-out' : 'animate-fade-in')}>
      <div ref={containerRef} className={clsx('confirm-modal-container', isClosing ? 'animate-slide-down' : 'animate-slide-up')}>
        <div className="confirm-modal-content">
          <h3 className="header-title modal-header">{title}</h3>
          <div className="confirm-modal-message">
            {message
              .split(/(\*\*.*?\*\*)/)
              .map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}
          </div>
        </div>

        <div className="confirm-modal-actions">
          <button onClick={handleCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={clsx(variant === 'danger' && 'btn-danger', variant === 'warning' && 'btn-warning', variant === 'info' && 'btn-primary')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
