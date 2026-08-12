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
    default: 'border-t-[var(--color-brand-500)]',
    success: 'border-t-[var(--color-success-400)]',
    warning: 'border-t-[var(--color-warning-400)]',
    error: 'border-t-[var(--color-error-400)]',
    info: 'border-t-[var(--color-info-400)]',
  };

  return (
    <div className={`border-t-2 pt-3 ${accentColors[variant]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">{title}</span>
        {icon && <div className="text-[var(--color-text-muted)]">{icon}</div>}
      </div>
      <div className="mt-1.5 text-xl font-semibold font-mono text-[var(--color-text-primary)]">
        {value}
      </div>
      {description && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>
      )}
    </div>
  );
};
