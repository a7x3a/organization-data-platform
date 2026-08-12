import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Shield, HardDrive, UserCheck } from 'lucide-react';

export const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t('nav.settings')}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Platform configuration and user credentials overview
        </p>
      </div>

      <div className="space-y-8">
        {/* User Info */}
        <div>
          <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--color-border)] mb-4">
            <UserCheck className="w-4 h-4 text-[var(--color-brand-400)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Current User Session
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-[var(--color-text-muted)] block">Username</span>
              <span className="text-[var(--color-text-primary)]">{user?.username}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] block">Roles</span>
              <span className="text-[var(--color-brand-400)]">{user?.roles?.join(', ')}</span>
            </div>
          </div>
        </div>

        {/* Cloudflare R2 Info */}
        <div>
          <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--color-border)] mb-4">
            <HardDrive className="w-4 h-4 text-[var(--color-accent-400)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Cloudflare R2 Immutable Storage
            </h2>
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Target Zone:</span>
              <span className="text-[var(--color-text-primary)]">00_raw/web/</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Security Model:</span>
              <span className="text-[var(--color-success-400)]">Private bucket — Signed URLs only</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Credential Protection:</span>
              <span className="text-[var(--color-success-400)]">Backend API only (never exposed to React)</span>
            </div>
          </div>
        </div>

        {/* Security Rules */}
        <div>
          <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--color-border)] mb-4">
            <Shield className="w-4 h-4 text-[var(--color-warning-400)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              System Policy & SSRF Safeguards
            </h2>
          </div>
          <ul className="text-xs text-[var(--color-text-secondary)] space-y-1.5 list-disc list-inside">
            <li>SSRF protection active on all crawler start URLs and extracted links.</li>
            <li>Robots.txt rules enforced by default for all registered collectors.</li>
            <li>Exact-content deduplication enforced via SHA-256 fingerprints.</li>
            <li>No data in <code className="text-[var(--color-brand-400)]">00_raw</code> is ever overwritten or modified.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
