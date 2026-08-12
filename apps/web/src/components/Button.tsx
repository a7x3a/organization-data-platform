import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Square padding, no gap — for icon-only buttons (e.g. table row actions). */
  iconOnly?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)]',
  secondary:
    'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
  ghost: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]',
  danger: 'text-[var(--color-text-muted)] hover:text-[var(--color-error-400)] hover:bg-[var(--color-error-bg)]',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-xs gap-1.5',
  md: 'text-sm gap-2',
};

const PADDING_CLASSES: Record<Size, { normal: string; iconOnly: string }> = {
  sm: { normal: 'px-3 py-1.5', iconOnly: 'p-1.5' },
  md: { normal: 'px-4 py-2', iconOnly: 'p-2' },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', iconOnly = false, className = '', children, ...props }, ref) => {
    const padding = iconOnly ? PADDING_CLASSES[size].iconOnly : PADDING_CLASSES[size].normal;
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${padding} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
