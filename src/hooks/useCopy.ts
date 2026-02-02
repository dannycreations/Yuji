import { useCallback, useEffect, useState } from 'react';

export const useCopy = (timeout = 2000): [boolean, (text: string) => void] => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), timeout);
      return () => clearTimeout(timer);
    }
  }, [copied, timeout]);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
  }, []);

  return [copied, copy];
};
