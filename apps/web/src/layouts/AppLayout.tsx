import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useHealth } from '../hooks/useHealth';
import {
  LayoutDashboard,
  Globe,
  Bot,
  PlaySquare,
  FileArchive,
  FolderTree,
  UploadCloud,
  ShieldCheck,
  Settings,
  LogOut,
  Zap,
} from 'lucide-react';
import { UserRole } from '@odp/shared-types';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { QuickCollectModal } from '../components/QuickCollectModal';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { data: health } = useHealth();
  const navigate = useNavigate();
  const [isQuickCollectOpen, setIsQuickCollectOpen] = React.useState(false);

  const isDbConnected = health?.checks?.database ?? false;
  const isRedisConnected = health?.checks?.redis ?? false;
  const isScraperConnected = health?.checks?.scraper ?? false;
  const isR2Connected = health?.checks?.r2 ?? false;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/sources', label: t('nav.sources'), icon: Globe },
    { to: '/collectors', label: t('nav.collectors'), icon: Bot },
    { to: '/runs', label: t('nav.runs'), icon: PlaySquare },
    { to: '/files', label: t('nav.files'), icon: FileArchive },
    { to: '/data', label: t('nav.dataBrowser'), icon: FolderTree },
    { to: '/upload', label: t('nav.upload'), icon: UploadCloud },
    ...(user?.roles.includes(UserRole.ADMIN)
      ? [{ to: '/users', label: t('nav.users'), icon: ShieldCheck }]
      : []),
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-base)]">
      {/* Quick Collect Modal */}
      <QuickCollectModal
        isOpen={isQuickCollectOpen}
        onClose={() => setIsQuickCollectOpen(false)}
      />

      {/* Sidebar */}
      <aside className="w-[var(--spacing-sidebar)] flex-shrink-0 border-r border-[var(--color-border)] flex flex-col justify-between bg-[var(--color-bg-surface)]">
        <div>
          {/* Header / Brand */}
          <div className="h-16 flex items-center px-5 border-b border-[var(--color-border)]">
            <div>
              <div className="text-sm font-bold font-mono text-[var(--color-text-primary)] leading-none tracking-tight">
                QAI Collector
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-tight mt-1">
                AI Data Collection Engine
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 text-xs font-medium rounded-xl transition-all ${
                      isActive
                        ? 'bg-[var(--color-brand-500)]/12 text-[var(--color-brand-400)] font-bold'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-overlay)]'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 text-[var(--color-brand-400)] shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer / User Info */}
        <div className="p-4 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                {user?.name || user?.username || 'User'}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">
                {user?.roles?.join(', ') || 'COLLECTOR'}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={handleLogout}
              title={t('nav.logout')}
            >
              <LogOut className="w-4 h-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 border-b border-[var(--color-border)] flex items-center justify-between px-6 bg-[var(--color-bg-surface)]">
          {/* Left Context Title */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[var(--color-text-muted)]">
              Zone: <strong className="text-[var(--color-text-primary)] font-semibold">00_raw</strong>
            </span>
          </div>

          {/* Right Dynamic Health Status Badges & Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-muted)] border-r border-[var(--color-border)] pr-4 mr-1">
              {/* PostgreSQL */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)]">
                <span className={`w-2 h-2 rounded-full ${isDbConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                PostgreSQL: {isDbConnected ? 'Connected' : 'Disconnected'}
              </span>

              {/* Redis Queue */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)]">
                <span className={`w-2 h-2 rounded-full ${isRedisConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                Redis Queue: {isRedisConnected ? 'Active' : 'Disconnected'}
              </span>

              {/* Scraper Worker */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)]">
                <span className={`w-2 h-2 rounded-full ${isScraperConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                Scraper Worker: {isScraperConnected ? 'Connected' : 'Disconnected'}
              </span>

              {/* Cloud R2 Storage */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)]">
                <span className={`w-2 h-2 rounded-full ${isR2Connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                Cloud R2: {isR2Connected ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsQuickCollectOpen(true)}
              className="bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)]"
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Quick Collect
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Page view outlet */}
        <main className="flex-1 overflow-y-auto p-6 bg-[var(--color-bg-base)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
