'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export interface TicketData {
  serialNumber: string;
  holderName: string;
  holderEmail: string;
  eventName: string;
  templateName: string;
  price: number;
  currency: string;
  qrCode?: string;
  eventDate?: string;
  eventVenue?: string;
  eventCity?: string;
  ticketIndex?: number;
  totalTickets?: number;
}

// ─── Ticket portrait (340 × 540) — inline styles only so html2canvas matches ─

export function TicketVisual({ data }: { data: TicketData }) {
  const priceLabel = data.price === 0 ? 'Gratuit' : `${data.price.toFixed(2)} ${data.currency}`;
  const priceColor = data.price === 0 ? '#6ee7b7' : '#ffffff';

  return (
    <div style={{
      width: 340, borderRadius: 20, overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(79,70,229,0.22)',
      fontFamily: 'Arial, Helvetica, sans-serif',
      display: 'inline-block',
    }}>

      {/* ── TOP — gradient body ────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(160deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%)',
        padding: '28px 24px 24px',
      }}>
        {/* Label */}
        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: 2 }}>
          Billet d&apos;entrée
        </p>

        {/* Event name */}
        <h2 style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
          {data.eventName}
        </h2>

        {/* Divider */}
        <div style={{ margin: '16px 0', height: 1, background: 'rgba(255,255,255,0.15)' }} />

        {/* Category + price row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Catégorie</p>
            <p style={{ margin: '3px 0 0', fontSize: 15, fontWeight: 700, color: '#fff' }}>{data.templateName}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Prix</p>
            <p style={{ margin: '3px 0 0', fontSize: 16, fontWeight: 800, color: priceColor }}>{priceLabel}</p>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'flex', gap: 0, marginTop: 18, flexWrap: 'wrap' as const }}>
          {data.eventDate && (
            <div style={{ flex: 1, minWidth: 120, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: 1 }}>Date</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, color: '#fff' }}>{data.eventDate}</p>
            </div>
          )}
          {data.eventVenue && (
            <div style={{ flex: 1, minWidth: 120, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: 1 }}>Lieu</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, color: '#fff' }}>
                {data.eventVenue}{data.eventCity ? `, ${data.eventCity}` : ''}
              </p>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 120 }}>
            <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: 1 }}>Titulaire</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, color: '#fff' }}>{data.holderName}</p>
          </div>
        </div>
      </div>

      {/* ── PERFORATION ────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', height: 24, background: '#f3f4f6', display: 'flex', alignItems: 'center' }}>
        {/* Left notch */}
        <div style={{
          position: 'absolute', left: -12, top: 2,
          width: 24, height: 20, borderRadius: '0 10px 10px 0',
          background: 'linear-gradient(160deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%)',
        }} />
        {/* Right notch */}
        <div style={{
          position: 'absolute', right: -12, top: 2,
          width: 24, height: 20, borderRadius: '10px 0 0 10px',
          background: 'linear-gradient(160deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%)',
        }} />
        {/* Dashed line */}
        <div style={{ flex: 1, margin: '0 16px', borderTop: '2px dashed #d1d5db' }} />
      </div>

      {/* ── BOTTOM stub ────────────────────────────────────────────────────── */}
      <div style={{
        background: '#f9fafb',
        padding: '20px 24px 24px',
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12,
      }}>

        {/* QR code */}
        {data.qrCode ? (
          <img src={data.qrCode} alt="QR Code"
               style={{ width: 160, height: 160, borderRadius: 12, border: '2px solid #e5e7eb' }} />
        ) : (
          <div style={{ width: 160, height: 160, borderRadius: 12, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>QR Code</span>
          </div>
        )}

        {/* Serial */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1.5 }}>Numéro de billet</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: 'monospace', letterSpacing: 1.5 }}>
            {data.serialNumber}
          </p>
          {(data.totalTickets ?? 1) > 1 && (
            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9ca3af' }}>
              Billet {data.ticketIndex ?? 1} sur {data.totalTickets}
            </p>
          )}
        </div>

        {/* Brand */}
        <p style={{ margin: 0, fontSize: 9, color: '#d1d5db', textTransform: 'uppercase', letterSpacing: 2 }}>
          ZAYA
        </p>
      </div>
    </div>
  );
}

// ─── Export PDF button ────────────────────────────────────────────────────────

export function ExportPDFButton({ tickets }: { tickets: TicketData[] }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      // Portrait A5-ish: 400px wide × 620px tall (fits the 340px ticket with margins)
      const PW = 400, PH = 620;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [PW, PH] });

      const container = document.createElement('div');
      container.style.cssText = `
        position:fixed;left:-9999px;top:0;
        background:#f3f4f6;
        width:${PW}px;
        display:flex;align-items:center;justify-content:center;
        padding:30px 0;
      `;
      document.body.appendChild(container);

      for (let i = 0; i < tickets.length; i++) {
        const t = tickets[i];
        container.innerHTML = buildTicketHTML(t);

        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#f3f4f6',
          logging: false,
          width: PW,
        });

        if (i > 0) pdf.addPage([PW, PH], 'portrait');

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, PW, PH);
      }

      document.body.removeChild(container);
      pdf.save(`billets-${tickets[0]?.serialNumber ?? 'export'}.pdf`);
    } catch (err) {
      console.error('PDF export error', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {loading
        ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération…</>
        : <><Download className="h-4 w-4" /> Télécharger PDF</>
      }
    </button>
  );
}

