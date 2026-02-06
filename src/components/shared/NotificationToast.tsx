import clsx from 'clsx';
import { useEffect } from 'react';

import { useStore, useStoreAction } from '../../hooks/useStore';
import { Icon } from './Icon';

import type { Notification } from '../../app/Schema';

const TOAST_VARIANTS = {
  error: {
    icon: 'AlertCircle',
    variantClass: 'toast-variant-error',
  },
  warning: {
    icon: 'AlertTriangle',
    variantClass: 'toast-variant-warning',
  },
  info: {
    icon: 'Info',
    variantClass: 'toast-variant-info',
  },
  success: {
    icon: 'CheckCircle',
    variantClass: 'toast-variant-success',
  },
} as const;

const ToastItem = ({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) => {
  const duration = 5000;
  const { icon, variantClass } = TOAST_VARIANTS[notification.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, duration);
    return () => {
      clearTimeout(timer);
    };
  }, [notification.id, notification.timestamp, onDismiss]);

  return (
    <div className={clsx('toast-container animate-in slide-in-from-right-8 fade-in duration-300', variantClass)}>
      <div className="toast-line" />

      <div className="toast-icon-wrapper">
        <Icon name={icon} size={18} />
      </div>

      <div className="flex-1 text-sm font-medium text-text-primary pr-2">{notification.message}</div>

      <button onClick={() => onDismiss(notification.id)} className="toast-dismiss-btn">
        <Icon name="X" size={16} />
      </button>

      <div className="toast-progress-track">
        <div
          key={notification.timestamp}
          className="toast-line h-full w-full origin-left"
          style={{ animation: `progress ${duration}ms linear forwards` }}
        />
      </div>
    </div>
  );
};

export const NotificationToast = () => {
  const notifications = useStore((s) => s.notifications);
  const clearNotification = useStoreAction((s, id: string) => s.clearNotification(id));

  return (
    <div className="fixed top-4 right-4 z-notification flex flex-col gap-2 pointer-events-none w-notification">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onDismiss={clearNotification} />
      ))}
    </div>
  );
};
