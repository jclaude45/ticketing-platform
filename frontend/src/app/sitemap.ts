import type { MetadataRoute } from 'next';
import { fetchPublic, siteUrl } from '@/lib/seo';

/** Built on request (the API is not reachable while the site is being built); events cached one hour */
export const dynamic = 'force-dynamic';
const revalidate = 3600;

const PAGES: { path: string; changeFrequency: 'daily' | 'monthly'; priority: number }[] = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/billetterie', changeFrequency: 'daily', priority: 0.9 },
  { path: '/services', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/tarifs', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/cgu', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/cgv', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/politique-de-confidentialite', changeFrequency: 'monthly', priority: 0.3 },
];

type EventPage = { data: { id: string; startDate: string }[]; meta: { totalPages: number } };

/** Upcoming published events (the public list leaves out the ones already over) */
async function upcomingEvents() {
  const events: { id: string; startDate: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetchPublic<EventPage>(`/public/events?page=${page}&limit=50`, revalidate);
    if (!res?.data) break;
    events.push(...res.data);
    if (page >= (res.meta?.totalPages ?? 1)) break;
  }
  return events;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const events = await upcomingEvents();
  return [
    ...PAGES.map(p => ({ url: siteUrl(p.path), lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority })),
    ...events.map(e => ({
      url: siteUrl(`/billetterie/${e.id}`),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];
}
