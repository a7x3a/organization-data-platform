import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  trend?: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  description,
  variant = 'default',
  className = '',
}) => {
  const accentText: Record<string, string> = {
    default: 'text-[var(--color-brand-400)]',
    success: 'text-[var(--color-success-400)]',
    warning: 'text-[var(--color-warning-400)]',
    error: 'text-[var(--color-error-400)]',
    info: 'text-[var(--color-info-400)]',
  };
  const accentBg: Record<string, string> = {
    default: 'bg-[var(--color-brand-500)]/10',
    success: 'bg-[var(--color-success-500)]/10',
    warning: 'bg-[var(--color-warning-500)]/10',
    error: 'bg-[var(--color-error-500)]/10',
    info: 'bg-[var(--color-info-500)]/10',
  };

  return (
    <div
      className={`flex flex-col justify-between bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-sm p-4 transition-colors ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">{title}</span>
        {icon && (
          <div className={`w-7 h-7 rounded-xs flex items-center justify-center ${accentBg[variant]} ${accentText[variant]}`}>
            {icon}
          </div>
        )}
      </div>
      <div>
        <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
          {value}
        </div>
        {description && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">{description}</p>
        )}
      </div>
    </div>
  );
};
