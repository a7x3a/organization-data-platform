import React from 'react';
import { FileStatus } from '@odp/shared-types';
import { useTranslation } from 'react-i18next';

interface FileStatusBadgeProps {
  status: FileStatus | string;
}

export const FileStatusBadge: React.FC<FileStatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();

  const styles: Record<string, string> = {
    [FileStatus.DISCOVERED]: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
    [FileStatus.DOWNLOADING]: 'bg-[var(--color-info-bg)] text-[var(--color-info-400)] border-[var(--color-info-500)]/30 animate-pulse',
    [FileStatus.UPLOADED]: 'bg-[var(--color-success-bg)] text-[var(--color-success-400)] border-[var(--color-success-500)]/30',
    [FileStatus.DUPLICATE]: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-400)] border-[var(--color-warning-500)]/30',
    [FileStatus.SKIPPED]: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]',
    [FileStatus.FAILED]: 'bg-[var(--color-error-bg)] text-[var(--color-error-400)] border-[var(--color-error-500)]/30',
  };

  const labelKey = `files.status.${status}`;
  const label = t(labelKey, status);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-md)] text-xs font-mono font-medium border ${
        styles[status] || styles[FileStatus.DISCOVERED]
      }`}
    >
      {label}
    </span>
  );
};
