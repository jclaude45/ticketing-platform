import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { siteUrl } from '@/lib/seo';

/**
 * zaya.live: everything public may be indexed. app.zaya.live (organizer space) is closed to search
 * engines: its pages need an account, and the public pages live on zaya.live only.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') ?? '';
  if (host.startsWith('app.')) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/', '/auth/', '/join/', '/invite/', '/controle/', '/billetterie/payment/'],
      },
    ],
    sitemap: siteUrl('/sitemap.xml'),
    host: siteUrl('/'),
  };
}
