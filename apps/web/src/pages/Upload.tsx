import React, { useState } from 'react';
import { useSources } from '../hooks/useSources';
import { useManualUpload, useManualEntry } from '../hooks/useFiles';
import { UploadCloud, FilePlus2, CheckCircle2 } from 'lucide-react';

type Mode = 'upload' | 'entry';

export const Upload: React.FC = () => {
  const { data: sources } = useSources({ pageSize: 100 });
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'upload') {
        if (!file) {
          setError('Choose a file to upload.');
          return;
        }
        const result = await manualUpload.mutateAsync({
          sourceId,
          file,
          metadata: buildMetadata(),
        });
        setSuccess(
          result.status === 'DUPLICATE'
            ? `Already collected — matches existing file ${result.fileId} (same SHA-256).`
            : `Uploaded as ${result.fileId}.`
        );
      } else {
        const result = await manualEntry.mutateAsync({
          sourceId,
          fileName,
          metadata: buildMetadata(),
        });
        setSuccess(`Catalogued as ${result.fileId} — attach the file later from the Files page.`);
      }
      reset();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Something went wrong.');
    }
  };

  const isPending = manualUpload.isPending || manualEntry.isPending;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Manual Collection</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Add a document by hand — upload a file directly, or catalog its metadata now and attach
          the file later. Goes through the same hashing and duplicate check as scraped files.
        </p>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-border)]">
        <button
          onClick={() => setMode('upload')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            mode === 'upload'
              ? 'border-[var(--color-brand-500)] text-[var(--color-brand-400)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          Upload File
        </button>
        <button
          onClick={() => setMode('entry')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            mode === 'entry'
              ? 'border-[var(--color-brand-500)] text-[var(--color-brand-400)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <FilePlus2 className="w-4 h-4" />
          Catalog Only
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[var(--color-error-bg)] border border-[var(--color-error-500)]/30 rounded-[var(--radius-md)] text-xs text-[var(--color-error-400)]">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-[var(--color-success-bg)] border border-[var(--color-success-500)]/30 rounded-[var(--radius-md)] text-xs text-[var(--color-success-400)]">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 space-y-4 shadow-[var(--shadow-card)]"
      >
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Source
          </label>
          <select
            required
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
          >
            <option value="">Select a source...</option>
            {sources?.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {mode === 'upload' ? (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              File
            </label>
            <input
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] file:mr-3 file:px-3 file:py-1 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--color-brand-600)] file:text-white file:text-xs"
            />
            {file && (
              <p className="mt-1 text-[10px] text-[var(--color-text-muted)] font-mono">
                Original filename preserved as metadata — the stored copy gets a safe generated
                name.
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Document title / filename
            </label>
            <input
              type="text"
              required
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="کتێبی بیرکاری پۆلی دەیەم.pdf"
              className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
            />
          </div>
        )}

        <div className="pt-2 border-t border-[var(--color-border)]">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
            Optional metadata — only what you know, never guessed
          </p>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="Language (ckb)"
              className="px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
            />
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
            />
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="Grade"
              className="px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2.5 bg-[var(--color-brand-600)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-brand-500)] disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPending ? 'Submitting...' : mode === 'upload' ? 'Upload' : 'Catalog'}
          </button>
        </div>
      </form>
    </div>
  );
};
