'use client';

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Calendar, Clock, Download, Loader2, MapPin, User } from 'lucide-react';

export interface TicketData {
  /** Ticket id: with the serial, it is what the QR code holds (read by ZCONTRÔLE) */
  ticketId?: string;
  serialNumber: string;
  holderName: string;
  holderEmail?: string;
  eventName: string;
  templateName: string;
  price: number;
  currency: string;
  /** Former stored QR image, used only when the id is unknown */
  qrCode?: string | null;
  /** Start of the event (ISO) */
  eventStart?: string;
  eventVenue?: string;
  eventCity?: string;
  ticketIndex?: number;
  totalTickets?: number;
}

/** Same content as the server's QR codes (V2 compact format) */
export const ticketQrContent = (ticketId: string, serialNumber: string) =>
  JSON.stringify({ id: ticketId, sn: serialNumber, v: '2' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Samedi 20 déc. 2026" and "15:30", in Kinshasa time */
function when(iso?: string) {
  if (!iso) return { date: '—', time: '—' };
  const d = new Date(iso);
  const tz = 'Africa/Kinshasa';
  return {
    date: capitalize(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })),
    time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }),
  };
}

// Explicit line heights: the PDF export (html2canvas) clips text and shifts icons without them
const LABEL = { margin: 0, fontSize: 13, lineHeight: '18px', height: 18, color: '#8a8a8a', display: 'flex', alignItems: 'center', gap: 6 } as const;
const VALUE = { margin: '6px 0 0', fontSize: 15, lineHeight: '22px', color: '#111111' } as const;
/** Date and time stay on one line */
const ONE_LINE = { ...VALUE, whiteSpace: 'nowrap' as const } as const;
const ICON = { display: 'block', width: 18, height: 18, color: '#8a8a8a', flexShrink: 0 } as const;
const RULE = { borderBottom: '1px solid #c9c9c9', paddingBottom: 12, marginBottom: 14 } as const;

/**
 * The ticket as shown after a purchase: date and time, place, holder, then the QR code to
 * show at the entrance. Inline styles only, so the PDF export (html2canvas) matches it.
 */
export function TicketVisual({ data }: { data: TicketData }) {
  const { date, time } = when(data.eventStart);
  const place = [data.eventVenue, data.eventCity].filter(Boolean).join(', ');

  return (
    <div style={{
      width: 340, maxWidth: '100%', boxSizing: 'border-box', background: '#ffffff',
      border: '1.5px solid #3a3a3a', borderRadius: 40, padding: '28px 24px 26px',
      fontFamily: 'Inter, Arial, Helvetica, sans-serif',
    }}>
      <div style={{ ...RULE, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={LABEL}><Calendar style={ICON} strokeWidth={1.8} />Date</p>
          <p style={ONE_LINE}>{date}</p>
        </div>
        <div style={{ width: 70, flexShrink: 0 }}>
          <p style={LABEL}><Clock style={ICON} strokeWidth={1.8} />Heure</p>
          <p style={ONE_LINE}>{time}</p>
        </div>
      </div>

      {place && (
        <div style={RULE}>
          <p style={LABEL}><MapPin style={ICON} strokeWidth={1.8} />Lieu</p>
          <p style={VALUE}>{place}</p>
        </div>
      )}

      <div>
        <p style={LABEL}><User style={ICON} strokeWidth={1.8} />Nom</p>
        <p style={VALUE}>{data.holderName}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0 14px' }}>
        {data.ticketId ? (
          <QRCodeSVG value={ticketQrContent(data.ticketId, data.serialNumber)} size={260} level="M" includeMargin={false} bgColor="#ffffff" fgColor="#000000" />
        ) : data.qrCode ? (
          <img src={data.qrCode} alt="QR code" style={{ width: 260, height: 260 }} />
        ) : null}
      </div>

      <p style={{ margin: 0, textAlign: 'center', fontSize: 15, color: '#111111', letterSpacing: 0.5 }}>{data.serialNumber}</p>
      <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 15, color: '#111111' }}>Tarif/{data.templateName}</p>
      {(data.totalTickets ?? 1) > 1 && (
        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 12, color: '#8a8a8a' }}>
          Billet {data.ticketIndex ?? 1} sur {data.totalTickets}
        </p>
      )}
    </div>
  );
}

// ─── Export PDF button ────────────────────────────────────────────────────────

/** One PDF page per ticket, drawn from the very TicketVisual shown on screen */
export function ExportPDFButton({ tickets, className }: { tickets: TicketData[]; className?: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;background:#ffffff;';
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const PW = 400, PH = 660;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [PW, PH] });

      for (let i = 0; i < tickets.length; i++) {
        const t = tickets[i];
        flushSync(() => root.render(
          <div style={{ width: PW, padding: '24px 30px', boxSizing: 'border-box', fontFamily: 'Inter, Arial, Helvetica, sans-serif' }}>
            <p style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: '#111111', textAlign: 'center' }}>{t.eventName}</p>
            <TicketVisual data={t} />
            <p style={{ margin: '14px 0 0', fontSize: 11, color: '#8a8a8a', textAlign: 'center' }}>
              Présentez ce QR code à l’entrée · ZAYA · zaya.live
            </p>
          </div>,
        ));
        const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', logging: false, width: PW });
        if (i > 0) pdf.addPage([PW, PH], 'portrait');
        const h = Math.min(PH, (canvas.height / canvas.width) * PW);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PW, h);
      }
      pdf.save(`billets-${tickets[0]?.serialNumber ?? 'zaya'}.pdf`);
    } catch (err) {
      console.error('PDF export error', err);
    } finally {
      root.unmount();
      container.remove();
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={className
        ? `flex items-center gap-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-opacity ${className}`
        : 'flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60'}
    >
      {loading
        ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération…</>
        : <><Download className="h-4 w-4" /> Télécharger PDF</>
      }
    </button>
  );
}
