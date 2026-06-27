import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_HOST = 'app.zaya.live';
const PUBLIC_HOST = 'zaya.live';

// Routes belonging to each subdomain
const APP_PREFIXES = ['/dashboard', '/auth', '/join'];
const PUBLIC_PREFIXES = ['/billetterie'];

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // static files (favicon, images, etc.)
  ) {
    return NextResponse.next();
  }

  const isAppHost = host === APP_HOST || host.startsWith('app.');
  const isPublicHost = host === PUBLIC_HOST || (!isAppHost && !host.startsWith('localhost'));
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.');

  // Local development: no subdomain enforcement
  if (isLocalhost) {
    if (pathname === '/') return NextResponse.redirect(new URL('/dashboard', request.url));
    return NextResponse.next();
  }

  // ── app.zaya.live ─────────────────────────────────────────────────────────
  if (isAppHost) {
    // Redirect billetterie routes to zaya.live
    if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(`https://${PUBLIC_HOST}${pathname}${request.nextUrl.search}`);
    }
    // Root → dashboard
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // ── zaya.live ─────────────────────────────────────────────────────────────
  if (isPublicHost) {
    // Redirect dashboard/auth routes to app.zaya.live
    if (APP_PREFIXES.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(`https://${APP_HOST}${pathname}${request.nextUrl.search}`);
    }
    // Root → billetterie
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/billetterie', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
