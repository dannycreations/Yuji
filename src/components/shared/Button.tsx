import clsx from 'clsx';
import { forwardRef } from 'react';

import type { ComponentProps } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'info' | 'ghost' | 'sidebar';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  warning: 'btn-warning',
  info: 'btn-info',
  ghost: 'btn-ghost',
  sidebar: 'btn-sidebar',
};

const BUTTON_SIZE: Record<'sm' | 'md' | 'lg' | 'icon', string> = {
  sm: '!py-1.5 !px-3 !text-xs',
  md: '',
  lg: '!py-2 !px-6 !text-base',
  icon: '!p-2',
};

interface ButtonProps extends ComponentProps<'button'> {
  readonly variant?: ButtonVariant;
  readonly size?: 'sm' | 'md' | 'lg' | 'icon';
  readonly pill?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', pill = false, children, ...props }, ref) => {
    return (
      <button ref={ref} className={clsx(BUTTON_VARIANT[variant], BUTTON_SIZE[size], pill && 'btn-pill', className)} {...props}>
        {children}
      </button>
    );
  },
);
