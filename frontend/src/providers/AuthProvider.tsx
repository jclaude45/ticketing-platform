'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { setTokens } from '@/lib/auth';
import { authApi, apiClient } from '@/lib/api';

// C2: On every page load, attempt a silent token refresh using the httpOnly cookie.
// If the cookie is valid, we get a new access token → store in memory, mark as authenticated.
// If the cookie is expired/absent, the 401 is caught and user is marked as unauthenticated.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setAuthenticated, setLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    // Don't attempt silent refresh on auth pages — they handle their own state
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth')) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    async function silentRefresh() {
      try {
        // Try to get a new access token via the httpOnly refresh_token cookie
        const { data } = await apiClient.post<{ data: { accessToken: string } }>(
          '/auth/refresh',
          {},
          { withCredentials: true },
        );
        if (cancelled) return;
        const accessToken = (data as any)?.data?.accessToken;
        if (accessToken) {
          setTokens({ accessToken });
          // Now fetch the profile with the new access token
          const profileRes = await authApi.getProfile();
          if (!cancelled && profileRes.data?.data) {
            setUser(profileRes.data.data);
            setAuthenticated(true);
          }
        }
      } catch {
        // Cookie absent, expired, or revoked — user must log in again
        setAuthenticated(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    silentRefresh();
    return () => { cancelled = true; };
  }, [setUser, setAuthenticated, setLoading]);

  return <>{children}</>;
}