// ─── HTML mirror for html2canvas (matches TicketVisual inline styles exactly) ─

function buildTicketHTML(t: TicketData): string {
  const priceLabel = t.price === 0 ? 'Gratuit' : `${t.price.toFixed(2)} ${t.currency}`;
  const priceColor = t.price === 0 ? '#6ee7b7' : '#ffffff';
  const qrImg = t.qrCode
    ? `<img src="${t.qrCode}" style="width:160px;height:160px;border-radius:12px;border:2px solid #e5e7eb;" />`
    : `<div style="width:160px;height:160px;border-radius:12px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ca3af;">QR Code</div>`;
  const datePart = t.eventDate
    ? `<div style="flex:1;min-width:120px;margin-bottom:10px;">
         <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.50);text-transform:uppercase;letter-spacing:1px;">Date</p>
         <p style="margin:3px 0 0;font-size:12px;font-weight:600;color:#fff;">${t.eventDate}</p>
       </div>` : '';
  const venuePart = t.eventVenue
    ? `<div style="flex:1;min-width:120px;margin-bottom:10px;">
         <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.50);text-transform:uppercase;letter-spacing:1px;">Lieu</p>
         <p style="margin:3px 0 0;font-size:12px;font-weight:600;color:#fff;">${t.eventVenue}${t.eventCity ? ', ' + t.eventCity : ''}</p>
       </div>` : '';
  const countBadge = (t.totalTickets ?? 1) > 1
    ? `<p style="margin:4px 0 0;font-size:10px;color:#9ca3af;">Billet ${t.ticketIndex ?? 1} sur ${t.totalTickets}</p>` : '';

  const dashes = Array.from({ length: 8 }).map(() =>
    '<div style="display:inline-block;width:16px;height:2px;background:#d1d5db;border-radius:1px;margin:0 3px;"></div>'
  ).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:center;padding:30px 0;">
      <div style="width:340px;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(79,70,229,0.22);font-family:Arial,Helvetica,sans-serif;">

        <!-- Top gradient -->
        <div style="background:linear-gradient(160deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%);padding:28px 24px 24px;">
          <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.60);text-transform:uppercase;letter-spacing:2px;">Billet d'entrée</p>
          <h2 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#fff;line-height:1.2;">${t.eventName}</h2>
          <div style="margin:16px 0;height:1px;background:rgba(255,255,255,0.15);"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:1.2px;">Catégorie</p>
              <p style="margin:3px 0 0;font-size:15px;font-weight:700;color:#fff;">${t.templateName}</p>
            </div>
            <div style="text-align:right;">
              <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:1.2px;">Prix</p>
              <p style="margin:3px 0 0;font-size:16px;font-weight:800;color:${priceColor};">${priceLabel}</p>
            </div>
          </div>
          <div style="display:flex;gap:0;margin-top:18px;flex-wrap:wrap;">
            ${datePart}
            ${venuePart}
            <div style="flex:1;min-width:120px;">
              <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.50);text-transform:uppercase;letter-spacing:1px;">Titulaire</p>
              <p style="margin:3px 0 0;font-size:12px;font-weight:600;color:#fff;">${t.holderName}</p>
            </div>
          </div>
        </div>

        <!-- Perforation -->
        <div style="position:relative;height:24px;background:#f3f4f6;display:flex;align-items:center;">
          <div style="position:absolute;left:-12px;top:2px;width:24px;height:20px;border-radius:0 10px 10px 0;background:linear-gradient(160deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%);"></div>
          <div style="position:absolute;right:-12px;top:2px;width:24px;height:20px;border-radius:10px 0 0 10px;background:linear-gradient(160deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%);"></div>
          <div style="flex:1;margin:0 16px;text-align:center;">${dashes}</div>
        </div>

        <!-- Bottom stub -->
        <div style="background:#f9fafb;padding:20px 24px 24px;display:flex;flex-direction:column;align-items:center;gap:12px;">
          ${qrImg}
          <div style="text-align:center;">
            <p style="margin:0;font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;">Numéro de billet</p>
            <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#111827;font-family:monospace;letter-spacing:1.5px;">${t.serialNumber}</p>
            ${countBadge}
          </div>
          <p style="margin:0;font-size:9px;color:#d1d5db;text-transform:uppercase;letter-spacing:2px;">ZAYA</p>
        </div>

      </div>
    </div>`;
}
