import { useEffect, useState } from 'react';

import type { ChangeEvent } from 'react';

export const useLocalValue = <T extends HTMLInputElement | HTMLTextAreaElement>(
  value: string | number | readonly string[] | undefined,
  onChange?: (e: ChangeEvent<T>) => void,
) => {
  const [localValue, setLocalValue] = useState(value ?? '');

  useEffect(() => {
    setLocalValue(value ?? '');
  }, [value]);

  const handleChange = (e: ChangeEvent<T>) => {
    setLocalValue(e.target.value);
    onChange?.(e);
  };

  return [localValue, handleChange] as const;
};
