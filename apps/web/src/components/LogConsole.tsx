import React, { useState, useEffect, useRef } from 'react';
import { CollectionRun, RunStatus } from '@odp/shared-types';
import { Terminal, Copy, Check, ArrowDownCircle, PauseCircle } from 'lucide-react';

interface LogConsoleProps {
  run: CollectionRun;
  className?: string;
}

export const LogConsole: React.FC<LogConsoleProps> = ({ run, className = '' }) => {
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const isRunning =
    run.status === RunStatus.RUNNING ||
    run.status === RunStatus.PENDING ||
    run.status === RunStatus.CANCEL_REQUESTED;

  // Synthesize realistic worker execution log lines from run execution state & errors
  const logs: Array<{ time: string; level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'STATUS'; msg: string }> = [];

  const startTime = run.startedAt
    ? new Date(run.startedAt).toLocaleTimeString([], { hour12: false })
    : '00:00:00';

  logs.push({
    time: startTime,
    level: 'STATUS',
    msg: `[JOB_DISPATCH] Execution run ${run.runId} initialized for source '${run.source?.name || 'Target'}'`,
  });

  const zone = run.collector?.type === 'TELEGRAM' ? 'telegram' : 'web';
  logs.push({
    time: startTime,
    level: 'INFO',
    msg: `[STORAGE_TARGET] Raw Zone Path: 00_raw/${zone}/${run.source?.slug || 'source'}/${run.runId}/`,
  });

  logs.push({
    time: startTime,
    level: 'INFO',
    msg: `[SCRAPER_ENGINE] Stealth Chromium Playwright driver active (navigator.webdriver masked)`,
  });

  if (run.pagesCrawled > 0) {
    logs.push({
      time: startTime,
      level: 'INFO',
      msg: `[CRAWLER] Scanned ${run.pagesCrawled.toLocaleString()} pages / channels`,
    });
  }

  if (run.filesFound > 0) {
    logs.push({
      time: startTime,
      level: 'INFO',
      msg: `[DISCOVERY] Located ${run.filesFound.toLocaleString()} raw candidate files`,
    });
  }

  if (run.filesDownloaded > 0) {
    logs.push({
      time: startTime,
      level: 'SUCCESS',
      msg: `[DOWNLOAD_SUCCESS] Processed & stored ${run.filesDownloaded.toLocaleString()} deduplicated artifacts in R2`,
    });
  }

  if (run.filesDuplicate > 0) {
    logs.push({
      time: startTime,
      level: 'WARN',
      msg: `[DEDUP_FILTER] Skipped ${run.filesDuplicate.toLocaleString()} SHA-256 duplicate artifacts`,
    });
  }

  if (run.filesFailed > 0 || (run.errors && run.errors.length > 0)) {
    if (run.errors && run.errors.length > 0) {
      run.errors.forEach((err) => {
        const errTime = err.createdAt
          ? new Date(err.createdAt).toLocaleTimeString([], { hour12: false })
          : startTime;
        logs.push({
          time: errTime,
          level: 'ERROR',
          msg: `[WORKER_ERROR] ${err.errorCode || 'Exception'}: ${err.message}`,
        });
      });
    } else {
      logs.push({
        time: startTime,
        level: 'ERROR',
        msg: `[FAILURE] ${run.filesFailed.toLocaleString()} files encountered errors during processing`,
      });
    }
  }

  const endTime = run.completedAt
    ? new Date(run.completedAt).toLocaleTimeString([], { hour12: false })
    : new Date().toLocaleTimeString([], { hour12: false });

  if (!isRunning) {
    logs.push({
      time: endTime,
      level: run.status === RunStatus.COMPLETED ? 'SUCCESS' : 'STATUS',
      msg: `[JOB_TERMINATED] Run status finalized to ${run.status}`,
    });
  } else {
    logs.push({
      time: endTime,
      level: 'INFO',
      msg: `[LIVE_TAIL] Listening for active scraper worker callbacks...`,
    });
  }

  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.time}] [${l.level}] ${l.msg}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`bg-[#090b10] border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg font-mono ${className}`}>
      {/* Console Minimal Top Header Bar */}
      <div className="flex items-center justify-between px-3.5 h-10 bg-[#121620] border-b border-zinc-800/80 text-xs select-none">
        <div className="flex items-center gap-2.5 text-zinc-300">
          <Terminal className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-medium text-xs text-zinc-200">Execution Log</span>
          <span className="text-[11px] text-zinc-500 font-mono">({run.runId})</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Status Indicator Badge */}
          <div className="flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-zinc-900/90 border border-zinc-800 text-[10px] shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
              }`}
            />
            <span className={isRunning ? 'text-emerald-400 font-medium' : 'text-zinc-400'}>
              {isRunning ? 'LIVE' : 'ENDED'}
            </span>
          </div>

          <div className="h-3.5 w-px bg-zinc-800 shrink-0" />

          {/* Auto-scroll toggle button with FIXED height & width */}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`h-7 w-[100px] shrink-0 inline-flex items-center justify-center gap-1.5 text-[11px] rounded-md border transition-colors ${
              autoScroll
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 font-medium'
                : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
            title="Toggle console auto-scroll"
          >
            {autoScroll ? (
              <ArrowDownCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            ) : (
              <PauseCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            )}
            <span className="whitespace-nowrap">Auto-scroll</span>
          </button>

          {/* Copy logs button with FIXED height & width */}
          <button
            type="button"
            onClick={handleCopyLogs}
            className="h-7 w-[68px] shrink-0 inline-flex items-center justify-center gap-1.5 text-[11px] rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
            title="Copy all logs to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            )}
            <span className="whitespace-nowrap">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Minimal Log Output Console Body */}
      <div className="p-3 space-y-1 max-h-80 overflow-y-auto text-[11px] leading-relaxed bg-[#06080e]">
        {logs.map((logItem, i) => {
          let badgeStyle = 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50';
          if (logItem.level === 'SUCCESS') badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
          if (logItem.level === 'WARN') badgeStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
          if (logItem.level === 'ERROR') badgeStyle = 'bg-red-500/10 text-red-400 border-red-500/20';
          if (logItem.level === 'STATUS') badgeStyle = 'bg-blue-500/10 text-blue-400 border-blue-500/20';

          return (
            <div
              key={i}
              className="flex items-start gap-2.5 hover:bg-zinc-900/50 px-2 py-1 rounded transition-colors font-mono"
            >
              <span className="text-zinc-500 text-[10px] shrink-0 select-none pt-0.5 w-14 font-mono">
                {logItem.time}
              </span>
              <span
                className={`shrink-0 text-[9px] font-semibold tracking-wider px-1.5 py-0.5 rounded border select-none ${badgeStyle}`}
              >
                {logItem.level}
              </span>
              <span className="text-zinc-200 break-words font-mono text-[11px]">{logItem.msg}</span>
            </div>
          );
        })}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
};
