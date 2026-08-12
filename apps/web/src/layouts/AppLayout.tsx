import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  Globe,
  Bot,
  PlaySquare,
  FileArchive,
  UploadCloud,
  ShieldCheck,
  Settings,
  LogOut,
  Database,
} from 'lucide-react';
import { UserRole } from '@odp/shared-types';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
    { to: '/upload', label: t('nav.upload'), icon: UploadCloud },
    ...(user?.roles.includes(UserRole.ADMIN)
      ? [{ to: '/users', label: t('nav.users'), icon: ShieldCheck }]
      : []),
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-base)]">
      {/* Sidebar */}
      <aside className="w-[var(--spacing-sidebar)] flex-shrink-0 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] flex flex-col justify-between">
        <div>
          {/* Header / Brand */}
          <div className="h-16 flex items-center gap-3 px-5 border-b border-[var(--color-border)]">
            <div className="p-2 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-md)]">
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

          {/* Nav links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-brand-900)]/40 text-[var(--color-brand-300)] border border-[var(--color-brand-500)]/30'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)] hover:text-[var(--color-text-primary)]'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer / User Info */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-overlay)]/30">
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                {user?.name || user?.username || 'User'}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">
                {user?.roles?.join(', ') || 'COLLECTOR'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title={t('nav.logout')}
              className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-error-400)] hover:bg-[var(--color-bg-elevated)] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success-400)] animate-pulse" />
            <span className="text-xs font-mono text-[var(--color-text-muted)]">
              Cluster: local-dev | Zone: 00_raw/web
            </span>
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
