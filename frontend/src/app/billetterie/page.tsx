import { BilletterieView, type BilletterieInitial, type Highlights, type Page } from '@/components/billetterie/BilletterieView';
import { fetchPublic } from '@/lib/seo';

/** Rebuilt at most every minute: new events and sales show up without a deployment */
export const revalidate = 60;

export default async function BilletteriePage() {
  const [hero, list, highlights, cities] = await Promise.all([
    fetchPublic<Page>('/public/events?page=1&limit=20', revalidate),
    fetchPublic<Page>('/public/events?page=1&limit=12', revalidate),
    fetchPublic<Highlights>('/public/events/highlights', revalidate),
    fetchPublic<string[]>('/public/events/cities', revalidate),
  ]);
  const initial: BilletterieInitial = { hero, list, highlights, cities, fetchedAt: Date.now() };
  return <BilletterieView initial={initial} />;
}
