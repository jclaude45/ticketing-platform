import { ImageResponse } from 'next/og';

/** Home screen icon of iPhones and iPads (they need a PNG): the ZAYA mark, black on white */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <svg viewBox="0 0 226 226" width="120" height="120">
          <path
            fill="#000000"
            d="M0.688477 48.308L22.6331 0.5H224.837L202.109 67.9014H115.898L224.837 177.625V225.433H177.029L109.926 158.031L90.0345 225.433H0.688477L22.6331 158.031H109.926L0.688477 48.308Z"
          />
        </svg>
      </div>
    ),
    size,
  );
}
