import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Database, Lock, User } from 'lucide-react';

export const Login: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || t('auth.loginError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-8 shadow-[var(--shadow-elevated)]">
      {/* Header — compact on large screens (hero panel already carries the
          brand story), full identity on small screens where hero is hidden */}
      <div className="mb-7">
        <div className="lg:hidden inline-flex p-3 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-lg)] mb-3 shadow-[var(--shadow-brand)]">
          <Database className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          {t('auth.login')}
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">
          {t('auth.platformSubtitle')}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--color-error-bg)] border border-[var(--color-error-500)]/30 rounded-[var(--radius-md)] text-xs text-[var(--color-error-400)] text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t('auth.username')}
          </label>
          <div className="relative group">
            <User className="w-4 h-4 absolute left-3 top-2.5 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-brand-400)] transition-colors" />
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:shadow-[var(--shadow-brand)] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t('auth.password')}
          </label>
          <div className="relative group">
            <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-brand-400)] transition-colors" />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:shadow-[var(--shadow-brand)] focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 bg-[var(--color-brand-600)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)] disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm mt-2"
        >
          {isSubmitting ? t('common.loading') : t('auth.loginButton')}
        </button>
      </form>
    </div>
  );
};
