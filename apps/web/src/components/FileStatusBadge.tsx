import React from 'react';
import { FileStatus } from '@odp/shared-types';
import { useTranslation } from 'react-i18next';

interface FileStatusBadgeProps {
  status: FileStatus | string;
}

export const FileStatusBadge: React.FC<FileStatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();

  const styles: Record<string, string> = {
    [FileStatus.DISCOVERED]: 'text-[var(--color-text-secondary)]',
    [FileStatus.DOWNLOADING]: 'text-[var(--color-info-400)] animate-pulse',
    [FileStatus.UPLOADED]: 'text-[var(--color-success-400)]',
    [FileStatus.DUPLICATE]: 'text-[var(--color-warning-400)]',
    [FileStatus.SKIPPED]: 'text-[var(--color-text-muted)]',
    [FileStatus.FAILED]: 'text-[var(--color-error-400)]',
  };

  const labelKey = `files.status.${status}`;
  const label = t(labelKey, status);

  return (
    <span className={`text-xs font-mono ${styles[status] || styles[FileStatus.DISCOVERED]}`}>
      {label}
    </span>
  );
};
