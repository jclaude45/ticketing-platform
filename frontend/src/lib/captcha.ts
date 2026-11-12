/**
 * Cloudflare Turnstile token for the forms that make the server e-mail a typed address
 * (sign-up, forgotten password, new confirmation link). The <Captcha /> widget stores the
 * token here and the API calls take it, like the proof of work. A token is single-use:
 * taking it resets the widget for the next attempt. No site key: nothing is shown or sent.
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

let token: string | null = null;
let resetWidget: (() => void) | null = null;

export function setCaptchaToken(value: string | null) {
  token = value;
}

export function registerCaptchaReset(reset: (() => void) | null) {
  resetWidget = reset;
}

export function takeCaptcha(): string | undefined {
  if (!TURNSTILE_SITE_KEY) return undefined;
  const value = token ?? undefined;
  token = null;
  resetWidget?.();
  return value;
}
