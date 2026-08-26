import { useCallback, useEffect, useState } from 'react';

import { useStoreAction } from '@yuji/client/hooks/useStore';

export const useCopy = (timeout = 2000): [boolean, (text: string) => void] => {
  const [copied, setCopied] = useState(false);
  const notify = useStoreAction((s, type: 'error' | 'warning' | 'info' | 'success', message: string) => s.notify(type, message));

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), timeout);
    return () => clearTimeout(timer);
  }, [copied, timeout]);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
        })
        .catch((err) => {
          notify('error', `Failed to copy: ${err.message || String(err)}`);
        });
    },
    [notify],
  );

  return [copied, copy];
};
