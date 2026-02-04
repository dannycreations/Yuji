import clsx from 'clsx';
import { forwardRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { useLocalValue } from '../../hooks/useLocalValue';
import { Icon } from './Icon';

import type { ComponentProps, FC } from 'react';
import type { TextareaAutosizeProps } from 'react-textarea-autosize';
import type { IconName } from './Icon';

interface InputWrapperProps {
  readonly leftIcon?: IconName;
  readonly rightIcon?: IconName;
  readonly containerClassName?: string;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
}

const InputWrapper: FC<InputWrapperProps> = ({ leftIcon, rightIcon, containerClassName, children, disabled }) => {
  const iconClass = clsx(
    'absolute top-1/2 -translate-y-1/2 text-text-secondary transition-colors pointer-events-none',
    !disabled && 'group-focus-within:text-primary',
  );
  return (
    <div className={clsx('relative group', containerClassName, disabled && 'opacity-50 cursor-not-allowed')}>
      {leftIcon && <Icon name={leftIcon} size={14} className={clsx('absolute left-4', iconClass)} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={14} className={clsx('absolute right-4', iconClass)} />}
    </div>
  );
};

interface InputTextProps extends Omit<ComponentProps<'input'>, 'prefix'> {
  readonly leftIcon?: IconName;
  readonly rightIcon?: IconName;
  readonly containerClassName?: string;
  readonly debounceMs?: number;
}

export const InputText = forwardRef<HTMLInputElement, InputTextProps>(
  ({ className, containerClassName, leftIcon, rightIcon, value, onChange, debounceMs, ...props }, ref) => {
    const [localValue, handleChange] = useLocalValue(value, onChange, debounceMs);

    return (
      <InputWrapper leftIcon={leftIcon} rightIcon={rightIcon} containerClassName={containerClassName}>
        <input
          ref={ref}
          className={clsx('input-base', leftIcon ? 'pl-9' : 'pl-3', rightIcon ? 'pr-9' : 'pr-3', className)}
          value={localValue}
          onChange={handleChange}
          {...props}
        />
      </InputWrapper>
    );
  },
);

export const InputSearch = forwardRef<HTMLInputElement, InputTextProps>((props, ref) => {
  return <InputText ref={ref} leftIcon="Search" debounceMs={0} {...props} />;
});

interface InputSelectProps extends ComponentProps<'select'> {
  readonly containerClassName?: string;
}

export const InputSelect = forwardRef<HTMLSelectElement, InputSelectProps>(({ className, containerClassName, children, disabled, ...props }, ref) => {
  return (
    <InputWrapper rightIcon="ChevronDown" containerClassName={containerClassName} disabled={disabled}>
      <select ref={ref} className={clsx('select-base', className)} disabled={disabled} {...props}>
        {children}
      </select>
    </InputWrapper>
  );
});

interface InputSwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export const InputSwitch: FC<InputSwitchProps> = ({ checked, onChange, disabled = false, className }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={clsx('input-switch', checked ? 'checked' : 'unchecked', disabled && 'opacity-50 cursor-not-allowed', className)}
    >
      <div className={clsx('input-switch-thumb', checked && 'checked')} />
    </button>
  );
};

export const InputTextarea = forwardRef<HTMLTextAreaElement, TextareaAutosizeProps>(({ className, value, onChange, ...props }, ref) => {
  const [localValue, handleChange] = useLocalValue(value, onChange);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <TextareaAutosize ref={ref} className={clsx('input-base px-3 resize-none', className)} value={localValue} onChange={handleChange} {...props} />
    </div>
  );
});
