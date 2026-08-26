import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRun, useCancelRun, usePauseRun, useResumeRun, useForceCancelRun } from '../hooks/useRuns';
import { useAuth } from '../hooks/useAuth';
import {
  useFiles,
  useApproveFile,
  useRejectFile,
  useBulkApproveFiles,
  useBulkRejectFiles,
  useApproveRunFiles,
  useRejectRunFiles,
  useBulkDeleteFiles,
  usePruneRunFiles,
} from '../hooks/useFiles';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { FileApprovalBadge } from '../components/FileApprovalBadge';
import { DataTable, Column } from '../components/DataTable';
import { Button } from '../components/Button';
import { openFile, downloadFile } from '../lib/downloadFile';
import { runsApi } from '../api/runs';
import { filesApi } from '../api/files';
import { JsonViewerModal } from '../components/JsonViewerModal';
import {
  ArrowLeft,
  XCircle,
  AlertTriangle,
  Zap,
  Pause,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Lock,
  Download,
  Check,
  X,
  FileCheck,
  Filter,
  Trash2,
  BookOpen,
  FileText,
  Music,
  Video,
  Image,
  Database,
  Sparkles,
  FileCode2,
  Eye,
} from 'lucide-react';
import { ApprovalStatus, CollectedFile, CollectorType, RunStatus, UserRole } from '@odp/shared-types';
import { formatBytes, truncateSha256 } from '../lib/utils';
import { LiveDuration } from '../components/LiveDuration';
import { LogConsole } from '../components/LogConsole';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const RunDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes(UserRole.ADMIN);

  const { data: run, isLoading } = useRun(id!);
  const isRunning =
    run ? (run.status === RunStatus.RUNNING || run.status === RunStatus.PENDING || run.status === RunStatus.PAUSED || run.status === RunStatus.CANCEL_REQUESTED) : false;

  const { data: filesData } = useFiles(
    { collectionRunId: id!, pageSize: 100 },
    { refetchInterval: isRunning ? 2000 : false }
  );

  const cancelRun = useCancelRun();
  const pauseRun = usePauseRun();
  const resumeRun = useResumeRun();
  const forceCancelRun = useForceCancelRun();

  const approveFile = useApproveFile();
  const rejectFile = useRejectFile();
  const bulkApprove = useBulkApproveFiles();
  const bulkReject = useBulkRejectFiles();
  const approveAllInRun = useApproveRunFiles();
  const rejectAllInRun = useRejectRunFiles();
  const bulkDelete = useBulkDeleteFiles();
  const pruneRun = usePruneRunFiles();

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [approvalNote, setApprovalNote] = useState('');
  const [approvalTarget, setApprovalTarget] = useState<{
    action: 'APPROVE' | 'REJECT';
    scope: 'SINGLE' | 'BULK' | 'ALL';
    fileId?: string;
  } | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showPruneModal, setShowPruneModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [jsonModalState, setJsonModalState] = useState<{
    isOpen: boolean;
    title: string;
    fileName?: string;
    relativePath?: string;
    localPath?: string;
    data: unknown;
    isLoading?: boolean;
  }>({
    isOpen: false,
    title: '',
    data: null,
  });

  const handleViewManifest = async () => {
    if (!run) return;
    const typeFolder = run.collector?.type === CollectorType.TELEGRAM ? 'telegram' : 'web';
    const relKey = run.manifestR2Key || `00_raw/${typeFolder}/${run.source?.slug || 'source'}/${run.runId}/manifest.json`;
    setJsonModalState({
      isOpen: true,
      title: `Run Manifest — ${run.runId}`,
      fileName: 'manifest.json',
      relativePath: relKey,
      localPath: `/app/storage/${relKey}`,
      data: null,
      isLoading: true,
    });

    try {
      const res = await runsApi.getManifest(run.id);
      setJsonModalState({
        isOpen: true,
        title: `Run Manifest — ${run.runId}`,
        fileName: 'manifest.json',
        relativePath: res.manifestKey || relKey,
        localPath: `/app/storage/${res.manifestKey || relKey}`,
        data: res.manifest || res.raw,
        isLoading: false,
      });
    } catch {
      setJsonModalState({
        isOpen: true,
        title: `Run Manifest — ${run.runId}`,
        fileName: 'manifest.json',
        relativePath: relKey,
        localPath: `/app/storage/${relKey}`,
        data: {
          runId: run.runId,
          status: run.status,
          filesDownloaded: run.filesDownloaded,
          filesFound: run.filesFound,
          pagesCrawled: run.pagesCrawled,
          r2Location: relKey,
          note: 'Manifest saved to storage directory.',
        },
        isLoading: false,
      });
    }
  };

  const handleViewMetadata = async () => {
    if (!run) return;
    const typeFolder = run.collector?.type === CollectorType.TELEGRAM ? 'telegram' : 'web';
    const relKey = `00_raw/${typeFolder}/${run.source?.slug || 'source'}/${run.runId}/metadata.jsonl`;
    setJsonModalState({
      isOpen: true,
      title: `Run Metadata (JSONL) — ${run.runId}`,
      fileName: 'metadata.jsonl',
      relativePath: relKey,
      localPath: `/app/storage/${relKey}`,
      data: null,
      isLoading: true,
    });

    try {
      const res = await runsApi.getMetadata(run.id);
      setJsonModalState({
        isOpen: true,
        title: `Run Metadata (JSONL) — ${run.runId} (${res.count ?? 0} records)`,
        fileName: 'metadata.jsonl',
        relativePath: res.metadataKey || relKey,
        localPath: `/app/storage/${res.metadataKey || relKey}`,
        data: res.lines && res.lines.length > 0 ? res.lines : res.raw,
        isLoading: false,
      });
    } catch {
      setJsonModalState({
        isOpen: true,
        title: `Run Metadata (JSONL) — ${run.runId}`,
        fileName: 'metadata.jsonl',
        relativePath: relKey,
        localPath: `/app/storage/${relKey}`,
        data: {
          runId: run.runId,
          totalFiles: files.length,
          files: files.slice(0, 100).map((f) => ({
            id: f.id,
            fileName: f.fileName,
            r2Key: f.r2Key,
            size: f.fileSize,
            sha256: f.sha256,
            metadata: f.metadata,
          })),
        },
        isLoading: false,
      });
    }
  };

  const handleViewFileJson = async (f: CollectedFile) => {
    const isJsonFile = f.fileName.toLowerCase().endsWith('.json') || f.fileName.toLowerCase().endsWith('.jsonl') || isWebData(f);
    const fallbackData = (f.metadata && typeof f.metadata === 'object' && Object.keys(f.metadata).length > 0)
      ? f.metadata
      : {
          fileId: f.fileId,
          fileName: f.fileName,
          originalFilename: f.originalFilename,
          fileSize: f.fileSize,
          mimeType: f.mimeType,
          sha256: f.sha256,
          status: f.status,
          r2Key: f.r2Key,
          sourceUrl: f.sourceUrl,
          approvalStatus: f.approvalStatus,
        };

    const typeFolder = run?.collector?.type === CollectorType.TELEGRAM ? 'telegram' : 'web';
    const computedRelKey = f.r2Key || `00_raw/${typeFolder}/${run?.source?.slug || 'source'}/${run?.runId || 'run'}/${f.fileName}`;

    setJsonModalState({
      isOpen: true,
      title: `Structured Record — ${f.fileName}`,
      fileName: f.fileName,
      relativePath: computedRelKey,
      localPath: `/app/storage/${computedRelKey}`,
      data: fallbackData,
      isLoading: false,
    });

    if (isJsonFile) {
      try {
        const res = await filesApi.getJsonContent(f.id);
        if (res.data || res.raw) {
          const finalRelKey = res.r2Key || computedRelKey;
          setJsonModalState({
            isOpen: true,
            title: `Structured JSON Record — ${f.fileName}`,
            fileName: f.fileName,
            relativePath: finalRelKey,
            localPath: `/app/storage/${finalRelKey}`,
            data: res.data || res.raw,
            isLoading: false,
          });
        }
      } catch {
        // Keeps the fallbackData cleanly without error
      }
    }
  };

  const canManage = run ? (isAdmin || !run.createdById || run.createdById === user?.id) : false;

  // Force re-render every 1 second when active so duration counter increments live
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (isLoading || !run) {
    return <div className="p-8 text-center text-[var(--color-text-muted)]">Loading run progress...</div>;
  }

  const files = filesData?.data || [];
  const approvedCount = files.filter((f) => f.approvalStatus === ApprovalStatus.APPROVED).length;
  const rejectedCount = files.filter((f) => f.approvalStatus === ApprovalStatus.REJECTED).length;
  const pendingCount = files.filter((f) => !f.approvalStatus || f.approvalStatus === ApprovalStatus.PENDING).length;

  // Categorize files for filtering and pruning
  const isOcrPdf = (f: CollectedFile) => {
    const r2 = (f.r2Key || '').toLowerCase();
    return r2.includes('pdf/ocr');
  };
  const isDigitalPdf = (f: CollectedFile) => {
    const ext = (f.extension || '').toLowerCase();
    const mime = (f.mimeType || '').toLowerCase();
    const r2 = (f.r2Key || '').toLowerCase();
    if (r2.includes('pdf/ocr')) return false;
    return ext === '.pdf' || ext === 'pdf' || mime.includes('pdf');
  };
  const isPdf = (f: CollectedFile) => isDigitalPdf(f) || isOcrPdf(f);
  const isWebData = (f: CollectedFile) => {
    const r2 = (f.r2Key || '').toLowerCase();
    return r2.includes('data/web_content') || r2.includes('web_data');
  };
  const isEbook = (f: CollectedFile) => {
    const ext = (f.extension || '').toLowerCase();
    return ['.epub', '.mobi', '.azw3', '.fb2', '.djvu'].includes(ext);
  };
  const isDoc = (f: CollectedFile) => {
    const ext = (f.extension || '').toLowerCase();
    return ['.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.pages'].includes(ext);
  };
  const isAudio = (f: CollectedFile) => {
    const ext = (f.extension || '').toLowerCase();
    const mime = (f.mimeType || '').toLowerCase();
    return mime.startsWith('audio/') || ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac'].includes(ext);
  };
  const isVideo = (f: CollectedFile) => {
    const ext = (f.extension || '').toLowerCase();
    const mime = (f.mimeType || '').toLowerCase();
    return mime.startsWith('video/') || ['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext);
  };
  const isImage = (f: CollectedFile) => {
    const ext = (f.extension || '').toLowerCase();
    const mime = (f.mimeType || '').toLowerCase();
    return mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'].includes(ext);
  };
  const isData = (f: CollectedFile) => {
    const ext = (f.extension || '').toLowerCase();
    return ['.parquet', '.jsonl', '.csv', '.tsv', '.json', '.xml', '.arrow'].includes(ext) && !isWebData(f);
  };

  const digitalPdfCount = files.filter(isDigitalPdf).length;
  const ocrPdfCount = files.filter(isOcrPdf).length;
  const pdfCount = files.filter(isPdf).length;
  const webDataCount = files.filter(isWebData).length;
  const ebookCount = files.filter(isEbook).length;
  const docCount = files.filter(isDoc).length;
  const audioCount = files.filter(isAudio).length;
  const videoCount = files.filter(isVideo).length;
  const imageCount = files.filter(isImage).length;
  const dataCount = files.filter(isData).length;

  const filteredFiles = files.filter((f) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'digital') return isDigitalPdf(f);
    if (typeFilter === 'ocr') return isOcrPdf(f);
    if (typeFilter === 'web_data') return isWebData(f);
    if (typeFilter === 'pdf') return isPdf(f);
    if (typeFilter === 'ebooks') return isEbook(f);
    if (typeFilter === 'documents') return isDoc(f);
    if (typeFilter === 'audio') return isAudio(f);
    if (typeFilter === 'video') return isVideo(f);
    if (typeFilter === 'images') return isImage(f);
    if (typeFilter === 'datasets') return isData(f);
    return true;
  });

  const toggleSelectAll = () => {
    if (selectedFileIds.length === filteredFiles.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(filteredFiles.map((f) => f.id));
    }
  };

  const toggleSelectFile = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleDownload = async (fileId: string) => {
    try {
      await downloadFile(fileId);
    } catch {
      alert('Could not generate signed download URL');
    }
  };

  const handlePruneOnlyPdf = async () => {
    await pruneRun.mutateAsync({
      runId: id!,
      options: { keepCategories: ['pdf'] },
    });
    setSelectedFileIds([]);
    setShowPruneModal(false);
  };

  const handleBulkDelete = async () => {
    if (!selectedFileIds.length) return;
    await bulkDelete.mutateAsync(selectedFileIds);
    setSelectedFileIds([]);
    setShowBulkDeleteModal(false);
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
    } else if (approvalTarget.scope === 'ALL') {
      if (approvalTarget.action === 'APPROVE') {
        await approveAllInRun.mutateAsync({ runId: run.id, notes: approvalNote });
      } else {
        await rejectAllInRun.mutateAsync({ runId: run.id, notes: approvalNote });
      }
      setSelectedFileIds([]);
    }

    setApprovalTarget(null);
    setApprovalNote('');
  };

  const fileColumns: Column<CollectedFile>[] = [
    {
      header: (
        <input
          type="checkbox"
          checked={filteredFiles.length > 0 && selectedFileIds.length === filteredFiles.length}
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
      accessor: (f) => <span className="font-mono text-xs text-[var(--color-brand-400)]">{f.fileId}</span>,
    },
    {
      header: 'File Name',
      accessor: (f) => {
        const isJson = f.fileName.toLowerCase().endsWith('.json') || f.fileName.toLowerCase().endsWith('.jsonl') || isWebData(f);
        return (
          <div className="truncate max-w-xs" title={f.fileName}>
            <button
              type="button"
              onClick={() => (isJson ? handleViewFileJson(f) : openFile(f))}
              className="font-medium text-xs text-left truncate block text-[var(--color-text-primary)] hover:text-[var(--color-brand-400)] hover:underline cursor-pointer"
              title={isJson ? 'Click to inspect structured JSON' : f.status === 'UPLOADED' ? 'Click to open/view file' : `Open ${f.sourceUrl || f.fileName}`}
            >
              {f.fileName}
            </button>
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">{f.sourceUrl || '—'}</div>
          </div>
        );
      },
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
      header: 'Size',
      accessor: (f) => <span className="font-mono text-xs">{formatBytes(f.fileSize)}</span>,
    },
    {
      header: 'SHA-256',
      accessor: (f) => (
        <span className="font-mono text-xs text-[var(--color-text-muted)] font-bold">
          {truncateSha256(f.sha256)}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right pr-3',
      accessor: (f) => {
        const isJson = f.fileName.toLowerCase().endsWith('.json') || f.fileName.toLowerCase().endsWith('.jsonl') || isWebData(f);
        return (
          <div className="flex items-center justify-end gap-1">
            {isJson && (
              <button
                type="button"
                onClick={() => handleViewFileJson(f)}
                title="Inspect JSON Data & Path"
                className="p-1.5 rounded-md text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
              </button>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setApprovalTarget({
                      action: 'APPROVE',
                      scope: 'SINGLE',
                      fileId: f.id,
                    })
                  }
                  title="Approve File"
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    f.approvalStatus === ApprovalStatus.APPROVED
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-[var(--color-text-muted)] hover:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setApprovalTarget({
                      action: 'REJECT',
                      scope: 'SINGLE',
                      fileId: f.id,
                    })
                  }
                  title="Decline / Reject File"
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    f.approvalStatus === ApprovalStatus.REJECTED
                      ? 'text-rose-400 bg-rose-500/10'
                      : 'text-[var(--color-text-muted)] hover:text-rose-400 hover:bg-rose-500/10'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {f.status === 'UPLOADED' && (
              <button
                type="button"
                onClick={() => handleDownload(f.id)}
                title="Download file directly"
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-brand-400)] hover:bg-[var(--color-bg-elevated)] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/runs"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold font-mono text-[var(--color-text-primary)]">
              {run.runId}
            </h1>
            <RunStatusBadge status={run.status} />
            {!canManage && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                <Lock className="w-3 h-3" /> View Only
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">
            Source: {run.source?.name} | Collector: {run.collector?.name} | Launched by:{' '}
            <span className="text-[var(--color-text-secondary)] font-semibold">
              {(run as any).createdBy?.name || (run as any).createdBy?.username || 'Automated'}
            </span>
          </p>
        </div>

        {isRunning && canManage && (
          <div className="flex items-center gap-2">
            {run.status === RunStatus.PAUSED ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => resumeRun.mutate(run.id)}
                disabled={resumeRun.isPending}
                className="shadow-sm font-semibold border-emerald-500/30 text-emerald-400"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                Resume Run
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => pauseRun.mutate(run.id)}
                disabled={pauseRun.isPending || run.status === RunStatus.CANCEL_REQUESTED}
                className="shadow-sm font-semibold border-amber-500/30 text-amber-400"
              >
                <Pause className="w-4 h-4 text-amber-400" />
                Pause Run
              </Button>
            )}
            <Button
              variant="warning"
              size="sm"
              onClick={() => cancelRun.mutate(run.id)}
              disabled={cancelRun.isPending || run.status === RunStatus.CANCEL_REQUESTED}
              className="shadow-sm font-semibold"
            >
              <XCircle className="w-4 h-4 text-white" />
              {run.status === RunStatus.CANCEL_REQUESTED ? 'Cancelling...' : t('runs.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => forceCancelRun.mutate(run.id)}
              disabled={forceCancelRun.isPending}
              title="Immediately force status to CANCELLED and purge queue job"
              className="shadow-sm font-semibold"
            >
              <Zap className="w-4 h-4 text-white" />
              Force Stop
            </Button>
          </div>
        )}
      </div>

      {/* Result Folder Review & Sign-Off Bar */}
      {files.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                Folder Review
              </span>
              <span className="text-[11px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-base)] px-2 py-0.5 rounded-md border border-[var(--color-border-subtle)]">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            <div className="h-3.5 w-px bg-[var(--color-border-subtle)] hidden sm:block" />

            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {approvedCount} accepted
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                {rejectedCount} declined
              </span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {pendingCount} pending
                </span>
              )}
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              {approvedCount === files.length ? (
                <button
                  type="button"
                  onClick={() =>
                    setApprovalTarget({
                      action: 'REJECT',
                      scope: 'ALL',
                    })
                  }
                  disabled={rejectAllInRun.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Decline Result Folder
                </button>
              ) : rejectedCount === files.length ? (
                <button
                  type="button"
                  onClick={() =>
                    setApprovalTarget({
                      action: 'APPROVE',
                      scope: 'ALL',
                    })
                  }
                  disabled={approveAllInRun.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Accept Result Folder
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setApprovalTarget({
                        action: 'APPROVE',
                        scope: 'ALL',
                      })
                    }
                    disabled={approveAllInRun.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Accept Folder
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setApprovalTarget({
                        action: 'REJECT',
                        scope: 'ALL',
                      })
                    }
                    disabled={rejectAllInRun.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Decline Folder
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
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
              {approvalTarget.scope === 'ALL'
                ? `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} all ${files.length} collected files in run ${run.runId}.`
                : approvalTarget.scope === 'BULK'
                ? `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} ${selectedFileIds.length} selected files.`
                : `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} the selected file.`}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Review Notes (Optional)</label>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="e.g. Verified PDF content and formatting..."
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
                disabled={
                  approveFile.isPending ||
                  rejectFile.isPending ||
                  bulkApprove.isPending ||
                  bulkReject.isPending ||
                  approveAllInRun.isPending ||
                  rejectAllInRun.isPending
                }
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={approvalTarget.action === 'APPROVE' ? 'primary' : 'danger'}
                size="sm"
                onClick={handleConfirmApproval}
                disabled={
                  approveFile.isPending ||
                  rejectFile.isPending ||
                  bulkApprove.isPending ||
                  bulkReject.isPending ||
                  approveAllInRun.isPending ||
                  rejectAllInRun.isPending
                }
              >
                Confirm {approvalTarget.action === 'APPROVE' ? 'Approval' : 'Decline'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Why this run failed */}
      {run.status === RunStatus.FAILED && run.errors && run.errors.length > 0 && (
        <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-500)]/30 rounded-[var(--radius-lg)] p-4 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-[var(--color-error-400)] flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <div className="text-sm font-medium text-[var(--color-error-400)]">Why this run failed</div>
            {run.errors.map((err) => (
              <p key={err.id} className="text-xs text-[var(--color-text-secondary)] font-mono break-words">
                {err.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Real-time Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            {run.collector?.type === CollectorType.TELEGRAM ? 'Channels Scanned' : 'Pages Crawled'}
          </div>
          <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">{run.pagesCrawled.toLocaleString()}</div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Files Found</div>
          <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">{run.filesFound.toLocaleString()}</div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-success-400)] uppercase tracking-wider">Downloaded</div>
          <div className="text-xl font-bold font-mono text-[var(--color-success-400)] mt-1">
            {run.filesDownloaded.toLocaleString()}
          </div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-warning-400)] uppercase tracking-wider">Duplicates</div>
          <div className="text-xl font-bold font-mono text-[var(--color-warning-400)] mt-1">
            {run.filesDuplicate.toLocaleString()}
          </div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-error-400)] uppercase tracking-wider">Failed</div>
          <div className="text-xl font-bold font-mono text-[var(--color-error-400)] mt-1">
            {run.filesFailed.toLocaleString()}
          </div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Duration</div>
          <div className="text-xl font-bold font-mono text-[var(--color-brand-400)] mt-1">
            <LiveDuration
              startedAt={run.startedAt}
              completedAt={run.completedAt}
              status={run.status}
              className="text-xl font-bold font-mono text-[var(--color-brand-400)]"
            />
          </div>
        </div>
      </div>

      {/* R2 Run folder reference & Quick Manifest/Metadata Viewers */}
      <div className="text-xs font-mono flex flex-wrap items-center justify-between bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 shadow-xs gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-[var(--color-text-muted)] font-medium">Storage Folder (Relative):</span>
          <span className="text-[var(--color-brand-400)] bg-[var(--color-bg-overlay)] px-2.5 py-1 rounded-md border border-[var(--color-border-subtle)] select-all font-semibold break-all">
            00_raw/{run.collector?.type === CollectorType.TELEGRAM ? 'telegram' : 'web'}/{run.source?.slug || 'source'}/{run.runId}/
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleViewManifest}
            className="text-xs font-semibold h-7.5 px-2.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
            title="Inspect run manifest JSON"
          >
            <FileCode2 className="w-3.5 h-3.5 mr-1 text-cyan-400" />
            Manifest JSON
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleViewMetadata}
            className="text-xs font-semibold h-7.5 px-2.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            title="Inspect run metadata JSONL"
          >
            <Database className="w-3.5 h-3.5 mr-1 text-amber-400" />
            Metadata JSONL
          </Button>
        </div>
      </div>

      {/* Live Log Console Terminal */}
      <LogConsole run={run} />

      {/* Collected files in this run */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Files Collected in this Run
            </h2>
            <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-surface)] px-2.5 py-0.5 rounded-full border border-[var(--color-border-subtle)]">
              {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage && files.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPruneModal(true)}
                  disabled={pruneRun.isPending || isRunning}
                  title="Remove all non-PDF files and keep only PDF documents in this collection run"
                  className="text-xs text-[var(--color-brand-400)] border-[var(--color-brand-500)]/30 hover:bg-[var(--color-brand-500)]/10 font-semibold shadow-xs"
                >
                  <FileCheck className="w-3.5 h-3.5 mr-1 text-[var(--color-brand-400)]" />
                  {t('files.prune.keepOnlyPdf')}
                  {files.length > pdfCount && (
                    <span className="ml-1.5 px-1.5 py-0.2 bg-[var(--color-brand-500)]/20 text-[10px] rounded-full">
                      Prune {files.length - pdfCount}
                    </span>
                  )}
                </Button>

                {selectedFileIds.length > 0 && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowBulkDeleteModal(true)}
                    disabled={bulkDelete.isPending}
                    className="text-xs shadow-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    {t('files.bulkDelete')} ({selectedFileIds.length})
                  </Button>
                )}
              </>
            )}

            {selectedFileIds.length > 0 && canManage && (
              <div className="flex items-center gap-1.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] px-2.5 py-1 rounded-lg shadow-sm">
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
                  className="text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 font-semibold h-7 px-2"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Approve
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
                  className="text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10 font-semibold h-7 px-2"
                >
                  <X className="w-3 h-3 mr-1" />
                  Decline
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedFileIds([])}
                  className="text-[11px] text-[var(--color-text-muted)] hover:underline ml-1 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        {/* File Type Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              typeFilter === 'all'
                ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('files.filter.all')}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)]">
              {files.length}
            </span>
          </button>

          {digitalPdfCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('digital')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'digital'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>Digital PDF</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-emerald-400">
                {digitalPdfCount}
              </span>
            </button>
          )}

          {ocrPdfCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('ocr')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'ocr'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>OCR / Scanned PDF</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-amber-400">
                {ocrPdfCount}
              </span>
            </button>
          )}

          {webDataCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('web_data')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'web_data'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>Web Data</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-cyan-400">
                {webDataCount}
              </span>
            </button>
          )}

          {ebookCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('ebooks')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'ebooks'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('files.filter.ebooks')}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-sky-400">
                {ebookCount}
              </span>
            </button>
          )}

          {docCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('documents')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'documents'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('files.filter.documents')}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-blue-400">
                {docCount}
              </span>
            </button>
          )}

          {audioCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('audio')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'audio'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <Music className="w-3.5 h-3.5 text-purple-400" />
              <span>{t('files.filter.audio')}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-purple-400">
                {audioCount}
              </span>
            </button>
          )}

          {videoCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('video')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'video'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-red-400" />
              <span>{t('files.filter.video')}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-red-400">
                {videoCount}
              </span>
            </button>
          )}

          {imageCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('images')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'images'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <Image className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('files.filter.images')}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-emerald-400">
                {imageCount}
              </span>
            </button>
          )}

          {dataCount > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('datasets')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                typeFilter === 'datasets'
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/30'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-teal-400" />
              <span>{t('files.filter.datasets')}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-bg-base)] text-teal-400">
                {dataCount}
              </span>
            </button>
          )}
        </div>

        <DataTable
          columns={fileColumns}
          data={filteredFiles}
          keyExtractor={(f) => f.id}
          isLoading={false}
          emptyMessage={
            typeFilter === 'all'
              ? 'No files discovered yet.'
              : `No ${typeFilter.toUpperCase()} files found in this run.`
          }
        />
      </div>

      {/* Confirm Keep Only PDF / Prune Modal */}
      <ConfirmDialog
        isOpen={showPruneModal}
        title={t('files.prune.confirmTitle')}
        message={
          files.length > pdfCount
            ? `Keep only PDF files in this run? This will permanently delete ${files.length - pdfCount} unused non-PDF files from storage and database and keep only the ${pdfCount} PDFs.`
            : `All ${files.length} files in this run are already PDFs.`
        }
        confirmText={files.length > pdfCount ? t('files.prune.keepOnlyPdf') : 'OK'}
        cancelText={t('common.cancel')}
        onConfirm={handlePruneOnlyPdf}
        onCancel={() => setShowPruneModal(false)}
        isLoading={pruneRun.isPending}
      />

      {/* Confirm Bulk Delete Modal */}
      <ConfirmDialog
        isOpen={showBulkDeleteModal}
        title={t('files.bulkDelete')}
        message={`Are you sure you want to permanently delete ${selectedFileIds.length} selected file(s) from storage and database?`}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteModal(false)}
        isLoading={bulkDelete.isPending}
      />

      {/* Structured JSON Modal Viewer */}
      <JsonViewerModal
        isOpen={jsonModalState.isOpen}
        onClose={() => setJsonModalState((prev) => ({ ...prev, isOpen: false }))}
        title={jsonModalState.title}
        fileName={jsonModalState.fileName}
        relativePath={jsonModalState.relativePath}
        localPath={jsonModalState.localPath}
        data={jsonModalState.data}
        isLoading={jsonModalState.isLoading}
      />
    </div>
  );
};
