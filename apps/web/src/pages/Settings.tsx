import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import {
  Shield,
  HardDrive,
  UserCheck,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  Database,
  Layers,
  Check,
} from 'lucide-react';
import { Button } from '../components/Button';
import { TelegramSetupModal } from '../components/TelegramSetupModal';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

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

  const [storageInfo, setStorageInfo] = useState<{
    provider: string;
    isOffline: boolean;
    storagePath: string;
    totalFiles: number;
    totalRuns: number;
    totalSources: number;
    totalStorageBytes: number;
    diskSpace?: { freeBytes: number; totalBytes: number; usedBytes: number } | null;
  } | null>(null);
  const [loadingStorageInfo, setLoadingStorageInfo] = useState(true);
  const [isSyncingStorage, setIsSyncingStorage] = useState(false);
  const [syncReport, setSyncReport] = useState<string | null>(null);

  const fetchTelegramStatus = () => {
    setLoadingTelegramStatus(true);
    apiClient
      .get('/telegram/status')
      .then((r: any) => setTelegramStatus(r.data))
      .catch(() => setTelegramStatus({ is_configured: false, is_authorized: false }))
      .finally(() => setLoadingTelegramStatus(false));
  };

  const fetchStorageInfo = () => {
    setLoadingStorageInfo(true);
    apiClient
      .get('/system/storage-info')
      .then((r: any) => setStorageInfo(r.data))
      .catch(() => setStorageInfo(null))
      .finally(() => setLoadingStorageInfo(false));
  };

  useEffect(() => {
    fetchTelegramStatus();
    fetchStorageInfo();
  }, []);

  const handleSyncStorage = async () => {
    setIsSyncingStorage(true);
    setSyncReport(null);
    try {
      const res = await apiClient.post('/files/sync-storage');
      const data = res.data;
      setSyncReport(
        `✅ Synchronization completed!\n• Total Files Checked: ${data.totalChecked || data.syncedCount}\n• Newly Indexed: ${data.indexedNewCount}\n• Restored Runs: ${data.restoredRunsCount}\n• Missing: ${data.missingCount || 0}`
      );
      fetchStorageInfo();
    } catch {
      setSyncReport('❌ Storage synchronization failed. Please check server logs.');
    } finally {
      setIsSyncingStorage(false);
    }
  };

  const diskUsedPercent =
    storageInfo?.diskSpace && storageInfo.diskSpace.totalBytes > 0
      ? Math.round((storageInfo.diskSpace.usedBytes / storageInfo.diskSpace.totalBytes) * 100)
      : null;

  return (
    <div className="space-y-8 w-full">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t('nav.settings')}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Platform configuration, storage health, and system parameters
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

        {/* Local Storage & Storage Path Configuration */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-4">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-[var(--color-accent-400)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Storage Health & Offline Persistence
              </h2>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSyncStorage}
              disabled={isSyncingStorage}
              className="text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncingStorage ? 'animate-spin' : ''}`} />
              {isSyncingStorage ? 'Scanning & Healing...' : 'Sync & Repair Storage Now'}
            </Button>
          </div>

          <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] space-y-4 font-mono text-xs">
            {/* Storage Mode Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--color-text-muted)]">Active Storage Engine:</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {storageInfo?.isOffline !== false
                  ? 'Local Filesystem (100% Offline / Zero Cloud Dependent)'
                  : 'Cloudflare R2 Object Storage (Cloud Online)'}
              </span>
            </div>

            {/* Disk Space Usage Bar */}
            {storageInfo?.diskSpace && (
              <div className="space-y-1.5 border-t border-[var(--color-border-subtle)] pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-muted)]">Local Disk Space Allocation:</span>
                  <span className="text-[var(--color-text-primary)] font-semibold">
                    {formatBytes(storageInfo.diskSpace.usedBytes)} used of {formatBytes(storageInfo.diskSpace.totalBytes)} ({formatBytes(storageInfo.diskSpace.freeBytes)} free)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--color-bg-base)] border border-[var(--color-border)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (diskUsedPercent || 0) > 85
                        ? 'bg-rose-500'
                        : (diskUsedPercent || 0) > 70
                        ? 'bg-amber-500'
                        : 'bg-[var(--color-brand-500)]'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, diskUsedPercent || 0))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-[var(--color-border-subtle)] pt-3 text-center">
              <div className="p-2.5 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)]">
                <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-medium">Indexed Files</span>
                <span className="text-base font-bold text-[var(--color-brand-400)]">{storageInfo?.totalFiles ?? '...'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)]">
                <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-medium">Collection Runs</span>
                <span className="text-base font-bold text-cyan-400">{storageInfo?.totalRuns ?? '...'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)]">
                <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-medium">Registered Sources</span>
                <span className="text-base font-bold text-amber-400">{storageInfo?.totalSources ?? '...'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)]">
                <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-medium">Total Size</span>
                <span className="text-base font-bold text-emerald-400">
                  {storageInfo ? formatBytes(storageInfo.totalStorageBytes) : '...'}
                </span>
              </div>
            </div>

            {/* Storage Path Resolution */}
            <div className="flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-3">
              <span className="text-[var(--color-text-muted)]">Active Storage Root Directory:</span>
              <span className="text-[var(--color-brand-400)] bg-[var(--color-bg-base)] px-3 py-1.5 rounded-lg border border-[var(--color-border-subtle)] select-all break-all">
                {storageInfo?.storagePath || './storage'}
              </span>
            </div>

            {/* Sync feedback notification */}
            {syncReport && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 whitespace-pre-line font-sans text-xs">
                {syncReport}
              </div>
            )}

            {/* External Disk & Custom Folder Guide */}
            <div className="border-t border-[var(--color-border-subtle)] pt-3 space-y-2 text-[11px] font-sans">
              <span className="text-[var(--color-text-primary)] font-semibold flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                How to Mount an External Hard Drive or Custom Storage Folder:
              </span>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                To point storage to an external drive (e.g. <code className="text-[var(--color-brand-400)]">D:\ODP_Storage</code> or a USB hard drive), update the <code className="text-[var(--color-brand-400)]">docker-compose.yml</code> volume mount under <code className="text-[var(--color-brand-400)]">volumes:</code> to map your external folder to <code className="text-[var(--color-brand-400)]">/app/storage</code>. The platform will automatically recognize and persist all files to your external drive with zero downtime.
              </p>
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
