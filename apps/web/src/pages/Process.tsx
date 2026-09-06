import React from 'react';
import { useState } from 'react';
import { filesApi } from '../api/files';
import { Button } from '../components/Button';
import { CheckCircle2, FileCog, RefreshCw, ShieldAlert } from 'lucide-react';

export const Process: React.FC = () => {
  const [limit, setLimit] = useState(1000);
  const [result, setResult] = useState<Awaited<ReturnType<typeof filesApi.process>> | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runProcess = async (apply: boolean) => {
    setIsBusy(true);
    setError(null);
    try {
      setResult(await filesApi.process({ apply, limit }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-brand-400)] text-xs font-mono uppercase tracking-wider">
            <FileCog className="w-4 h-4" /> Data processing
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mt-2">Clean and organize collected data</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Preview deterministic names, metadata normalization, and duplicate content before applying changes.
          </p>
        </div>
        <label className="text-xs font-mono text-[var(--color-text-muted)]">
          Batch size
          <input
            type="number"
            min={1}
            max={5000}
            value={limit}
            onChange={(event) => setLimit(Math.min(5000, Math.max(1, Number(event.target.value) || 1)))}
            className="block mt-1 w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 py-2 text-sm text-[var(--color-text-primary)]"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Processing rules</h2>
          <div className="mt-4 space-y-3 text-sm text-[var(--color-text-secondary)]">
            <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Names become safe, readable, and unique using the original name plus file ID.</div>
            <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Metadata receives a processing version and timestamp for traceability.</div>
            <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Same SHA-256 content is marked duplicate without deleting source records.</div>
          </div>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button variant="secondary" onClick={() => runProcess(false)} disabled={isBusy}>
              <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} /> Preview changes
            </Button>
            <Button variant="primary" onClick={() => runProcess(true)} disabled={isBusy}>
              <FileCog className="w-4 h-4" /> Apply processing
            </Button>
          </div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-amber-500/30 rounded-xl p-5">
          <div className="flex gap-2 text-amber-300 text-sm font-semibold"><ShieldAlert className="w-4 h-4" /> Safe operation</div>
          <p className="text-xs text-[var(--color-text-muted)] mt-3 leading-relaxed">
            Processing changes database names and metadata only. Raw files and source lineage remain intact.
          </p>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      {result && (
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{result.mode === 'preview' ? 'Preview result' : 'Processing complete'}</h2>
            <span className="text-xs font-mono text-[var(--color-text-muted)]">{result.scanned.toLocaleString()} scanned</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <Metric label="Changed" value={result.changed} />
            <Metric label="Renamed" value={result.renamed} />
            <Metric label="Duplicates" value={result.duplicates} />
          </div>
          {result.changes.length > 0 && (
            <div className="mt-5 overflow-auto border border-[var(--color-border-subtle)] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--color-bg-base)] text-[var(--color-text-muted)] font-mono">
                  <tr><th className="p-3">File</th><th className="p-3">Current name</th><th className="p-3">Processed name</th><th className="p-3">State</th></tr>
                </thead>
                <tbody>
                  {result.changes.map((change) => (
                    <tr key={change.id} className="border-t border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]">
                      <td className="p-3 font-mono">{change.fileId}</td>
                      <td className="p-3 max-w-[240px] truncate">{change.oldName}</td>
                      <td className="p-3 max-w-[240px] truncate text-[var(--color-text-primary)]">{change.newName}</td>
                      <td className="p-3">{change.duplicate ? 'Duplicate' : 'Rename'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] p-3">
    <div className="text-xl font-bold font-mono text-[var(--color-text-primary)]">{value.toLocaleString()}</div>
    <div className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] mt-1">{label}</div>
  </div>
);
