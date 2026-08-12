import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const NotFound: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <h1 className="text-6xl font-bold font-mono text-[var(--color-brand-400)]">404</h1>
      <p className="mt-2 text-lg text-[var(--color-text-primary)] font-medium">
        {t('common.notFound')}
      </p>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        The route you are looking for does not exist in the collection platform.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 px-4 py-2 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-brand-500)] transition-colors"
      >
        Return to Dashboard
      </Link>
    </div>
  );
};
