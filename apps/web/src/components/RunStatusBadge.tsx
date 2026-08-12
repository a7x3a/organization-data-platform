import React from 'react';
import { RunStatus } from '@odp/shared-types';
import { useTranslation } from 'react-i18next';

interface RunStatusBadgeProps {
  status: RunStatus | string;
}

export const RunStatusBadge: React.FC<RunStatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();

  const styles: Record<string, string> = {
    [RunStatus.PENDING]: 'bg-[var(--color-info-bg)] text-[var(--color-info-400)] border-[var(--color-info-500)]/30',
    [RunStatus.RUNNING]: 'bg-[var(--color-brand-900)]/40 text-[var(--color-brand-300)] border-[var(--color-brand-500)]/40 animate-pulse',
    [RunStatus.COMPLETED]: 'bg-[var(--color-success-bg)] text-[var(--color-success-400)] border-[var(--color-success-500)]/30',
    [RunStatus.FAILED]: 'bg-[var(--color-error-bg)] text-[var(--color-error-400)] border-[var(--color-error-500)]/30',
    [RunStatus.CANCEL_REQUESTED]: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-400)] border-[var(--color-warning-500)]/30 animate-pulse',
    [RunStatus.CANCELLED]: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]',
  };

  const labelKey = `runs.status.${status}`;
  const label = t(labelKey, status);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-[var(--radius-full)] text-xs font-medium border ${
        styles[status] || styles[RunStatus.PENDING]
      }`}
    >
      {label}
    </span>
  );
};
