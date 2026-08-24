import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useFiles,
  useUpdateFile,
  useDeleteFile,
  useApproveFile,
  useRejectFile,
  useBulkApproveFiles,
  useBulkRejectFiles,
  useBulkDeleteFiles,
} from '../hooks/useFiles';
import { useAuth } from '../hooks/useAuth';
import { DataTable, Column } from '../components/DataTable';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { FileApprovalBadge } from '../components/FileApprovalBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
import { ApprovalStatus, CollectedFile, UserRole } from '@odp/shared-types';
import { formatBytes, truncateSha256 } from '../lib/utils';
import { downloadFile, openFile } from '../lib/downloadFile';
import {
  Download,
  Pencil,
  Trash2,
  Check,
  X,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  BookOpen,
  FileText,
  Music,
  Video,
  Image,
  Database,
  Sparkles,
} from 'lucide-react';

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
  const { user } = useAuth();
  const isAdmin = user?.roles.includes(UserRole.ADMIN);
  const isReviewer = isAdmin || user?.roles.includes(UserRole.REVIEWER) || user?.roles.includes(UserRole.DATA_MANAGER);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [approvalFilter, setApprovalFilter] = useState<string>('');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');

  const { data, isLoading } = useFiles({
    page,
    pageSize: 20,
    status: statusFilter || undefined,
    approvalStatus: approvalFilter || undefined,
    category: fileTypeFilter !== 'all' ? fileTypeFilter : undefined,
  });

  const updateFile = useUpdateFile();
  const deleteFile = useDeleteFile();
  const approveFile = useApproveFile();
  const rejectFile = useRejectFile();
  const bulkApprove = useBulkApproveFiles();
  const bulkReject = useBulkRejectFiles();
  const bulkDelete = useBulkDeleteFiles();

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [editingFile, setEditingFile] = useState<CollectedFile | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editMetadataText, setEditMetadataText] = useState('');
  const [editMetadataError, setEditMetadataError] = useState('');
  const [fileToDelete, setFileToDelete] = useState<CollectedFile | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [approvalTarget, setApprovalTarget] = useState<{
    action: 'APPROVE' | 'REJECT';
    scope: 'SINGLE' | 'BULK';
    fileId?: string;
  } | null>(null);
  const [approvalNote, setApprovalNote] = useState('');

  const filesList = data?.data || [];

  const toggleSelectAll = () => {
    if (selectedFileIds.length === filesList.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(filesList.map((f) => f.id));
    }
  };

  const toggleSelectFile = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

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

  const handleBulkDeleteConfirmed = async () => {
    if (!selectedFileIds.length) return;
    await bulkDelete.mutateAsync(selectedFileIds);
    setSelectedFileIds([]);
    setShowBulkDeleteModal(false);
  };

  const handleDownload = async (fileId: string) => {
    try {
      await downloadFile(fileId);
    } catch {
      alert('Could not generate signed download URL');
    }
  };

  const handleConfirmApproval = async () => {
    if (!approvalTarget) return;

    if (approvalTarget.scope === 'SINGLE' && approvalTarget.fileId) {
      if (approvalTarget.action === 'APPROVE') {
        await approveFile.mutateAsync({ id: approvalTarget.fileId, notes: approvalNote });
      } else {
        await rejectFile.mutateAsync({ id: approvalTarget.fileId, notes: approvalNote });
      }
    } else if (approvalTarget.scope === 'BULK') {
      if (approvalTarget.action === 'APPROVE') {
        await bulkApprove.mutateAsync({ fileIds: selectedFileIds, notes: approvalNote });
      } else {
        await bulkReject.mutateAsync({ fileIds: selectedFileIds, notes: approvalNote });
      }
      setSelectedFileIds([]);
    }

    setApprovalTarget(null);
    setApprovalNote('');
  };

  const columns: Column<CollectedFile>[] = [
    {
      header: (
        <input
          type="checkbox"
          checked={filesList.length > 0 && selectedFileIds.length === filesList.length}
          onChange={toggleSelectAll}
          className="rounded border-[var(--color-border)] cursor-pointer"
        />
      ),
      className: 'w-8 pl-3',
      accessor: (f) => (
        <input
          type="checkbox"
          checked={selectedFileIds.includes(f.id)}
          onChange={() => toggleSelectFile(f.id)}
          className="rounded border-[var(--color-border)] cursor-pointer"
        />
      ),
    },
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
            onClick={() => openFile(f)}
            className="font-medium text-xs truncate text-left block text-[var(--color-text-primary)] hover:text-[var(--color-brand-400)] hover:underline cursor-pointer"
            title={f.status === 'UPLOADED' ? 'Click to open/view file' : `Open ${f.sourceUrl || f.fileName}`}
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
      header: 'Review',
      className: 'whitespace-nowrap',
      accessor: (f) => (
        <div
          className="inline-flex items-center gap-1.5"
          title={f.approvedBy ? `Reviewed by ${f.approvedBy.name || f.approvedBy.username}` : undefined}
        >
          <FileApprovalBadge status={f.approvalStatus} />
          {f.approvedBy && (
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono truncate max-w-[80px]">
              @{f.approvedBy.username}
            </span>
          )}
        </div>
      ),
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
      className: 'text-right pr-3',
      accessor: (f) => (
        <div className="flex justify-end items-center gap-1">
          {f.status === 'UPLOADED' && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => downloadFile(f)}
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('files.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('files.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={approvalFilter}
            onValueChange={setApprovalFilter}
            className="w-40 sm:w-44"
            options={[
              { value: '', label: 'All Review Statuses' },
              { value: 'PENDING', label: 'Pending Review' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Declined' },
            ]}
          />
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

      {/* Quick Type Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => { setFileTypeFilter('all'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'all'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('files.filter.all')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setFileTypeFilter('pdf'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'pdf'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('files.filter.pdf')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setFileTypeFilter('ebooks'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'ebooks'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-sky-400" />
          <span>{t('files.filter.ebooks')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setFileTypeFilter('documents'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'documents'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span>{t('files.filter.documents')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setFileTypeFilter('audio'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'audio'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <Music className="w-3.5 h-3.5 text-purple-400" />
          <span>{t('files.filter.audio')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setFileTypeFilter('video'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'video'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-red-400" />
          <span>{t('files.filter.video')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setFileTypeFilter('images'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'images'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <Image className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t('files.filter.images')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setFileTypeFilter('datasets'); setPage(1); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            fileTypeFilter === 'datasets'
              ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-teal-400" />
          <span>{t('files.filter.datasets')}</span>
        </button>
      </div>

      {selectedFileIds.length > 0 && isReviewer && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-sm">
          <div className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-[var(--color-brand-400)]" />
            <span>{selectedFileIds.length} files selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setApprovalTarget({
                  action: 'APPROVE',
                  scope: 'BULK',
                })
              }
              disabled={bulkApprove.isPending}
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-semibold"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Approve Selected
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setApprovalTarget({
                  action: 'REJECT',
                  scope: 'BULK',
                })
              }
              disabled={bulkReject.isPending}
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-semibold"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Decline Selected
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={bulkDelete.isPending}
              className="font-semibold shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {t('files.bulkDelete')} ({selectedFileIds.length})
            </Button>
            <button
              type="button"
              onClick={() => setSelectedFileIds([])}
              className="text-xs text-[var(--color-text-muted)] hover:underline ml-2 cursor-pointer"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)]">
        <DataTable
          columns={columns}
          data={filesList.filter((f) => {
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

      {/* Approval Confirmation Modal */}
      {approvalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="relative w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              {approvalTarget.action === 'APPROVE' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {approvalTarget.action === 'APPROVE' ? 'Approve Files' : 'Decline Files'}
              </h2>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {approvalTarget.scope === 'BULK'
                ? `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} ${selectedFileIds.length} selected files.`
                : `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} this file.`}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Review Notes (Optional)</label>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="e.g. Verified text extraction and quality..."
                rows={3}
                className="w-full text-xs p-3 rounded-lg bg-[var(--color-bg-overlay)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-400)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setApprovalTarget(null)}
                disabled={approveFile.isPending || rejectFile.isPending || bulkApprove.isPending || bulkReject.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={approvalTarget.action === 'APPROVE' ? 'primary' : 'danger'}
                size="sm"
                onClick={handleConfirmApproval}
                disabled={approveFile.isPending || rejectFile.isPending || bulkApprove.isPending || bulkReject.isPending}
              >
                Confirm {approvalTarget.action === 'APPROVE' ? 'Approval' : 'Decline'}
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Bulk Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showBulkDeleteModal}
        title={t('files.bulkDelete')}
        message={`Are you sure you want to permanently delete ${selectedFileIds.length} selected file(s) from storage and database? This action cannot be undone.`}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={handleBulkDeleteConfirmed}
        onCancel={() => setShowBulkDeleteModal(false)}
        isLoading={bulkDelete.isPending}
      />
    </div>
  );
};

