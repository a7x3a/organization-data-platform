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
import { Download, Pencil, Trash2, Filter, X } from 'lucide-react';

// Data Intelligence helpers
function getLanguageInfo(file: CollectedFile): { name: string; code: string } | null {
  const lang = (file.metadata as Record<string, unknown>)?.language as Record<string, unknown> | undefined;
  if (!lang?.language_name || !lang?.language) return null;
  return { name: lang.language_name as string, code: lang.language as string };
}

function getQualityScore(file: CollectedFile): number | null {
  const quality = (file.metadata as Record<string, unknown>)?.quality as Record<string, unknown> | undefined;
  if (!quality?.score) return null;
  return quality.score as number;
}

function getKurdishCategory(file: CollectedFile): string | null {
  const cat = (file.metadata as Record<string, unknown>)?.kurdish_category as Record<string, unknown> | undefined;
  if (!cat?.category || cat.category === 'unknown' || cat.category === 'general') return null;
  return cat.category as string;
}

export const Files: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
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
      header: 'Language',
      accessor: (f) => {
        const lang = getLanguageInfo(f);
        if (!lang) return <span className="text-[var(--color-text-muted)] text-xs">—</span>;
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-info-500)]/10 text-[var(--color-info-400)] border border-[var(--color-info-500)]/20">
            {lang.name}
          </span>
        );
      },
    },
    {
      header: 'Quality',
      accessor: (f) => {
        const score = getQualityScore(f);
        if (score === null) return <span className="text-[var(--color-text-muted)] text-xs">—</span>;
        const color = score >= 80 ? 'bg-[var(--color-success-400)]' : score >= 50 ? 'bg-[var(--color-warning-400)]' : 'bg-[var(--color-danger-400)]';
        return (
          <div className="flex items-center gap-1.5" title={`Quality: ${score}/100`}>
            <div className="w-12 h-1.5 rounded-full bg-[var(--color-bg-base)] overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{score}</span>
          </div>
        );
      },
    },
    {
      header: 'Category',
      accessor: (f) => {
        const cat = getKurdishCategory(f);
        if (!cat) return <span className="text-[var(--color-text-muted)] text-xs">—</span>;
        const colors: Record<string, string> = {
          history: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          law: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          literature: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          religion: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          science: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
          education: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          politics: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        };
        const cls = colors[cat] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
            {cat}
          </span>
        );
      },
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

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="w-36 sm:w-40"
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'UPLOADED', label: 'Uploaded' },
              { value: 'DUPLICATE', label: 'Duplicate' },
              { value: 'SKIPPED', label: 'Skipped' },
              { value: 'FAILED', label: 'Failed' },
            ]}
          />
          <Select
            value={languageFilter}
            onValueChange={setLanguageFilter}
            className="w-40 sm:w-44"
            options={[
              { value: '', label: 'All Languages' },
              { value: 'ckb', label: 'Kurdish (Sorani)' },
              { value: 'ar', label: 'Arabic' },
              { value: 'en', label: 'English' },
              { value: 'fa', label: 'Persian' },
              { value: 'tr', label: 'Turkish' },
            ]}
          />
          <Select
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            className="w-40 sm:w-44"
            options={[
              { value: '', label: 'All Categories' },
              { value: 'history', label: 'History' },
              { value: 'law', label: 'Law' },
              { value: 'literature', label: 'Literature' },
              { value: 'religion', label: 'Religion' },
              { value: 'science', label: 'Science' },
              { value: 'education', label: 'Education' },
              { value: 'politics', label: 'Politics' },
            ]}
          />
        </div>
      </div>

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)]">
        <DataTable
          columns={columns}
          data={(data?.data || []).filter((f) => {
            if (languageFilter) {
              const lang = getLanguageInfo(f);
              if (!lang || lang.code !== languageFilter) return false;
            }
            if (categoryFilter) {
              const cat = getKurdishCategory(f);
              if (cat !== categoryFilter) return false;
            }
            return true;
          })}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-2xl overflow-hidden my-auto">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Edit File
              </h2>
              <button onClick={closeEditModal} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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
              </div>

              <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
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
