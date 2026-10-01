'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { setTokens, onSessionAnnounced, getTabAccountId, setTabAccountId, rememberPendingWorkspace } from '@/lib/auth';
import { authApi, apiClient } from '@/lib/api';

// C2: On every page load, attempt a silent token refresh using the httpOnly cookie.
// If the cookie is valid, we get a new access token → store in memory, mark as authenticated.
// If the cookie is expired/absent, the 401 is caught and user is marked as unauthenticated.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setAuthenticated, setLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    // Invitation link (?workspace=<ownerId>): open that workspace once signed in
    const invitedWorkspace = new URLSearchParams(window.location.search).get('workspace');
    if (invitedWorkspace) rememberPendingWorkspace(invitedWorkspace);

    // Don't attempt silent refresh on auth pages — they handle their own state
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth')) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    // The tab's account may have been signed out meanwhile: fall back to another
    // account still signed in on this browser.
    async function refreshTabAccount() {
      try {
        return await apiClient.post<{ data: { accessToken: string } }>(
          '/auth/refresh',
          { accountId: getTabAccountId() },
          { withCredentials: true },
        );
      } catch (err) {
        const res = await authApi.sessionAccounts().catch(() => null);
        const fallback = ((res?.data as any)?.data ?? [])[0];
        if (!fallback) throw err;
        setTabAccountId(fallback.id);
        return apiClient.post<{ data: { accessToken: string } }>(
          '/auth/refresh',
          { accountId: fallback.id },
          { withCredentials: true },
        );
      }
    }

    async function silentRefresh() {
      try {
        // Try to get a new access token via the httpOnly refresh_token cookie
        const { data } = await refreshTabAccount();
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

  // Another tab signed out the account this tab shows: reload (lands on login)
  useEffect(() => onSessionAnnounced((signedOutId) => {
    if (window.location.pathname.startsWith('/auth')) return;
    if (signedOutId && signedOutId === useAuthStore.getState().user?.id) window.location.reload();
  }), []);

  return <>{children}</>;
}
