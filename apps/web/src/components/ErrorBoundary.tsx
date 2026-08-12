import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React UI error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-error-500)]/30 rounded-[var(--radius-xl)] p-8 max-w-lg w-full text-center">
            <h2 className="text-xl font-bold text-[var(--color-error-400)]">UI Component Error</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              An unexpected error occurred in the dashboard interface.
            </p>
            {this.state.error && (
              <pre className="mt-4 p-3 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs text-left font-mono overflow-x-auto text-[var(--color-error-400)]">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-brand-500)] transition-colors"
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
