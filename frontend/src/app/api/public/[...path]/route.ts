import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1')
  .replace(/\/$/, '');

// Strict whitelist — only known public routes are allowed through
const ALLOWED: RegExp[] = [
  /^\/public\/events$/,
  /^\/public\/events\/cities$/,
  /^\/public\/events\/[\w-]+$/,
  /^\/public\/events\/[\w-]+\/register$/,
  /^\/public\/events\/[\w-]+\/initiate-payment$/,
  /^\/public\/payments\/[\w-]+\/status$/,
  /^\/public\/payments\/[\w-]+\/tickets\/[\w-]+\/pdf$/,
  /^\/public\/payments\/callback$/,
];

async function proxy(req: NextRequest) {
  const url = new URL(req.url);

  // Strip /api prefix: /api/public/events → /public/events
  const backendPath = url.pathname.replace(/^\/api/, '');

  if (!ALLOWED.some(r => r.test(backendPath))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const backendUrl = `${BACKEND}${backendPath}${url.search}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const init: RequestInit = { method: req.method, headers };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { init.body = await req.text(); } catch { /* empty body */ }
  }

  try {
    const res = await fetch(backendUrl, init);
    const contentType = res.headers.get('Content-Type') ?? 'application/json';
    const body = await res.arrayBuffer();
    const resHeaders: Record<string, string> = { 'Content-Type': contentType };
    const disposition = res.headers.get('Content-Disposition');
    if (disposition) resHeaders['Content-Disposition'] = disposition;
    return new NextResponse(body, { status: res.status, headers: resHeaders });
  } catch {
    return NextResponse.json({ success: false, message: 'Backend unreachable' }, { status: 503 });
  }
}

export const GET  = proxy;
export const POST = proxy;
