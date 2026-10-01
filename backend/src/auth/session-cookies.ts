import { Request } from 'express';

/**
 * Multi-account sessions: each account signed in on a browser has its own refresh cookie
 * (`refresh_token_<accountId>`), so several accounts can stay signed in side by side and
 * every tab refreshes the account it shows. `refresh_token` is the pre-multi-account cookie,
 * still read so existing sessions survive the upgrade.
 */
export const LEGACY_REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_COOKIE_RE = /^refresh_token_([0-9a-f-]{36})$/i;

export const refreshCookieName = (accountId: string) => `refresh_token_${accountId}`;

export const isAccountId = (value: unknown): value is string =>
  typeof value === 'string' && ACCOUNT_ID_RE.test(value);

/** Refresh token for the account the client asked for (body.accountId), else the legacy cookie. */
export function pickRefreshCookie(req: Request): { token: string | null; legacy: boolean } {
  const accountId = req?.body?.accountId;
  if (isAccountId(accountId)) {
    const token = req.cookies?.[refreshCookieName(accountId)];
    if (token) return { token, legacy: false };
  }
  const legacy = req?.cookies?.[LEGACY_REFRESH_COOKIE];
  return legacy ? { token: legacy, legacy: true } : { token: null, legacy: false };
}

/** Every refresh token stored in this browser (one per signed-in account, plus legacy). */
export function allRefreshCookies(req: Request): string[] {
  const cookies = req?.cookies ?? {};
  return Object.entries(cookies)
    .filter(([name]) => ACCOUNT_COOKIE_RE.test(name) || name === LEGACY_REFRESH_COOKIE)
    .map(([, value]) => String(value));
}
