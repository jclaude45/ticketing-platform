import { ImageResponse } from 'next/og';
import { fetchPublic } from '@/lib/seo';

/** Link preview of an event: its poster on the left, its name, date and place on the right */
export const alt = 'Événement sur ZAYA';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type OgEvent = { name: string; venue: string; city: string; startDate: string; bannerUrl?: string | null };

const LOGO_PATH =
  'M370.7 605.3 L342.4 605.3 L304.0 566.8 L292.6 605.3 L240.0 605.3 L253.0 565.4 L302.6 565.4 L240.1 502.4 L253.0 474.3 L370.9 474.3 L357.4 514.2 L308.4 514.2 L370.7 577.0 Z M485.0 592.9 L404.3 592.9 L404.3 574.6 L457.4 494.4 L404.3 494.4 L404.3 474.4 L485.0 474.4 L485.0 492.9 L431.9 572.8 L485.0 572.8 Z M610.8 592.9 L585.7 592.9 L577.7 570.3 L530.7 570.3 L522.9 592.9 L498.0 592.9 L540.6 474.3 L568.2 474.3 Z M680.6 592.9 L657.0 592.9 L657.0 551.6 L616.8 474.4 L643.5 474.4 L669.0 528.5 L694.3 474.4 L720.8 474.4 L680.6 551.7 Z M839.9 592.9 L814.8 592.9 L807.0 570.3 L759.8 570.3 L752.0 592.9 L727.1 592.9 L769.7 474.3 L797.3 474.3 Z M571.4 551.3 L554.3 501.8 L537.2 551.3 Z M800.5 551.3 L783.4 501.7 L766.3 551.3 Z';

/** The renderer reads PNG and JPEG only, inline or by URL */
function drawablePoster(url?: string | null) {
  if (!url) return null;
  if (/^data:image\/(png|jpe?g);base64,/i.test(url)) return url;
  if (/^https:\/\/.+\.(png|jpe?g)(\?.*)?$/i.test(url)) return url;
  return null;
}

function kinshasaDate(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Kinshasa' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
}

export default async function EventOpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await fetchPublic<OgEvent>(`/public/events/${encodeURIComponent(id)}`);
  const poster = drawablePoster(event?.bannerUrl);
  const name = event?.name ?? 'ZAYA';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#ffffff', color: '#000000' }}>
        {poster && (
          <div style={{ width: 560, height: 630, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111111' }}>
            <img src={poster} width={560} height={630} style={{ objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 60px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: name.length > 28 ? 52 : 68, lineHeight: 1.05, letterSpacing: -1, textTransform: 'uppercase' }}>{name}</div>
            {event && <div style={{ marginTop: 32, fontSize: 32, color: '#222222' }}>{kinshasaDate(event.startDate)}</div>}
            {event && <div style={{ marginTop: 10, fontSize: 32, color: '#555555' }}>{[event.venue, event.city].filter(Boolean).join(', ')}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <svg viewBox="240 474 600 131.5" width="200" height="44">
              <path fill="#000000" fillRule="evenodd" d={LOGO_PATH} />
            </svg>
            <div style={{ fontSize: 26, color: '#555555' }}>Billets sur zaya.live</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
