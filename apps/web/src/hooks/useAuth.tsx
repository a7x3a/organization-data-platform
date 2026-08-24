import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { User } from '@odp/shared-types';
import { authApi } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const storedUser = localStorage.getItem('user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Restore & validate session on mount
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const token = localStorage.getItem('access_token');
      const storedUser = localStorage.getItem('user');

      if (token && storedUser) {
        try {
          const res = await authApi.refresh();
          if (isMounted) {
            localStorage.setItem('access_token', res.accessToken);
            if (res.user) {
              localStorage.setItem('user', JSON.stringify(res.user));
              setUser(res.user);
            }
          }
        } catch {
          // If refresh fails on startup, clear invalid credentials
          if (isMounted) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            setUser(null);
          }
        }
      }
      if (isMounted) {
        setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Proactive token refresh every 10 minutes while user is active
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      try {
        const res = await authApi.refresh();
        localStorage.setItem('access_token', res.accessToken);
        if (res.user) {
          localStorage.setItem('user', JSON.stringify(res.user));
          setUser(res.user);
        }
      } catch {
        // Interceptor will handle if invalid
      }
    }, 10 * 60 * 1000);

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && localStorage.getItem('access_token')) {
        try {
          const res = await authApi.refresh();
          localStorage.setItem('access_token', res.accessToken);
          if (res.user) {
            localStorage.setItem('user', JSON.stringify(res.user));
            setUser(res.user);
          }
        } catch {
          // Handled by response interceptor
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login({ username, password });
    localStorage.setItem('access_token', result.accessToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
