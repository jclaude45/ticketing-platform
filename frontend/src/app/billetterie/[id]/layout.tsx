import type { Metadata } from 'next';
import { EVENT_TYPE_LABELS } from '@/components/site/site-config';
import { absoluteMedia, excerpt, fetchPublic, pageMeta, siteUrl, SITE_NAME } from '@/lib/seo';

/** What the server needs from the public event to describe it to search engines */
interface SeoEvent {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  status?: string;
  venue: string;
  address?: string | null;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  bannerUrl?: string | null;
  minPrice: number | null;
  soldOut: boolean;
  ticketTemplates: { price: number; currency: string; availableCount: number }[];
  organizer?: { firstName: string; lastName: string } | null;
}

/** "Samedi 10 oct. 2026 à 18:00", at Kinshasa time (the server runs in UTC) */
function kinshasaDateTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Kinshasa' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} à ${time}`;
}

/** schema.org wants ISO country codes: the DRC is written « RDC » by the organizers */
function countryCode(country: string) {
  return /^(rdc|r\.?d\.?c\.?|congo[- ]kinshasa|république démocratique du congo|drc|cd)$/i.test(country.trim()) ? 'CD' : country;
}

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

const getEvent = (id: string) => fetchPublic<SeoEvent>(`/public/events/${encodeURIComponent(id)}`);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return { title: 'Événement introuvable', robots: { index: false } };

  const when = kinshasaDateTime(event.startDate);
  const where = [event.venue, event.city].filter(Boolean).join(', ');
  const kind = EVENT_TYPE_LABELS[event.type ?? 'OTHER'] ?? 'Événement';
  const description = excerpt(
    `${kind} · ${when} · ${where}. ${event.description ?? `Billets en vente sur ${SITE_NAME}.`}`,
    160,
  );
  return {
    ...pageMeta({
      title: `${event.name} — ${where}`,
      description,
      path: `/billetterie/${event.id}`,
      // No image here: the preview card is drawn by ./opengraph-image.tsx (poster + name + date)
    }),
    // An event already over stays reachable, but is no longer offered to search engines
    ...(new Date(event.endDate).getTime() < Date.now() && { robots: { index: false, follow: true } }),
  };
}

/** schema.org Event: lets search engines show the date, the place and the price */
function eventJsonLd(event: SeoEvent) {
  const url = siteUrl(`/billetterie/${event.id}`);
  const currency = event.ticketTemplates[0]?.currency ?? 'USD';
  const prices = event.ticketTemplates.map(t => t.price);
  const organizer = event.organizer ? `${event.organizer.firstName} ${event.organizer.lastName}`.trim() : SITE_NAME;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    description: excerpt(event.description, 500) || undefined,
    startDate: event.startDate,
    endDate: event.endDate,
    eventStatus: event.status === 'CANCELLED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [absoluteMedia(event.bannerUrl) ?? siteUrl(`/billetterie/${event.id}/opengraph-image`)],
    url,
    location: {
      '@type': 'Place',
      name: event.venue,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address || undefined,
        addressLocality: event.city,
        addressCountry: countryCode(event.country),
      },
    },
    organizer: { '@type': 'Organization', name: organizer },
    ...(prices.length > 0 && {
      offers: {
        '@type': 'AggregateOffer',
        url,
        priceCurrency: currency,
        lowPrice: Math.min(...prices),
        highPrice: Math.max(...prices),
        offerCount: prices.length,
        availability: event.soldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      },
    }),
  };
}

export default async function EventLayout({ params, children }: Props) {
  const { id } = await params;
  const event = await getEvent(id);
  return (
    <>
      {event && (
        <script
          type="application/ld+json"
          // JSON-LD: "<" escaped so that a name cannot close the script tag
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(event)).replace(/</g, '\\u003c') }}
        />
      )}
      {children}
    </>
  );
}
