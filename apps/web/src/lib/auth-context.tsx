'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, tokenStore } from './api-client';
import type { CurrentUser } from './types';

interface AuthState {
  user: CurrentUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** True when the user holds the permission key. */
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: CurrentUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async () => {
    if (!tokenStore.access) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      setUser(await api.get<CurrentUser>('auth/me'));
    } catch {
      // apiFetch already cleared the session and redirected if needed.
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<LoginResponse>(
        'auth/login',
        { email, password },
        { anonymous: true },
      );
      tokenStore.set(result.accessToken, result.refreshToken);
      setUser(result.user);
      router.push('/dashboard');
    },
    [router],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('auth/logout', { refreshToken: tokenStore.refresh ?? undefined });
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isLoading,
      signIn,
      signOut,
      refreshUser: loadUser,
      can: (permission: string) => Boolean(user?.permissions?.includes(permission)),
      canAny: (...permissions: string[]) =>
        permissions.some((permission) => Boolean(user?.permissions?.includes(permission))),
    }),
    [user, isLoading, signIn, signOut, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
