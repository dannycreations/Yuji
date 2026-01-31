import clsx from 'clsx';
import { Effect } from 'effect';
import { useRef, useState } from 'react';

import { YujiRuntime } from '../../app/Yuji';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useStore } from '../../hooks/useStore';
import { StoreService } from '../../services/StoreService';
import { Icon } from './Icon';

import type { FC } from 'react';
import type { AppState } from '../../app/Schema';

export const ConfirmModal: FC = () => {
  const confirm = useStore((s: AppState) => s.confirm, {
    isOpen: false,
    title: '',
    message: '',
  });

  const [isClosing, setIsClosing] = useState(false);

  if (!confirm.isOpen) return null;

  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', id, variant = 'danger' } = confirm;

  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      className={clsx(
        'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4',
        isClosing ? 'animate-fade-out' : 'animate-fade-in',
      )}
    >
      <div
        ref={containerRef}
        className={clsx(
          'w-full max-w-sm bg-surface border border-surface_light rounded-2xl shadow-2xl overflow-hidden',
          isClosing ? 'animate-slide-down' : 'animate-slide-up',
        )}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className={clsx(
                'p-2 rounded-xl',
                variant === 'danger' && 'bg-red-500/10 text-red-500',
                variant === 'warning' && 'bg-amber-500/10 text-amber-500',
                variant === 'info' && 'bg-blue-500/10 text-blue-500',
              )}
            >
              <Icon name={variant === 'danger' ? 'Trash2' : 'AlertTriangle'} size={20} />
            </div>
            <h3 className="text-lg font-display font-bold text-white tracking-tight">{title}</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{message}</p>
        </div>

        <div className="flex px-6 py-4 bg-surface_light/20 border-t border-surface_light gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 text-zinc-400 hover:text-white text-xs font-semibold transition-colors rounded-xl hover:bg-white/5"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={clsx(
              'flex-1 px-4 py-2.5 text-white text-xs font-bold rounded-xl transition-all shadow-lg active:scale-95 duration-100',
              variant === 'danger' && 'bg-red-500 hover:bg-red-600 shadow-red-500/10',
              variant === 'warning' && 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10',
              variant === 'info' && 'bg-primary hover:bg-primary_hover shadow-primary/10',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
