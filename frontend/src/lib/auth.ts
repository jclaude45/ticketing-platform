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
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
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

export function getUserRole(): string | null {
  const token = _memoryAccessToken;
  if (!token) return null;
  const decoded = decodeToken(token);
  return (decoded?.role as string) ?? null;
}
