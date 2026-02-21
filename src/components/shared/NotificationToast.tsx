import clsx from 'clsx';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

import { useStore, useStoreAction } from '../../hooks/useStore';

import type { CSSProperties } from 'react';
import type { Notification } from '../../app/Schema';

const TOAST_VARIANTS = {
  error: {
    icon: AlertCircle,
    variantClass: 'toast-variant-error',
  },
  warning: {
    icon: AlertTriangle,
    variantClass: 'toast-variant-warning',
  },
  info: {
    icon: Info,
    variantClass: 'toast-variant-info',
  },
  success: {
    icon: CheckCircle,
    variantClass: 'toast-variant-success',
  },
} as const;

const ToastItem = ({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) => {
  const duration = 5000;
  const { icon: IconComponent, variantClass } = TOAST_VARIANTS[notification.type];
  const handleClose = () => onDismiss(notification.id);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);
    return () => {
      clearTimeout(timer);
    };
  }, [notification.id, notification.timestamp]);

  return (
    <div className={clsx('toast-container', variantClass)}>
      <div className="toast-icon-wrapper">
        <IconComponent size={18} />
      </div>

      <div className="toast-message">{notification.message}</div>

      <button onClick={handleClose} className="toast-dismiss-btn">
        <X size={16} />
      </button>

      <div className="toast-progress-track">
        <div key={notification.timestamp} className="toast-progress-line" style={{ '--duration': `${duration}ms` } as CSSProperties} />
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
