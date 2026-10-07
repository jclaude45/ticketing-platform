import { EventView, type PublicEvent } from '@/components/billetterie/EventView';
import { fetchPublic } from '@/lib/seo';

/** Same request as the layout (metadata, JSON-LD): Next.js makes it only once */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await fetchPublic<PublicEvent>(`/public/events/${encodeURIComponent(id)}`);
  return <EventView id={id} initialEvent={event} />;
}
