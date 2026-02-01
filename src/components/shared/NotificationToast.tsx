import { Effect } from 'effect';
import { useEffect } from 'react';

import { useAction, useStore } from '../../hooks/useStore';
import { StoreService } from '../../services/StoreService';
import { Icon } from './Icon';

import type { AppState, Notification } from '../../app/Schema';

const TOAST_VARIANTS = {
  error: {
    icon: 'AlertCircle',
    className: 'bg-red-500/10 text-red-400',
    lineColor: 'bg-red-500',
  },
  warning: {
    icon: 'AlertTriangle',
    className: 'bg-amber-500/10 text-amber-400',
    lineColor: 'bg-amber-500',
  },
  info: {
    icon: 'Info',
    className: 'bg-blue-500/10 text-blue-400',
    lineColor: 'bg-blue-500',
  },
  success: {
    icon: 'CheckCircle',
    className: 'bg-emerald-500/10 text-emerald-400',
    lineColor: 'bg-emerald-500',
  },
} as const;

const ToastItem = ({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) => {
  const duration = 5000;
  const variant = TOAST_VARIANTS[notification.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, duration);
    return () => {
      clearTimeout(timer);
    };
  }, [notification.id, notification.timestamp, onDismiss]);

  return (
    <div
      className={`pointer-events-auto relative flex items-center gap-3 p-3 rounded-xl border border-line bg-surface/90 backdrop-blur-md shadow-2xl min-w-[320px] max-w-md overflow-hidden animate-in slide-in-from-right-8 fade-in duration-300`}
    >
      {/* Vertical Line */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${variant.lineColor}`} />

      {/* Icon Wrapper */}
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${variant.className}`}>
        <Icon name={variant.icon} size={18} />
      </div>

      {/* Content */}
      <div className="flex-1 text-sm font-medium text-text-primary pr-2">{notification.message}</div>

      {/* Close Button */}
      <button
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 p-1 hover:bg-surface-hover rounded-md text-text-tertiary hover:text-text-primary transition-all"
      >
        <Icon name="X" size={16} />
      </button>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-separator/20">
        <div
          key={notification.timestamp}
          className={`h-full w-full ${variant.lineColor} origin-left`}
          style={{
            animation: `progress ${duration}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
};

export const NotificationToast = () => {
  const notifications = useStore((s: AppState) => s.notifications, []);
  const clearNotification = useAction((id: string) => StoreService.pipe(Effect.flatMap((s) => s.clearNotification(id))));

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onDismiss={clearNotification} />
      ))}
    </div>
  );
};
