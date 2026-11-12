'use client';

import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY, registerCaptchaReset, setCaptchaToken } from '@/lib/captcha';

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('Turnstile unavailable')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Anti-robot check shown above the submit button (see lib/captcha) */
export function Captcha({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: 'fr',
        callback: (t: string) => setCaptchaToken(t),
        'expired-callback': () => setCaptchaToken(null),
        'error-callback': () => setCaptchaToken(null),
      });
      registerCaptchaReset(() => { if (widgetId) window.turnstile?.reset(widgetId); });
    }).catch(() => { /* the server answers with a clear message if the token is missing */ });
    return () => {
      cancelled = true;
      setCaptchaToken(null);
      registerCaptchaReset(null);
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className={className} />;
}
