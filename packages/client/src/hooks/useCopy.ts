import { useCallback, useEffect, useState } from 'react';

import { useStoreAction } from '@yuji/client/hooks/useStore';

const COPIED_RESET_MS = 2000;

export const useCopy = (): [boolean, (text: string) => void] => {
  const [copied, setCopied] = useState(false);
  const notify = useStoreAction((s, type: 'error' | 'warning' | 'info' | 'success', message: string) => s.notify(type, message));

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

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
