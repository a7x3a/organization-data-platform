import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  trend?: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  description,
  variant = 'default',
}) => {
  const accentColors: Record<string, string> = {
    default: 'border-l-4 border-l-[var(--color-brand-500)]',
    success: 'border-l-4 border-l-[var(--color-success-400)]',
    warning: 'border-l-4 border-l-[var(--color-warning-400)]',
    error: 'border-l-4 border-l-[var(--color-error-400)]',
    info: 'border-l-4 border-l-[var(--color-info-400)]',
  };

  return (
    <div
      className={`bg-[var(--color-bg-surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-border-strong)] ${accentColors[variant]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </span>
        {icon && <div className="text-[var(--color-text-secondary)]">{icon}</div>}
      </div>
      <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
        {value}
      </div>
      {description && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>
      )}
    </div>
  );
};
