import { ImageResponse } from 'next/og';

/** Link preview of the site (WhatsApp, Facebook, X, LinkedIn…): white card, ZAYA logo and tagline */
export const alt = 'ZAYA — Billetterie et événements en RDC';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Same shapes as the logo of the home page animation (public/zaya-site/banniere.json) */
const LOGO_PATH =
  'M370.7 605.3 L342.4 605.3 L304.0 566.8 L292.6 605.3 L240.0 605.3 L253.0 565.4 L302.6 565.4 L240.1 502.4 L253.0 474.3 L370.9 474.3 L357.4 514.2 L308.4 514.2 L370.7 577.0 Z M485.0 592.9 L404.3 592.9 L404.3 574.6 L457.4 494.4 L404.3 494.4 L404.3 474.4 L485.0 474.4 L485.0 492.9 L431.9 572.8 L485.0 572.8 Z M610.8 592.9 L585.7 592.9 L577.7 570.3 L530.7 570.3 L522.9 592.9 L498.0 592.9 L540.6 474.3 L568.2 474.3 Z M680.6 592.9 L657.0 592.9 L657.0 551.6 L616.8 474.4 L643.5 474.4 L669.0 528.5 L694.3 474.4 L720.8 474.4 L680.6 551.7 Z M839.9 592.9 L814.8 592.9 L807.0 570.3 L759.8 570.3 L752.0 592.9 L727.1 592.9 L769.7 474.3 L797.3 474.3 Z M571.4 551.3 L554.3 501.8 L537.2 551.3 Z M800.5 551.3 L783.4 501.7 L766.3 551.3 Z';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#ffffff', color: '#000000' }}>
        {/* The ZAYA logo (mark and wordmark), as vectors: the default font of the renderer has no bold */}
        <svg viewBox="240 474 600 131.5" width="720" height="158">
          <path fill="#000000" fillRule="evenodd" d={LOGO_PATH} />
        </svg>
        <div style={{ marginTop: 48, fontSize: 44, color: '#222222' }}>Billetterie et événements en RDC</div>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, color: '#555555' }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: '#FFDD00' }} />
          zaya.live
        </div>
      </div>
    ),
    size,
  );
}
