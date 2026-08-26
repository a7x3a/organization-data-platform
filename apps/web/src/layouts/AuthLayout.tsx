import React from 'react';
import { Outlet } from 'react-router-dom';
import { Globe, ShieldCheck, Fingerprint, Copy, Archive } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { QaiLogo } from '../components/QaiLogo';

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
      <div className="hidden lg:flex lg:w-[40%] flex-col justify-between p-14 border-r border-[var(--color-border)]">
        <div>
          <QaiLogo size="md" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] leading-snug max-w-xs">
            Raw data acquisition, done right.
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-3 max-w-xs">
            Discover, validate, and deduplicate documents at the source — before anything
            downstream ever touches them.
          </p>

          <div className="mt-12 space-y-5">
            {PIPELINE_STEPS.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 mt-0.5 text-[var(--color-text-muted)] flex-shrink-0" />
                <div>
                  <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
                  <span className="text-sm text-[var(--color-text-muted)]"> — {desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">
          Everything stops at 00_raw. Everything else is a later stage.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
