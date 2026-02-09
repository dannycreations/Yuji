import clsx from 'clsx';
import { forwardRef } from 'react';

import type { ComponentProps } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'info' | 'ghost' | 'logo' | 'sidebar';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  logo: 'btn-logo',
  ghost: 'btn-ghost',
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  info: 'btn-info',
  warning: 'btn-warning',
  danger: 'btn-danger',
  sidebar: 'btn-sidebar',
};

interface ButtonProps extends ComponentProps<'button'> {
  readonly variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'ghost', children, ...props }, ref) => {
  return (
    <button ref={ref} className={clsx(BUTTON_VARIANT[variant], className)} {...props}>
      {children}
    </button>
  );
});
