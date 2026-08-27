import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Shield, HardDrive, UserCheck, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { TelegramSetupModal } from '../components/TelegramSetupModal';

export const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [loadingTelegramStatus, setLoadingTelegramStatus] = useState(true);
  const [telegramStatus, setTelegramStatus] = useState<{
    is_configured: boolean;
    is_authorized: boolean;
    user?: { first_name: string; username: string };
    reason?: string;
  } | null>(null);

  const fetchTelegramStatus = () => {
    setLoadingTelegramStatus(true);
    apiClient
      .get('/telegram/status')
      .then((r: any) => setTelegramStatus(r.data))
      .catch(() => setTelegramStatus({ is_configured: false, is_authorized: false }))
      .finally(() => setLoadingTelegramStatus(false));
  };

  useEffect(() => {
    fetchTelegramStatus();
  }, []);

  return (
    <div className="space-y-8 w-full">
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

        {/* Telegram Scraper Account Configuration */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-4">
            <div className="flex items-center gap-2.5">
              <Send className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Telegram Scraper Account
              </h2>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowTelegramSetup(true)}
            >
              {telegramStatus?.is_authorized ? 'Manage Account' : 'Setup Account'}
            </Button>
          </div>
          <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[var(--color-text-muted)]">Connection Status:</span>
              <span className="flex items-center gap-1.5 font-semibold">
                {loadingTelegramStatus ? (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Checking...
                  </span>
                ) : telegramStatus?.is_authorized ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Authorized</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-400">Not Logged In</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono border-t border-[var(--color-border-subtle)] pt-2.5">
              <span className="text-[var(--color-text-muted)]">Linked Platform Account:</span>
              <span className="text-[var(--color-brand-400)] font-semibold">
                {user?.username || 'Current Session'}
              </span>
            </div>

            {telegramStatus?.user && (
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[var(--color-text-muted)]">Telegram Session User:</span>
                <span className="text-[var(--color-text-primary)]">
                  {telegramStatus.user.first_name}{' '}
                  {telegramStatus.user.username ? `(@${telegramStatus.user.username})` : ''}
                </span>
              </div>
            )}
            <p className="text-xs text-[var(--color-text-muted)] pt-1">
              Interactive Telethon auth links Telegram channel collection runs directly to your active platform session ({user?.username}).
            </p>
          </div>
        </div>

        {/* Local Storage & Storage Path Configuration */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-4">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-[var(--color-accent-400)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Active Storage Directory & Persistence Mode
              </h2>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  const res = await apiClient.post('/files/sync');
                  alert(`Storage synchronization complete!\n\n• New indexed files: ${res.data.indexedNewCount}\n• Restored runs: ${res.data.restoredRunsCount}\n• Total verified: ${res.data.totalChecked}`);
                } catch {
                  alert('Storage sync failed. Check server logs.');
                }
              }}
            >
              Re-scan & Sync Storage Directory
            </Button>
          </div>
          <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Active Storage Engine:</span>
              <span className="text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                Local Storage Mode (Offline / Disk-Bound)
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2.5">
              <span className="text-[var(--color-text-muted)]">Host Storage Root Path:</span>
              <span className="text-[var(--color-brand-400)] font-semibold select-all">
                ./storage (c:\Users\...\organization-data-platform\storage)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Docker Container Mount:</span>
              <span className="text-[var(--color-text-primary)] select-all">
                /app/storage
              </span>
            </div>

            <div className="border-t border-[var(--color-border-subtle)] pt-2.5 space-y-1.5 text-[11px]">
              <span className="text-[var(--color-text-muted)] block font-semibold">Sub-Zone Layout:</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="p-2 rounded bg-[var(--color-bg-subtle)] border border-[var(--color-border)]">
                  <span className="text-blue-400 font-semibold block">Web Crawler Data</span>
                  <span className="text-[var(--color-text-muted)] block">/storage/00_raw/web/{'{slug}'}/{'{run_id}'}/</span>
                </div>
                <div className="p-2 rounded bg-[var(--color-bg-subtle)] border border-[var(--color-border)]">
                  <span className="text-cyan-400 font-semibold block">Telegram Channels</span>
                  <span className="text-[var(--color-text-muted)] block">/storage/00_raw/telegram/{'{slug}'}/{'{run_id}'}/</span>
                </div>
                <div className="p-2 rounded bg-[var(--color-bg-subtle)] border border-[var(--color-border)]">
                  <span className="text-purple-400 font-semibold block">Media & Audio OCR</span>
                  <span className="text-[var(--color-text-muted)] block">/storage/00_raw/media/{'{slug}'}/{'{run_id}'}/</span>
                </div>
              </div>
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

      <TelegramSetupModal
        isOpen={showTelegramSetup}
        onClose={() => setShowTelegramSetup(false)}
        onSuccess={fetchTelegramStatus}
      />
    </div>
  );
};
