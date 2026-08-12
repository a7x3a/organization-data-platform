import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
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
    <div>
      {/* Header — compact on large screens (hero panel already carries the
          brand story), full identity on small screens where hero is hidden */}
      <div className="mb-8">
        <div className="lg:hidden inline-flex p-2.5 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-lg)] mb-4">
          <Database className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t('auth.login')}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {t('auth.platformSubtitle')}
        </p>
      </div>

      {error && (
        <div className="mb-5 text-sm text-[var(--color-error-400)]">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
            {t('auth.username')}
          </label>
          <Input
            type="text"
            required
            autoComplete="username"
            icon={<User />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
            {t('auth.password')}
          </label>
          <Input
            type="password"
            required
            autoComplete="current-password"
            icon={<Lock />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('common.loading') : t('auth.loginButton')}
        </Button>
      </form>
    </div>
  );
};
