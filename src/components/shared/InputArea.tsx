import clsx from 'clsx';
import { forwardRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { Icon } from './Icon';

import type { ComponentProps, FC } from 'react';
import type { TextareaAutosizeProps } from 'react-textarea-autosize';
import type { IconName } from './Icon';

interface InputTextProps extends Omit<ComponentProps<'input'>, 'prefix'> {
  readonly leftIcon?: IconName;
  readonly rightIcon?: IconName;
  readonly containerClassName?: string;
}

export const InputText = forwardRef<HTMLInputElement, InputTextProps>(({ className, containerClassName, leftIcon, rightIcon, ...props }, ref) => {
  return (
    <div className={clsx('relative group', containerClassName)}>
      {leftIcon && (
        <Icon
          name={leftIcon}
          size={14}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-primary transition-colors pointer-events-none"
        />
      )}
      <input ref={ref} className={clsx('input-base', leftIcon ? 'pl-9' : 'pl-3', rightIcon ? 'pr-9' : 'pr-3', className)} {...props} />
      {rightIcon && (
        <Icon
          name={rightIcon}
          size={14}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-primary transition-colors pointer-events-none"
        />
      )}
    </div>
  );
});

export const InputSearch = forwardRef<HTMLInputElement, InputTextProps>((props, ref) => {
  return <InputText ref={ref} leftIcon="Search" {...props} />;
});

interface InputSelectProps extends ComponentProps<'select'> {
  readonly containerClassName?: string;
}

export const InputSelect = forwardRef<HTMLSelectElement, InputSelectProps>(({ className, containerClassName, children, ...props }, ref) => {
  return (
    <div className={clsx('relative group', containerClassName)}>
      <select ref={ref} className={clsx('select-base', className)} {...props}>
        {children}
      </select>
      <Icon
        name="ChevronDown"
        size={14}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-primary transition-colors pointer-events-none"
      />
    </div>
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

export const InputTextarea = forwardRef<HTMLTextAreaElement, TextareaAutosizeProps>(({ className, ...props }, ref) => {
  return <TextareaAutosize ref={ref} className={clsx('input-base px-3 resize-none overflow-hidden', className)} {...props} />;
});
