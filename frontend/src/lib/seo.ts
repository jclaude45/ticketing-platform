/** Search engines and link previews: shared values of the public site (zaya.live) */
import { SITE_URL } from '@/components/site/site-config';

export const SITE_NAME = 'ZAYA';

export const DEFAULT_DESCRIPTION =
  'Billetterie en ligne et gestion d’événements en RDC : vendez vos billets par Mobile Money et carte, contrôlez les entrées par QR code, imprimez billets, bracelets et badges.';

/** Absolute address of a path of the public site */
export const siteUrl = (path = '/') => new URL(path, SITE_URL).toString();

/** API reached from the Next.js server (inside Docker: the backend container) */
const SERVER_API = (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

/** Public API call made while rendering on the server, cached for `revalidate` seconds */
export async function fetchPublic<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.data ?? body) as T;
  } catch {
    return null;
  }
}

/** Banner URL usable by crawlers: absolute, never localhost */
export function absoluteMedia(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\/localhost(:\d+)?/.test(url)) return url.replace(/^https?:\/\/localhost(:\d+)?/, SITE_URL);
  return /^https?:\/\//.test(url) ? url : siteUrl(url);
}

/** Text without line breaks, cut at `max` characters on a word boundary */
export function excerpt(text: string | null | undefined, max = 160): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max - 1) || max - 1)}…`;
}

/**
 * Metadata of a public page: title, description, canonical address and link previews.
 * `absoluteTitle` skips the « | ZAYA » suffix (home page).
 */
export function pageMeta({ title, description, path, absoluteTitle = false, image }: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  image?: string;
}) {
  const shown = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  const images = image ? [{ url: image }] : undefined;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website' as const, locale: 'fr_FR', siteName: SITE_NAME, title: shown, description, url: path, ...(images && { images }) },
    twitter: { card: 'summary_large_image' as const, title: shown, description, ...(images && { images: images.map(i => i.url) }) },
  };
}
