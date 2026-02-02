import { useCallback, useState } from 'react';

export const useCopy = (timeout = 2000) => {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );

  return [copied, copy] as const;
};
