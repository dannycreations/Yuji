import { useEffect, useRef, useState } from 'react';

import type { ChangeEvent } from 'react';

export const useLocalValue = <T extends HTMLInputElement | HTMLTextAreaElement>(
  value: string | number | readonly string[] | undefined,
  onChange?: (e: ChangeEvent<T>) => void,
  debounceMs: number = 300,
) => {
  const [localValue, setLocalValue] = useState(value ?? '');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value ?? '');
  }, [value]);

  const handleChange = (e: ChangeEvent<T>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceMs > 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const eventClone = {
        ...e,
        target: { ...e.target, value: newValue },
        persist: () => {},
      } as unknown as ChangeEvent<T>;
      timeoutRef.current = setTimeout(() => {
        onChange?.(eventClone);
      }, debounceMs);
    } else {
      onChange?.(e);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return [localValue, handleChange] as const;
};
