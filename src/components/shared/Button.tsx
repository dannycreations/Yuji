import clsx from 'clsx';
import { forwardRef } from 'react';

import type { ComponentProps } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'info' | 'ghost' | 'sidebar';

interface ButtonProps extends ComponentProps<'button'> {
  readonly variant?: ButtonVariant;
  readonly size?: 'sm' | 'md' | 'lg' | 'icon';
  readonly pill?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', pill = false, children, ...props }, ref) => {
    const variantClasses: Record<ButtonVariant, string> = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      danger: 'btn-danger',
      warning: 'btn-warning',
      info: 'btn-info',
      ghost: 'btn-ghost',
      sidebar: 'btn-sidebar',
    };

    return (
      <button
        ref={ref}
        className={clsx(variantClasses[variant], size === 'sm' && '!py-1.5 !px-3 !text-xs', size === 'icon' && '!p-2', pill && 'btn-pill', className)}
        {...props}
      >
        {children}
      </button>
    );
  },
);
