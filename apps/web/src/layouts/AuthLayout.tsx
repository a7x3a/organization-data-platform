import React from 'react';
import { Outlet } from 'react-router-dom';
import { Database, Globe, ShieldCheck, Fingerprint, Copy, Archive } from 'lucide-react';

const PIPELINE_STEPS = [
  { icon: Globe, label: 'Discover', desc: 'Crawl sources within explicit boundaries' },
  { icon: ShieldCheck, label: 'Validate', desc: 'Check content type against declared format' },
  { icon: Fingerprint, label: 'Hash', desc: 'SHA-256 fingerprint, streamed — never buffered' },
  { icon: Copy, label: 'Deduplicate', desc: 'One physical file, every source URL kept' },
  { icon: Archive, label: 'Store', desc: 'Immutable 00_raw, one folder per run' },
];

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex bg-[var(--color-bg-base)]">
      {/* Hero panel — hidden on small screens, the form always works standalone */}
      <div className="hidden lg:flex lg:w-[42%] relative flex-col justify-between p-12 overflow-hidden bg-[var(--color-bg-surface)] border-r border-[var(--color-border)]">
        {/* Subtle radial brand glow */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 20% 15%, var(--color-brand-900) 0%, transparent 55%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(var(--color-text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-text-primary) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2.5 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-lg)] shadow-[var(--shadow-brand)]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-[var(--color-text-primary)] leading-none">
              ODP Platform
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-tight mt-0.5">
              00_RAW Collector
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] leading-tight max-w-sm">
            Raw data acquisition, done right.
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-3 max-w-sm">
            Discover, validate, and deduplicate documents at the source — before anything downstream
            ever touches them.
          </p>

          <div className="mt-10 space-y-4">
            {PIPELINE_STEPS.map(({ icon: Icon, label, desc }, i) => (
              <div key={label} className="flex items-start gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="p-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-brand-400)]">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="w-px h-5 bg-[var(--color-border)] mt-1" />
                  )}
                </div>
                <div className="pt-0.5">
                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">
                    {label}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[10px] text-[var(--color-text-muted)] font-mono">
          Everything stops at 00_raw. Everything else is a later stage.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
