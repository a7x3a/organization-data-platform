import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFiles } from '../hooks/useFiles';
import { filesApi } from '../api/files';
import { apiClient } from '../api/client';
import { DataTable, Column } from '../components/DataTable';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { Button } from '../components/Button';
import { Select } from '../components/Input';
import { CollectedFile } from '@odp/shared-types';
import { formatBytes, truncateSha256 } from '../lib/utils';
import { Download } from 'lucide-react';

export const Files: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useFiles({
    page,
    pageSize: 20,
    status: statusFilter || undefined,
  });

  const handleDownload = async (fileId: string) => {
    try {
      const res = await filesApi.getDownloadUrl(fileId);
      if (res.url.startsWith('/api/')) {
        // Local storage: this is our own auth-gated route, not a presigned
        // link — plain browser navigation (window.open) never attaches the
        // Authorization header, so it 401s. Fetch it through the
        // authenticated client instead and open the resulting blob.
        const fileRes = await apiClient.get(res.url.slice('/api'.length), {
          responseType: 'blob',
        });
        window.open(URL.createObjectURL(fileRes.data), '_blank');
      } else {
        // R2 presigned URL — auth is already baked into the query string.
        window.open(res.url, '_blank');
      }
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
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => handleDownload(f.id)}
            title="Download from R2 via signed URL"
          >
            <Download className="w-4 h-4" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('files.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('files.subtitle')}</p>
        </div>

        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-40"
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'UPLOADED', label: 'Uploaded' },
            { value: 'DUPLICATE', label: 'Duplicate' },
            { value: 'SKIPPED', label: 'Skipped' },
            { value: 'FAILED', label: 'Failed' },
          ]}
        />
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
