import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const origin = (url: string | undefined) => {
  try { return url ? new URL(url).origin : null; } catch { return null; }
};

/**
 * Where pages may load from. Inline scripts stay allowed (Next.js writes its own, a nonce
 * would make every page dynamic); scripts, connections and frames from any other site do
 * not load, and no other site can frame ZAYA. Google Analytics is not listed: its id is
 * not given to the production build.
 */
const api = origin(process.env.NEXT_PUBLIC_API_URL);
const socket = origin(process.env.NEXT_PUBLIC_SOCKET_URL);
const ws = origin(process.env.NEXT_PUBLIC_WS_URL);
const turnstile = 'https://challenges.cloudflare.com';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} ${turnstile}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://zaya.live https://*.zaya.live https://*.tile.openstreetmap.org",
  // Both sites: links prefetched from one are redirected to the other
  `connect-src ${Array.from(new Set(["'self'", 'https://zaya.live', 'https://app.zaya.live', api, socket, ws, socket?.replace(/^http/, 'ws'), turnstile].filter(Boolean))).join(' ')}`,
  `frame-src ${turnstile}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    // Only ZAYA's own pictures (posters, photos): the server fetches and resizes whatever is
    // allowed here, so an open list let anyone use it to fetch any address
    remotePatterns: [
      { protocol: 'https', hostname: 'zaya.live' },
      { protocol: 'https', hostname: '*.zaya.live' },
      ...(isProd ? [] : [{ protocol: 'http' as const, hostname: 'localhost' }]),
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'zaya.live', 'app.zaya.live'] },
  },
  async redirects() {
    if (!isProd) return [];
    return [
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
        destination: 'https://zaya.live/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          ...(isProd
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
