import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFiles, useFileDownloadUrl } from '../hooks/useFiles';
import { filesApi } from '../api/files';
import { DataTable, Column } from '../components/DataTable';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { CollectedFile } from '@odp/shared-types';
import { formatBytes, truncateSha256 } from '../lib/utils';
import { Download, ExternalLink } from 'lucide-react';

export const Files: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useFiles({
    page,
    pageSize: 20,
    status: statusFilter || undefined,
  });

  const getDownloadUrl = useFileDownloadUrl('');

  const handleDownload = async (fileId: string) => {
    try {
      const res = await filesApi.getDownloadUrl(fileId);
      window.open(res.url, '_blank');
    } catch {
      alert('Could not generate signed download URL');
    }
  };

  const columns: Column<CollectedFile>[] = [
    {
      header: 'File ID',
      accessor: (f) => (
        <span className="font-mono text-xs font-semibold text-[var(--color-brand-400)]">
          {f.fileId}
        </span>
      ),
    },
    {
      header: 'File Name',
      accessor: (f) => (
        <div className="truncate max-w-sm">
          <div className="font-medium text-xs text-[var(--color-text-primary)] truncate" title={f.fileName}>
            {f.fileName}
          </div>
          <a
            href={f.sourceUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--color-text-muted)] font-mono hover:underline truncate block"
          >
            {f.sourceUrl ?? '—'}
          </a>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (f) => <FileStatusBadge status={f.status} />,
    },
    {
      header: 'MIME Type',
      accessor: (f) => (
        <span className="font-mono text-xs text-[var(--color-text-muted)] truncate max-w-[120px] block">
          {f.mimeType || '—'}
        </span>
      ),
    },
    {
      header: 'Size',
      accessor: (f) => <span className="font-mono text-xs">{formatBytes(f.fileSize)}</span>,
    },
    {
      header: 'SHA-256',
      accessor: (f) => (
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {truncateSha256(f.sha256)}
        </span>
      ),
    },
    {
      header: t('common.actions'),
      accessor: (f) =>
        f.status === 'UPLOADED' ? (
          <button
            onClick={() => handleDownload(f.id)}
            title="Download from R2 via signed URL"
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-brand-400)] hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t('files.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('files.subtitle')}</p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="UPLOADED">Uploaded</option>
          <option value="DUPLICATE">Duplicate</option>
          <option value="SKIPPED">Skipped</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data || []}
        keyExtractor={(f) => f.id}
        isLoading={isLoading}
        emptyMessage="No files collected yet."
        pagination={
          data
            ? {
                page,
                totalPages: data.totalPages,
                onPageChange: setPage,
              }
            : undefined
        }
      />
    </div>
  );
};
