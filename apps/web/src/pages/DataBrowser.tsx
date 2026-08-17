import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSources, useDeleteSource } from '../hooks/useSources';
import { useHealth } from '../hooks/useHealth';
import { runsApi } from '../api/runs';
import { filesApi } from '../api/files';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatBytes, truncateSha256 } from '../lib/utils';
import { downloadFile } from '../lib/downloadFile';
import { CollectedFile, Source } from '@odp/shared-types';
import {
  ChevronRight,
  ChevronDown,
  Globe,
  FolderGit2,
  Folder,
  Download,
  Edit2,
  Trash2,
  UploadCloud,
  Cloud,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  X,
  FileText,
  ExternalLink,
  Info,
  Filter,
} from 'lucide-react';

function categoryOf(file: CollectedFile): string {
  if (file.r2Key && file.r2Key.includes('/')) {
    const parts = file.r2Key.split('/');
    if (parts.length >= 6) {
      const catSlice = parts.slice(4, -1).join('/');
      if (catSlice && catSlice !== '00_raw') return catSlice;
    } else if (parts.length >= 2) {
      const parent = parts[parts.length - 2];
      if (parent && parent !== '00_raw') return parent;
    }
  }

  const name = file.originalFilename || '';
  const ext = name.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || '';
  const mime = (file.mimeType || '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf/native/decoded';
  if (['epub', 'mobi', 'azw3', 'fb2', 'djvu', 'cbz', 'cbr', 'chm'].includes(ext)) return 'ebooks';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'].includes(ext) || mime.startsWith('text/')) return 'documents';
  if (['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus', 'aac'].includes(ext) || mime.startsWith('audio/')) return 'audio';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'].includes(ext) || mime.startsWith('video/')) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext) || mime.startsWith('image/')) return 'images';
  if (['parquet', 'jsonl', 'csv', 'tsv', 'json', 'xml'].includes(ext)) return 'data';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext) || mime.includes('compressed') || mime.includes('zip')) return 'archives';

  return 'other';
}

async function fetchAllFilesForSource(sourceId: string) {
  const all: CollectedFile[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await filesApi.list({ sourceId, page, pageSize: 100 });
    all.push(...res.data);
    if (all.length >= res.total) break;
  }
  return all;
}

function groupByCategory(files: CollectedFile[]): Map<string, CollectedFile[]> {
  const groups = new Map<string, CollectedFile[]>();
  for (const file of files) {
    const category = categoryOf(file);
    const existing = groups.get(category);
    if (existing) existing.push(file);
    else groups.set(category, [file]);
  }
  return groups;
}

async function handleDownloadClick(fileId: string) {
  try {
    await downloadFile(fileId);
  } catch {
    // Handled safely
  }
}

