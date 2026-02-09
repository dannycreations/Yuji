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

export const InputWrapper: FC<InputWrapperProps> = ({ leftIcon, rightIcon, containerClassName, children, disabled }) => {
  return (
    <div className={clsx('input-wrapper', containerClassName, disabled && 'disabled')}>
      {leftIcon && <Icon name={leftIcon} size={14} className="input-icon left" />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={14} className="input-icon right" />}
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
          className={clsx('input-base', leftIcon && 'pl-9', rightIcon && 'pr-9', className)}
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

interface InputTextareaProps extends TextareaAutosizeProps {
  readonly debounceMs?: number;
}

export const InputTextarea = forwardRef<HTMLTextAreaElement, InputTextareaProps>(({ className, value, onChange, debounceMs, ...props }, ref) => {
  const [localValue, handleChange] = useLocalValue(value, onChange, debounceMs);

  return <TextareaAutosize ref={ref} className={clsx('input-base resize-none', className)} value={localValue} onChange={handleChange} {...props} />;
});

interface InputTagProps {
  readonly tags: ReadonlyArray<string>;
  readonly onChange: (tags: string[]) => void;
  readonly placeholder?: string;
  readonly maxLength?: number;
}

export const InputTag: FC<InputTagProps> = ({ tags, onChange, placeholder, maxLength = 100 }) => {
  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const addTag = (tag: string) => {
    const val = tag.trim().toLowerCase();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
  };

  return (
    <div className="input-tag-container">
      {tags.map((tag) => (
        <div key={tag} className="tag-item">
          {tag}
          <button onClick={() => removeTag(tag)} className="tag-remove" type="button">
            <Icon name="X" size={10} />
          </button>
        </div>
      ))}
      <input
        className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-tertiary min-w-[120px]"
        placeholder={tags.length === 0 ? placeholder : ''}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            addTag(e.currentTarget.value);
            e.currentTarget.value = '';
          } else if (e.key === 'Backspace' && !e.currentTarget.value && tags.length > 0) {
            const next = [...tags];
            next.pop();
            onChange(next);
          }
        }}
        maxLength={maxLength}
      />
    </div>
  );
};

const BUTTON_VARIANT = {
  logo: 'btn-logo',
  ghost: 'btn-ghost',
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  info: 'btn-info',
  warning: 'btn-warning',
  danger: 'btn-danger',
  sidebar: 'btn-sidebar',
} as const;

interface InputButtonProps extends ComponentProps<'button'> {
  readonly variant?: keyof typeof BUTTON_VARIANT;
}

export const InputButton = forwardRef<HTMLButtonElement, InputButtonProps>(({ className, variant = 'ghost', children, ...props }, ref) => {
  return (
    <button ref={ref} className={clsx(BUTTON_VARIANT[variant], className)} {...props}>
      {children}
    </button>
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
