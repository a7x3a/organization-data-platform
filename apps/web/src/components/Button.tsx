import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Square padding, no gap — for icon-only buttons (e.g. table row actions). */
  iconOnly?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)] shadow-xs font-semibold active:opacity-95',
  secondary:
    'bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-overlay)] hover:border-[var(--color-border-strong)] shadow-xs font-medium',
  ghost:
    'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-overlay)] hover:text-[var(--color-text-primary)] font-medium',
  warning:
    'bg-amber-600 text-white hover:bg-amber-500 active:bg-amber-700 shadow-sm font-semibold border border-amber-600/30',
  danger:
    'bg-red-600 text-white hover:bg-red-500 active:bg-red-700 shadow-sm font-semibold border border-red-600/30',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-xs gap-1.5',
  md: 'text-sm gap-2',
};

const PADDING_CLASSES: Record<Size, { normal: string; iconOnly: string }> = {
  sm: { normal: 'px-3.5 py-1.5', iconOnly: 'p-1.5' },
  md: { normal: 'px-4 py-2', iconOnly: 'p-2' },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', iconOnly = false, className = '', children, ...props }, ref) => {
    const padding = iconOnly ? PADDING_CLASSES[size].iconOnly : PADDING_CLASSES[size].normal;
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none ${padding} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
