import clsx from 'clsx';
import { Check, Minus } from 'lucide-react';

import type { FC } from 'react';

interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly indeterminate?: boolean;
  readonly className?: string;
}

export const Checkbox: FC<CheckboxProps> = ({ checked, onChange, indeterminate, className }) => {
  return (
    <button type="button" onClick={onChange} className={clsx('checkbox-base', (checked || indeterminate) && 'checked', className)}>
      {checked ? <Check size={12} strokeWidth={4} /> : indeterminate ? <Minus size={12} strokeWidth={4} /> : null}
    </button>
  );
};
