import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useHealth } from '../hooks/useHealth';
import {
  LayoutDashboard,
  Globe,
  Bot,
  PlaySquare,
  FolderTree,
  UploadCloud,
  ShieldCheck,
  Settings,
  LogOut,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import { UserRole } from '@odp/shared-types';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { QuickCollectModal } from '../components/QuickCollectModal';
import { QaiLogo } from '../components/QaiLogo';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { data: health, isLoading: isHealthLoading } = useHealth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isQuickCollectOpen, setIsQuickCollectOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Close mobile nav on route change
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  // Handle ESC key to close mobile nav
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen]);

  // Lock background scroll on mobile when drawer is open
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  const isDbConnected = health?.checks?.database ?? false;
  const isRedisConnected = health?.checks?.redis ?? false;
  const isScraperConnected = health?.checks?.scraper ?? false;
  const isR2Connected = health?.checks?.r2 ?? false;

  const renderStatusBadge = (label: string, isConnected: boolean, connectedText = 'Connected', disconnectedText = 'Disconnected') => {
    if (!health && isHealthLoading) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          {label}: Checking...
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)]">
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {label}: {isConnected ? connectedText : disconnectedText}
      </span>
    );
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/sources', label: t('nav.sources'), icon: Globe },
    { to: '/collectors', label: t('nav.collectors'), icon: Bot },
    { to: '/runs', label: t('nav.runs'), icon: PlaySquare },
    { to: '/data', label: t('nav.dataBrowser'), icon: FolderTree },
    { to: '/upload', label: t('nav.upload'), icon: UploadCloud },
    ...(user?.roles?.includes(UserRole.ADMIN)
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

      {/* Mobile Drawer Backdrop */}
      {isMobileNavOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden transition-opacity duration-200"
          onClick={() => setIsMobileNavOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setIsMobileNavOpen(false);
          }}
        />
      )}

      {/* Mobile Sidebar Off-Canvas Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] flex flex-col justify-between shadow-2xl transition-transform duration-200 ease-in-out md:hidden ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Mobile Header with Logo & Close Button */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--color-border)]">
            <QaiLogo size="sm" />
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(false)}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-bg-overlay)] transition-colors cursor-pointer"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Nav links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileNavOpen(false)}
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

        {/* Mobile User & Logout Footer */}
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

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex w-[var(--spacing-sidebar)] flex-shrink-0 border-r border-[var(--color-border)] flex-col justify-between bg-[var(--color-bg-surface)]">
        <div>
          {/* Header / Brand with QAI Logo */}
          <div className="h-16 flex items-center px-4 border-b border-[var(--color-border)]">
            <QaiLogo size="sm" />
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 border-b border-[var(--color-border)] flex items-center justify-between px-3 sm:px-6 bg-[var(--color-bg-surface)]">
          {/* Left Controls: Mobile Hamburger + Context */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-bg-overlay)] transition-colors md:hidden cursor-pointer"
              title="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="md:hidden">
              <QaiLogo size="sm" showText={false} />
            </div>

            <span className="hidden sm:inline-block text-xs font-mono text-[var(--color-text-muted)]">
              Zone: <strong className="text-[var(--color-text-primary)] font-semibold">00_raw</strong>
            </span>
          </div>

          {/* Right Dynamic Health Status Badges & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-muted)] border-r border-[var(--color-border)] pr-4 mr-1">
              {/* PostgreSQL */}
              {renderStatusBadge('PostgreSQL', isDbConnected)}

              {/* Redis Queue */}
              {renderStatusBadge('Redis Queue', isRedisConnected, 'Active', 'Disconnected')}

              {/* Scraper Worker */}
              {renderStatusBadge('Scraper Worker', isScraperConnected)}

              {/* Cloud R2 Storage */}
              {renderStatusBadge('Cloud R2', isR2Connected, 'Connected', 'Not Connected')}
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsQuickCollectOpen(true)}
              className="bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)] text-xs h-8 px-2.5 sm:px-3"
            >
              <Zap className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
              <span className="hidden xs:inline">Quick Collect</span>
              <span className="xs:hidden">Collect</span>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Page view outlet with responsive padding and overflow containment */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 md:p-6 bg-[var(--color-bg-base)]">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
