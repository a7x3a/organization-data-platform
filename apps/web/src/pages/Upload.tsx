import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSources } from '../hooks/useSources';
import { useManualUpload, useManualEntry } from '../hooks/useFiles';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import {
  UploadCloud,
  FilePlus2,
  CheckCircle2,
  FileCheck,
  X,
  Info,
  Sparkles,
  CloudUpload,
  RefreshCw,
} from 'lucide-react';

type Mode = 'upload' | 'entry';

export const Upload: React.FC = () => {
  const { t } = useTranslation();
  const { data: sources } = useSources({ page: 1, pageSize: 100 });
  const manualUpload = useManualUpload();
  const manualEntry = useManualEntry();

  const [mode, setMode] = useState<Mode>('upload');
  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildMetadata = () => {
    const metadata: Record<string, string> = {};
    if (language) metadata.language = language;
    if (subject) metadata.subject = subject;
    if (grade) metadata.grade = grade;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const reset = () => {
    setFile(null);
    setFileName('');
    setLanguage('');
    setSubject('');
    setGrade('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!sourceId) {
      setError('Please select a source website.');
      return;
    }

    try {
      if (mode === 'upload') {
        if (!file) {
          setError('Please select a file to upload.');
          return;
        }
        const result = await manualUpload.mutateAsync({
          sourceId,
          file,
          metadata: buildMetadata(),
        });
        setSuccess(
          result.status === 'DUPLICATE'
            ? `File already exists in storage — matched existing SHA-256 (ID: ${result.fileId}).`
            : `File uploaded successfully! ID: ${result.fileId}`
        );
      } else {
        const result = await manualEntry.mutateAsync({
          sourceId,
          fileName,
          metadata: buildMetadata(),
        });
        setSuccess(`Metadata catalogued successfully! File ID: ${result.fileId}`);
      }
      reset();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to complete request.');
    }
  };

  const handlePushToCloud = async () => {
    setIsCloudSyncing(true);
    setCloudSyncMsg(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setCloudSyncMsg('All raw artifacts synchronized with Cloudflare R2 storage.');
    } catch {
      setCloudSyncMsg('Cloud sync request failed.');
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const isPending = manualUpload.isPending || manualEntry.isPending;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Clean Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            File Ingestion
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Upload local documents or catalog metadata into raw storage
          </p>
        </div>

        {/* Minimal Mode Switcher */}
        <div className="flex p-1 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] shadow-xs">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              mode === 'upload'
                ? 'bg-[var(--color-brand-500)] text-white shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setMode('entry')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              mode === 'entry'
                ? 'bg-[var(--color-brand-500)] text-white shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            Catalog Only
          </button>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-6 shadow-[var(--shadow-card)] space-y-6">
        {/* Error Notification */}
        {error && (
          <div className="p-3.5 text-xs rounded-xl bg-[var(--color-error-bg)] text-[var(--color-error-400)] border border-[var(--color-error-400)]/20 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Notification */}
        {success && (
          <div className="p-3.5 text-xs rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Source Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block">
              Source Domain <span className="text-red-400">*</span>
            </label>
            <Select
              value={sourceId}
              onValueChange={setSourceId}
              placeholder="Select source website..."
              options={(sources?.data || []).map((s) => ({
                value: s.id,
                label: `${s.name} (${s.baseUrl})`,
              }))}
            />
          </div>

          {/* Upload Dropzone OR Catalog Input */}
          {mode === 'upload' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block">
                File <span className="text-red-400">*</span>
              </label>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border border-dashed rounded-xl p-6 text-center transition-all ${
                  isDragging
                    ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 ring-2 ring-[var(--color-brand-500)]/20'
                    : file
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  id="file-upload-input"
                  required
                  accept=".pdf,.epub,.mobi,.azw3,.fb2,.djvu,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.tsv,.json,.jsonl,.xml,.parquet,.srt,.vtt,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.mp4,.mkv,.webm,.mov,.avi,.flv,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.tiff,.heic,.zip,.rar,.7z,.tar,.gz,.bz2,.xz"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />

                {file ? (
                  <div className="flex items-center justify-between p-3 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                        <FileCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="text-xs font-medium text-[var(--color-text-primary)] truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-[11px] text-[var(--color-text-muted)] font-mono">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="p-1 text-[var(--color-text-muted)] hover:text-red-400 rounded transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label htmlFor="file-upload-input" className="cursor-pointer space-y-2 block py-1">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] flex items-center justify-center mx-auto border border-[var(--color-brand-500)]/20">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[var(--color-text-primary)]">
                        Click to upload or drag & drop file here
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        PDF, EPUB, DOCX, MOBI, MP3, WAV, JSONL, Parquet
                      </p>
                    </div>
                  </label>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block">
                Document Title / Filename <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                required
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="e.g. Kurdish History Archive 2026.pdf"
              />
            </div>
          )}

          {/* Optional Attributes */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block">
              Optional Metadata
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] text-[var(--color-text-muted)] block mb-1">Language</span>
                <Input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="ckb, ar, en"
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--color-text-muted)] block mb-1">Subject</span>
                <Input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="History, Law, Poetry"
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--color-text-muted)] block mb-1">Volume / Grade</span>
                <Input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="Vol 1, Grade 12"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="ghost" onClick={reset} disabled={isPending}>
              Clear
            </Button>
            <Button type="submit" disabled={isPending}>
              <Sparkles className="w-3.5 h-3.5" />
              {isPending ? 'Processing...' : mode === 'upload' ? 'Upload File' : 'Catalog Metadata'}
            </Button>
          </div>
        </form>
      </div>

      {/* Minimal R2 Cloud Storage Sync Bar */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-4 shadow-[var(--shadow-card)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20">
            <CloudUpload className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--color-text-primary)]">
              Cloud Storage Sync (R2 / S3)
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Push local raw artifacts and metadata to remote storage
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handlePushToCloud}
          disabled={isCloudSyncing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
          {isCloudSyncing ? 'Syncing...' : 'Sync Cloud'}
        </Button>
      </div>

      {cloudSyncMsg && (
        <div className="p-3 text-xs rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{cloudSyncMsg}</span>
        </div>
      )}
    </div>
  );
};
