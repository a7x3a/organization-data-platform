import React, { useState } from 'react';
import { useSources } from '../hooks/useSources';
import { useManualUpload, useManualEntry } from '../hooks/useFiles';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
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

    if (!sourceId) {
      setError('Choose a source first.');
      return;
    }

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
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Manual Collection</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Add a document by hand — upload a file directly, or catalog its metadata now and attach
          the file later. Goes through the same hashing and duplicate check as scraped files.
        </p>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-border)]">
        <button
          onClick={() => setMode('upload')}
          className={`flex items-center gap-2 px-1 py-2.5 mr-4 text-sm border-b-2 transition-colors ${
            mode === 'upload'
              ? 'border-[var(--color-brand-500)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          Upload File
        </button>
        <button
          onClick={() => setMode('entry')}
          className={`flex items-center gap-2 px-1 py-2.5 text-sm border-b-2 transition-colors ${
            mode === 'entry'
              ? 'border-[var(--color-brand-500)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          <FilePlus2 className="w-4 h-4" />
          Catalog Only
        </button>
      </div>

      {error && <div className="text-sm text-[var(--color-error-400)]">{error}</div>}
      {success && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-success-400)]">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
            Source
          </label>
          <Select
            value={sourceId}
            onValueChange={setSourceId}
            placeholder="Select a source..."
            options={(sources?.data || []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        {mode === 'upload' ? (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              File
            </label>
            <input
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--color-text-primary)] file:mr-3 file:px-3 file:py-1.5 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--color-brand-600)] file:text-white file:text-xs"
            />
            {file && (
              <p className="mt-2 text-[10px] text-[var(--color-text-muted)] font-mono">
                Original filename preserved as metadata — the stored copy gets a safe generated
                name.
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              Document title / filename
            </label>
            <Input
              type="text"
              required
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="کتێبی بیرکاری پۆلی دەیەم.pdf"
            />
          </div>
        )}

        <div className="pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-3">
            Optional metadata — only what you know, never guessed
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="Language (ckb)"
              className="font-mono text-xs"
            />
            <Input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="font-mono text-xs"
            />
            <Input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="Grade"
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Submitting...' : mode === 'upload' ? 'Upload' : 'Catalog'}
          </Button>
        </div>
      </form>
    </div>
  );
};
