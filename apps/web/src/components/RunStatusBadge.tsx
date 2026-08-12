import React from 'react';
import { RunStatus } from '@odp/shared-types';
import { useTranslation } from 'react-i18next';

interface RunStatusBadgeProps {
  status: RunStatus | string;
}

export const RunStatusBadge: React.FC<RunStatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();

  const styles: Record<string, string> = {
    [RunStatus.PENDING]: 'text-[var(--color-info-400)]',
    [RunStatus.RUNNING]: 'text-[var(--color-brand-400)] animate-pulse',
    [RunStatus.COMPLETED]: 'text-[var(--color-success-400)]',
    [RunStatus.FAILED]: 'text-[var(--color-error-400)]',
    [RunStatus.CANCEL_REQUESTED]: 'text-[var(--color-warning-400)] animate-pulse',
    [RunStatus.CANCELLED]: 'text-[var(--color-text-muted)]',
  };

  const labelKey = `runs.status.${status}`;
  const label = t(labelKey, status);

  return (
    <span className={`text-xs font-medium ${styles[status] || styles[RunStatus.PENDING]}`}>
      {label}
    </span>
  );
};