// File Detail & Preview Modal
const FileDetailModal: React.FC<{
  file: CollectedFile;
  onClose: () => void;
  onEdit: () => void;
  onDeleteRequest: () => void;
}> = ({ file, onClose, onEdit, onDeleteRequest }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-2xl)] p-6 max-w-lg w-full shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-[var(--radius-xl)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate" title={file.fileName}>
                {file.fileName}
              </h3>
              <p className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5">
                ID: {file.fileId || file.id}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Details List */}
        <div className="space-y-3 text-xs">
          <div className="flex justify-between py-1.5 border-b border-[var(--color-border-subtle)]">
            <span className="text-[var(--color-text-muted)] font-medium">Status</span>
            <FileStatusBadge status={file.status} />
          </div>

          <div className="flex justify-between py-1.5 border-b border-[var(--color-border-subtle)]">
            <span className="text-[var(--color-text-muted)] font-medium">File Size</span>
            <span className="font-mono text-[var(--color-text-primary)]">{formatBytes(file.fileSize)}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-[var(--color-border-subtle)]">
            <span className="text-[var(--color-text-muted)] font-medium">MIME Type</span>
            <span className="font-mono text-[var(--color-text-primary)]">{file.mimeType || '—'}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-[var(--color-border-subtle)]">
            <span className="text-[var(--color-text-muted)] font-medium">SHA-256 Hash</span>
            <span className="font-mono text-[var(--color-text-primary)] truncate max-w-[200px]" title={file.sha256 ?? undefined}>
              {truncateSha256(file.sha256)}
            </span>
          </div>

          {file.r2Key && (
            <div className="flex flex-col gap-1 py-1.5 border-b border-[var(--color-border-subtle)]">
              <span className="text-[var(--color-text-muted)] font-medium">Storage Key (R2 / Disk)</span>
              <span className="font-mono text-[var(--color-text-secondary)] text-[11px] break-all">
                {file.r2Key}
              </span>
            </div>
          )}

          {file.sourceUrl && (
            <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)]">
              <span className="text-[var(--color-text-muted)] font-medium">Source URL</span>
              <a
                href={file.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-brand-400)] hover:underline font-mono text-[11px] flex items-center gap-1 truncate max-w-[220px]"
              >
                <span>{file.sourceUrl}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}

          {file.metadata && Object.keys(file.metadata).length > 0 && (
            <div className="pt-2">
              <span className="text-[var(--color-text-muted)] font-medium block mb-1.5">Metadata</span>
              <pre className="p-3 rounded-[var(--radius-lg)] bg-[var(--color-bg-base)] text-[11px] font-mono text-[var(--color-text-secondary)] overflow-x-auto border border-[var(--color-border-subtle)]">
                {JSON.stringify(file.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border-subtle)] gap-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              <Edit2 className="w-3.5 h-3.5 mr-1" />
              Edit Name
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                onClose();
                onDeleteRequest();
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
          </div>

          {file.status === 'UPLOADED' && (
            <Button variant="primary" size="sm" onClick={() => handleDownloadClick(file.id)}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download File
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Edit File Name Modal
const EditFileModal: React.FC<{
  file: CollectedFile;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ file, onClose, onSuccess }) => {
  const [fileName, setFileName] = useState(file.fileName);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) return;
    setIsSaving(true);
    try {
      await filesApi.update(file.id, { fileName: fileName.trim() });
      onSuccess();
      onClose();
    } catch {
      // Error handled
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Edit File Name</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              File Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={isSaving} type="submit">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Upload File Modal
const UploadModal: React.FC<{
  sourceId: string;
  sourceName: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ sourceId, sourceName, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsUploading(true);
    try {
      await filesApi.manualUpload({ sourceId, file });
      onSuccess();
      onClose();
    } catch {
      // Error handled
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Upload File to {sourceName}
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Select File
            </label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-[var(--color-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-md)] file:border-0 file:text-xs file:font-semibold file:bg-[var(--color-bg-elevated)] file:text-[var(--color-text-primary)] hover:file:bg-[var(--color-bg-base)] cursor-pointer"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={isUploading || !file} type="submit">
              {isUploading ? 'Uploading...' : 'Upload File'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const FileRow: React.FC<{ file: CollectedFile; onRefetch: () => void }> = ({ file, onRefetch }) => {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true);
    try {
      await filesApi.delete(file.id);
      setShowDeleteConfirm(false);
      onRefetch();
    } catch {
      // Handled cleanly
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between py-2 pl-14 pr-3 text-xs border-t border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-elevated)] transition-colors group">
        {/* Clickable Title & Details Area */}
        <button
          type="button"
          onClick={() => {
            if (file.sourceUrl) {
              window.open(file.sourceUrl, '_blank', 'noopener,noreferrer');
            } else if (file.status === 'UPLOADED') {
              handleDownloadClick(file.id);
            }
          }}
          className="min-w-0 flex-1 text-left cursor-pointer group-hover:text-[var(--color-brand-400)] transition-colors"
          title={file.sourceUrl ? `Open ${file.sourceUrl}` : 'Click to open file'}
        >
          <div className="text-[var(--color-text-primary)] truncate font-medium group-hover:text-[var(--color-brand-400)] flex items-center gap-1.5">
            <span className="hover:underline">{file.fileName}</span>
            <ExternalLink className="w-3 h-3 text-[var(--color-brand-400)] opacity-70 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[var(--color-text-muted)] font-mono text-[10px]">
            <span>{formatBytes(file.fileSize)}</span>
            <span>·</span>
            <span>{truncateSha256(file.sha256)}</span>
            {file.r2Key && (
              <>
                <span>·</span>
                <span className="text-[var(--color-text-secondary)] truncate max-w-[260px] inline-block">{file.r2Key}</span>
              </>
            )}
          </div>
        </button>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <FileStatusBadge status={file.status} />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={(e) => {
              e.stopPropagation();
              setIsDetailOpen(true);
            }}
            title="View File Details"
          >
            <Info className="w-3.5 h-3.5 text-[var(--color-info-400)]" />
          </Button>
          {file.status === 'UPLOADED' && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadClick(file.id);
              }}
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            title="Rename / Edit File"
          >
            <Edit2 className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            disabled={isDeleting}
            title="Delete File"
          >
            <Trash2 className="w-3.5 h-3.5 text-[var(--color-danger-400)]" />
          </Button>
        </div>
      </div>

      {isDetailOpen && (
        <FileDetailModal
          file={file}
          onClose={() => setIsDetailOpen(false)}
          onEdit={() => setIsEditing(true)}
          onDeleteRequest={() => setShowDeleteConfirm(true)}
        />
      )}

      {isEditing && (
        <EditFileModal file={file} onClose={() => setIsEditing(false)} onSuccess={onRefetch} />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete File"
        message={`Permanently delete "${file.fileName}"? This action removes the file record and underlying storage object.`}
        confirmText="Delete Permanently"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setShowDeleteConfirm(false)}
        isLoading={isDeleting}
      />
    </>
  );
};

const CategoryGroup: React.FC<{ category: string; files: CollectedFile[]; onRefetch: () => void }> = ({
  category,
  files,
  onRefetch,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 py-2 pl-10 pr-3 text-xs hover:bg-[var(--color-bg-elevated)] transition-colors border-t border-[var(--color-border-subtle)] cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        )}
        <Folder className="w-3.5 h-3.5 text-[var(--color-warning-400)]" />
        <span className="text-[var(--color-text-secondary)] capitalize font-medium">{category}</span>
        <span className="text-[var(--color-text-muted)] font-mono">({files.length})</span>
      </button>
      {expanded && files.map((f) => <FileRow key={f.id} file={f} onRefetch={onRefetch} />)}
    </div>
  );
};

const RunNode: React.FC<{
  runId: string;
  runDisplayId: string;
  status: string;
  source: string;
  onRefetch: () => void;
}> = ({ runId, runDisplayId, status, onRefetch }) => {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['files', { collectionRunId: runId, pageSize: 100 }],
    queryFn: () => filesApi.list({ collectionRunId: runId, pageSize: 100 }),
    enabled: expanded,
  });

  const groups = data ? groupByCategory(data.data) : new Map<string, CollectedFile[]>();
  const hiddenCount = data ? Math.max(0, data.total - data.data.length) : 0;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 py-2.5 pl-7 pr-3 text-sm hover:bg-[var(--color-bg-elevated)] transition-colors border-t border-[var(--color-border-subtle)] cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
        )}
        <FolderGit2 className="w-4 h-4 text-[var(--color-brand-400)]" />
        <span className="font-mono text-xs text-[var(--color-text-primary)]">{runDisplayId}</span>
        <RunStatusBadge status={status} />
        {data && (
          <span className="text-xs text-[var(--color-text-muted)] font-mono ml-auto">
            {data.total} files
          </span>
        )}
      </button>
      {expanded && isLoading && (
        <div className="pl-14 py-2 text-xs text-[var(--color-text-muted)]">Loading files...</div>
      )}
      {expanded && !isLoading && groups.size === 0 && (
        <div className="pl-14 py-2 text-xs text-[var(--color-text-muted)]">
          No files discovered in this run.
        </div>
      )}
      {expanded &&
        Array.from(groups.entries()).map(([category, files]) => (
          <CategoryGroup key={category} category={category} files={files} onRefetch={onRefetch} />
        ))}
      {expanded && hiddenCount > 0 && (
        <div className="pl-14 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border-subtle)]">
          + {hiddenCount} more file{hiddenCount === 1 ? '' : 's'} not shown — see the Files page to
          browse all of them.
        </div>
      )}
    </div>
  );
};

