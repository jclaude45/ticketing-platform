import { AuthTokens, User } from '@/types';

// C2 FIX: access token in memory only (sessionStorage clears on tab close, still JS-readable)
// Refresh token is in httpOnly cookie — invisible to JS, safe from XSS
// On page refresh: access token is gone but the cookie triggers a silent /auth/refresh

const ACCESS_TOKEN_KEY = 'ticketing_access_token';
const USER_KEY = 'ticketing_user';

// In-memory store — not persisted to localStorage, cleared on page unload
let _memoryAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return _memoryAccessToken;
}

// getRefreshToken removed — refresh token lives in httpOnly cookie,
// axios sends it automatically via withCredentials: true

export function setTokens(tokens: Partial<AuthTokens>): void {
  if (tokens.accessToken) {
    _memoryAccessToken = tokens.accessToken;
    // Bind this tab to the account the token belongs to (login, refresh, switch)
    const accountId = tokenSubject(tokens.accessToken);
    if (accountId) setTabAccountId(accountId);
  }
  // refreshToken is now set as httpOnly cookie by the backend — we never touch it in JS
}

export function clearTokens(): void {
  _memoryAccessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

export function setStoredUser(user: User): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as User;
    // Shared by all tabs: only use it for display if it is this tab's account
    return user.id === getTabAccountId() ? user : null;
  } catch {
    return null;
  }
}

// ── Multi-account ────────────────────────────────────────────────────────────
// Several accounts can be signed in on the same browser (one refresh cookie each).
// Each tab remembers which account it shows (sessionStorage survives reloads of
// that tab only); new tabs open on the last account used.
const TAB_ACCOUNT_KEY = 'zaya_account';
const LAST_ACCOUNT_KEY = 'zaya_last_account';

export function getTabAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(TAB_ACCOUNT_KEY) ?? localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function setTabAccountId(accountId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(TAB_ACCOUNT_KEY, accountId);
    localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
  } catch { /* storage blocked: tab falls back to the last account */ }
}

/** Forget a signed-out account in this tab (and as default for new tabs). */
export function clearTabAccount(accountId: string | null | undefined): void {
  if (typeof window === 'undefined' || !accountId) return;
  try {
    if (sessionStorage.getItem(TAB_ACCOUNT_KEY) === accountId) sessionStorage.removeItem(TAB_ACCOUNT_KEY);
    if (localStorage.getItem(LAST_ACCOUNT_KEY) === accountId) localStorage.removeItem(LAST_ACCOUNT_KEY);
  } catch { /* ignore */ }
}

// ── Workspaces (account collaborators) ───────────────────────────────────────
// A collaborator works in another organizer's account: the tab remembers which owner
// account it shows; api.ts sends it as the X-Workspace header. Tied to the tab's signed-in
// account so switching accounts never carries a workspace over.
const TAB_WORKSPACE_KEY = 'zaya_workspace';

export function getTabWorkspace(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TAB_WORKSPACE_KEY);
    if (!raw) return null;
    const { accountId, ownerId } = JSON.parse(raw);
    return accountId && accountId === getTabAccountId() ? ownerId : null;
  } catch {
    return null;
  }
}

/** Open an organizer's workspace in this tab (null = back to my own account). */
export function switchWorkspace(ownerId: string | null): void {
  try {
    if (ownerId) sessionStorage.setItem(TAB_WORKSPACE_KEY, JSON.stringify({ accountId: getTabAccountId(), ownerId }));
    else sessionStorage.removeItem(TAB_WORKSPACE_KEY);
  } catch { /* ignore */ }
  window.location.href = '/dashboard';
}

/** Show another signed-in account in this tab. */
export function switchToAccount(accountId: string, path = '/dashboard'): void {
  setTabAccountId(accountId);
  try { sessionStorage.removeItem(TAB_WORKSPACE_KEY); } catch { /* ignore */ }
  window.location.href = path;
}

export function isAuthenticated(): boolean {
  const token = _memoryAccessToken;
  if (!token) return false;
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload));
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/** `sub` claim of a JWT (base64url-safe), i.e. the id of the account the token belongs to. */
export function tokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)).sub as string) ?? null;
  } catch {
    return null;
  }
}

// Tabs announce sign-outs so other tabs showing that account reload (and land on login).
const SESSION_CHANNEL = 'zaya-session';

export function announceSignOut(userId: string): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ userId });
    channel.close();
  } catch { /* unsupported browser: tabs simply won't sync */ }
}

export function onSessionAnnounced(callback: (userId: string | null) => void): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.onmessage = (e) => callback(e.data?.userId ?? null);
  return () => channel.close();
}

export function getUserRole(): string | null {
  const token = _memoryAccessToken;
  if (!token) return null;
  const decoded = decodeToken(token);
  return (decoded?.role as string) ?? null;
}
