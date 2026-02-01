import clsx from 'clsx';
import { Effect } from 'effect';
import { useRef, useState } from 'react';

import { YujiRuntime } from '../../../app/Yuji';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { useStore } from '../../../hooks/useStore';
import { StoreService } from '../../../services/StoreService';

import type { FC } from 'react';
import type { AppState } from '../../../app/Schema';

export const ConfirmModal: FC = () => {
  const confirm = useStore((s: AppState) => s.confirm, {
    isOpen: false,
    title: '',
    message: '',
  });

  const [isClosing, setIsClosing] = useState(false);

  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', id, variant = 'danger' } = confirm;

  const containerRef = useRef<HTMLDivElement>(null);

  const handleCancel = () => {
    setIsClosing(true);
    setTimeout(() => {
      YujiRuntime.runPromise(
        Effect.gen(function* () {
          const store = yield* StoreService;
          if (id) {
            yield* store.clearConfirm(id);
          }
          yield* store.update((s) => ({ ...s, confirm: { ...s.confirm, isOpen: false } }));
          setIsClosing(false);
        }),
      );
    }, 200);
  };

  useClickOutside(containerRef, handleCancel);

  if (!confirm.isOpen) return null;

  const handleConfirm = () => {
    YujiRuntime.runPromise(
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
  };

  return (
    <div className={clsx('modal-overlay z-[100]', isClosing ? 'animate-fade-out' : 'animate-fade-in')}>
      <div ref={containerRef} className={clsx('w-full max-w-[440px] modal-container', isClosing ? 'animate-slide-down' : 'animate-slide-up')}>
        <div className="px-6 pt-6 pb-4">
          <h3 className="text-[20px] font-semibold text-text-primary mb-5">{title}</h3>
          <div className="text-[15px] text-text-primary leading-relaxed">
            {message
              .split(/(\*\*.*?\*\*)/)
              .map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}
          </div>
        </div>

        <div className="flex justify-end px-6 pb-6 gap-3">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 text-[14px] font-semibold text-text-primary bg-[#424242] hover:bg-[#4d4d4d] rounded-full transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={clsx(
              'px-5 py-2.5 text-[14px] font-semibold text-white rounded-full transition-colors',
              variant === 'danger' && 'bg-[#d32f2f] hover:bg-[#e53935]',
              variant === 'warning' && 'bg-amber-500 hover:bg-amber-600',
              variant === 'info' && 'bg-primary text-black',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