const SourceNode: React.FC<{ source: Source; hideEmpty: boolean }> = ({ source, hideEmpty }) => {
  const [expanded, setExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteSource = useDeleteSource();
  const queryClient = useQueryClient();

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['files'] });
    queryClient.invalidateQueries({ queryKey: ['sources'] });
    queryClient.invalidateQueries({ queryKey: ['runs'] });
  };

  const handleDeleteSource = async () => {
    try {
      await deleteSource.mutateAsync(source.id);
      setShowDeleteConfirm(false);
      handleRefetch();
    } catch {
      // Error handled
    }
  };

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['runs', { sourceId: source.id, pageSize: 100 }],
    queryFn: () => runsApi.list({ sourceId: source.id, pageSize: 100 }),
    enabled: expanded,
  });

  const { data: allSourceFiles } = useQuery({
    queryKey: ['files', 'all-for-source', source.id],
    queryFn: () => fetchAllFilesForSource(source.id),
    enabled: expanded,
  });

  const manualFiles = (allSourceFiles || []).filter((f) => !f.collectionRunId);
  const manualGroups = groupByCategory(manualFiles);
  const hasContent = (runsData?.data.length || 0) > 0 || manualFiles.length > 0 || (allSourceFiles || []).length > 0;

  if (hideEmpty && !expanded && !hasContent && runsData && !runsLoading) {
    return null;
  }

  return (
    <div className="border-b border-[var(--color-border-subtle)] last:border-b-0">
      <div className="flex items-center justify-between pr-3 hover:bg-[var(--color-bg-elevated)] transition-colors">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 py-3 px-3 text-sm text-left cursor-pointer"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
          )}
          <Globe className="w-4 h-4 text-[var(--color-info-400)]" />
          <span className="font-medium text-[var(--color-text-primary)]">{source.name}</span>
          <span className="text-xs text-[var(--color-text-muted)] font-mono">{source.slug}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setIsUploading(true)} title="Upload file directly to this source">
            <UploadCloud className="w-3.5 h-3.5 mr-1" />
            Upload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            disabled={deleteSource.isPending}
            title="Delete Source"
          >
            <Trash2 className="w-3.5 h-3.5 text-[var(--color-danger-400)]" />
          </Button>
        </div>
      </div>

      {expanded && runsLoading && (
        <div className="pl-10 py-2 text-xs text-[var(--color-text-muted)]">
          Loading collection runs...
        </div>
      )}
      {expanded && !runsLoading && (runsData?.data.length || 0) === 0 && manualFiles.length === 0 && (
        <div className="pl-10 py-2 text-xs text-[var(--color-text-muted)]">
          No collection runs or files yet.
        </div>
      )}
      {expanded &&
        runsData?.data.map((run) => (
          <RunNode
            key={run.id}
            runId={run.id}
            runDisplayId={run.runId}
            status={run.status}
            source={source.slug}
            onRefetch={handleRefetch}
          />
        ))}
      {expanded && manualFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 py-2.5 pl-7 pr-3 text-sm border-t border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]">
            <Folder className="w-4 h-4 text-[var(--color-text-muted)]" />
            Manual Uploads
            <span className="text-xs text-[var(--color-text-muted)] font-mono ml-auto">
              {manualFiles.length} files
            </span>
          </div>
          {Array.from(manualGroups.entries()).map(([category, files]) => (
            <CategoryGroup key={category} category={category} files={files} onRefetch={handleRefetch} />
          ))}
        </div>
      )}

      {isUploading && (
        <UploadModal
          sourceId={source.id}
          sourceName={source.name}
          onClose={() => setIsUploading(false)}
          onSuccess={handleRefetch}
        />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={`Delete Source "${source.name}"`}
        message={`Permanently delete source "${source.name}"? This will clean up the source record along with all associated runs, files, and physical storage.`}
        confirmText="Delete Source & Files"
        onConfirm={handleDeleteSource}
        onCancel={() => setShowDeleteConfirm(false)}
        isLoading={deleteSource.isPending}
      />
    </div>
  );
};

