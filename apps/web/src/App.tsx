import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

import { Dashboard } from './pages/Dashboard';
import { Sources } from './pages/Sources';
import { Collectors } from './pages/Collectors';
import { CollectorDetail } from './pages/CollectorDetail';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { Files } from './pages/Files';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';
import { Upload } from './pages/Upload';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';

import './lib/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)] text-[var(--color-text-muted)] text-sm font-mono">
        Authenticating session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Auth routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
              </Route>

              {/* Protected Platform routes */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="/collectors" element={<Collectors />} />
                <Route path="/collectors/:id" element={<CollectorDetail />} />
                <Route path="/runs" element={<Runs />} />
                <Route path="/runs/:id" element={<RunDetail />} />
                <Route path="/files" element={<Files />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
