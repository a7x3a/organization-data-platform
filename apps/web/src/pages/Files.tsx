import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFiles, useUpdateFile, useDeleteFile } from '../hooks/useFiles';
import { DataTable, Column } from '../components/DataTable';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
import { CollectedFile } from '@odp/shared-types';
import { formatBytes, truncateSha256 } from '../lib/utils';
import { downloadFile } from '../lib/downloadFile';
import { Download, Pencil, Trash2 } from 'lucide-react';

export const Files: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useFiles({
    page,
    pageSize: 20,
    status: statusFilter || undefined,
  });
  const updateFile = useUpdateFile();
  const deleteFile = useDeleteFile();

  const [editingFile, setEditingFile] = useState<CollectedFile | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editMetadataText, setEditMetadataText] = useState('');
  const [editMetadataError, setEditMetadataError] = useState('');
  const [fileToDelete, setFileToDelete] = useState<CollectedFile | null>(null);

  const openEditModal = (file: CollectedFile) => {
    setEditingFile(file);
    setEditFileName(file.fileName);
    setEditMetadataText(file.metadata ? JSON.stringify(file.metadata, null, 2) : '');
    setEditMetadataError('');
  };

  const closeEditModal = () => {
    setEditingFile(null);
    setEditFileName('');
    setEditMetadataText('');
    setEditMetadataError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFile) return;

    let metadata: Record<string, unknown> | undefined;
    if (editMetadataText.trim()) {
      try {
        metadata = JSON.parse(editMetadataText);
      } catch {
        setEditMetadataError('Metadata must be valid JSON (e.g. {"tag": "value"}).');
        return;
      }
    }

    await updateFile.mutateAsync({
      id: editingFile.id,
      data: { fileName: editFileName, metadata },
    });
    closeEditModal();
  };

  const handleDeleteConfirmed = async () => {
    if (!fileToDelete) return;
    await deleteFile.mutateAsync(fileToDelete.id);
    setFileToDelete(null);
  };

  const handleDownload = async (fileId: string) => {
    try {
      await downloadFile(fileId);
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
          <button
            type="button"
            onClick={() => {
              if (f.sourceUrl) {
                window.open(f.sourceUrl, '_blank', 'noopener,noreferrer');
              } else if (f.status === 'UPLOADED') {
                handleDownload(f.id);
              }
            }}
            className={`font-medium text-xs truncate text-left block ${
              f.sourceUrl || f.status === 'UPLOADED'
                ? 'text-[var(--color-text-primary)] hover:text-[var(--color-brand-400)] hover:underline cursor-pointer'
                : 'text-[var(--color-text-primary)] cursor-default'
            }`}
            title={f.sourceUrl ? `Open ${f.sourceUrl}` : f.status === 'UPLOADED' ? 'Click to open file' : (f.fileName ?? undefined)}
          >
            {f.fileName}
          </button>
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
      className: 'text-right',
      accessor: (f) => (
        <div className="flex justify-end gap-1">
          {f.status === 'UPLOADED' && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => handleDownload(f.id)}
              title="Download from R2 via signed URL"
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" iconOnly onClick={() => openEditModal(f)} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            iconOnly
            onClick={() => setFileToDelete(f)}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
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

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)]">
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

      {/* Edit Modal */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 max-w-md w-full">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Edit File
            </h2>
            <form onSubmit={handleSaveEdit} className="mt-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  File Name
                </label>
                <Input
                  type="text"
                  required
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  Metadata (JSON)
                </label>
                <Textarea
                  rows={5}
                  value={editMetadataText}
                  onChange={(e) => {
                    setEditMetadataText(e.target.value);
                    setEditMetadataError('');
                  }}
                  placeholder='{"language": "ku", "topic": "history"}'
                  className="font-mono text-xs"
                />
                {editMetadataError && (
                  <p className="mt-1.5 text-[11px] text-[var(--color-error-400)]">
                    {editMetadataError}
                  </p>
                )}
                <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                  User-supplied tags only (language, subject, etc.) — leave blank to clear.
                  Collection facts like hash, storage path, and status can't be edited here.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border)]">
                <Button type="button" variant="ghost" onClick={closeEditModal}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={updateFile.isPending}>
                  {updateFile.isPending ? t('common.loading') : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={!!fileToDelete}
        title="Delete File"
        message={
          fileToDelete
            ? fileToDelete.origin === 'SCRAPED'
              ? `Permanently delete "${fileToDelete.fileName}"? This removes it from storage entirely — the original raw collection output for this file cannot be recovered, and re-running the collector will treat it as new again rather than a duplicate.`
              : `Permanently delete "${fileToDelete.fileName}"? This cannot be undone.`
            : ''
        }
        confirmText="Delete Permanently"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setFileToDelete(null)}
        isLoading={deleteFile.isPending}
      />
    </div>
  );
};