export const DataBrowser: React.FC = () => {
  const { data, isLoading } = useSources({ page: 1, pageSize: 100 });
  const { data: health } = useHealth();
  const queryClient = useQueryClient();

  const [isSyncing, setIsSyncing] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [syncReport, setSyncReport] = useState<{
    provider: string;
    totalChecked: number;
    syncedCount: number;
    prunedOrphansCount?: number;
    missingCount: number;
    timestamp: string;
  } | null>(null);

  const isR2Connected = health?.checks?.r2 ?? false;

  const handleSyncStorage = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    try {
      const res = await filesApi.syncStorage();
      setSyncReport(res);
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    } catch {
      // Handled cleanly
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Data Collected</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Browse, manage, and synchronize every collected file by source, run, and storage state.
          </p>
        </div>

        {/* Sync & Storage Mode Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Hide Empty Toggle */}
          <button
            onClick={() => setHideEmpty((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border cursor-pointer ${
              hideEmpty
                ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] border-[var(--color-brand-500)]/30'
                : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{hideEmpty ? 'Hiding Empty Sources' : 'Showing All Sources'}</span>
          </button>

          {isR2Connected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--color-success-500)]/10 text-[var(--color-success-400)] border border-[var(--color-success-500)]/20">
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud R2 Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--color-warning-500)]/10 text-[var(--color-warning-400)] border border-[var(--color-warning-500)]/20">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Local Storage Mode (Offline)</span>
            </div>
          )}

          <Button variant="secondary" size="sm" onClick={handleSyncStorage} disabled={isSyncing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync Storage
          </Button>
        </div>
      </div>

      {/* Sync Status Toast/Banner */}
      {syncReport && (
        <div className="flex items-center justify-between p-4 rounded-[var(--radius-xl)] bg-[var(--color-bg-surface)] border border-[var(--color-brand-500)]/30 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--color-success-400)]" />
            <span>
              <strong>Storage Sync Completed:</strong> Checked {syncReport.totalChecked} files under{' '}
              <code className="font-mono">{syncReport.provider}</code> mode ({syncReport.syncedCount} synced, {syncReport.prunedOrphansCount ?? syncReport.missingCount} orphaned DB records pruned).
            </span>
          </div>
          <button onClick={() => setSyncReport(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-card)] overflow-hidden">
        {isLoading && (
          <div className="p-6 text-center text-sm text-[var(--color-text-muted)]">Loading sources...</div>
        )}
        {!isLoading && (data?.data.length || 0) === 0 && (
          <div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
            No sources configured yet.
          </div>
        )}
        {data?.data.map((source) => (
          <SourceNode key={source.id} source={source} hideEmpty={hideEmpty} />
        ))}
      </div>
    </div>
  );
};
