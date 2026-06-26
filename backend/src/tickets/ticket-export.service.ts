import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { SubscriptionService } from '../subscription/subscription.service';
import * as PDFDocument from 'pdfkit';
import * as archiver from 'archiver';
import * as QRCode from 'qrcode';
import * as sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';

const LOGO_SVG_PATH = path.join(__dirname, '../../assets/powered-logo.svg');
const LOGO_ASPECT = 1109 / 300;

// A4 dimensions in PDFKit points (1pt = 1/72 inch)
const A4_W = 595;
const A4_H = 842;

// Horizontal-strip layout: 4 tickets per page, each full width
const STRIP_MX  = 10;   // left/right margin
const STRIP_MT  = 10;   // top margin
const STRIP_MB  = 22;   // bottom margin (space for page number)
const STRIP_GAP = 6;    // gap between strips
const STRIP_W   = A4_W - 2 * STRIP_MX;                                             // 575
const STRIP_H   = Math.floor((A4_H - STRIP_MT - STRIP_MB - 3 * STRIP_GAP) / 4);   // ~197

// ── PDF layout calculator ─────────────────────────────────────────────────────
// Chooses tile size and grid so the ticket ALWAYS keeps its aspect ratio (no distortion).
//
// presetWidth/presetHeight: preset px dims at 300 dpi (e.g. A6=1240×1748, A5=1748×2480,
// A4=2480×3508). When present we lay tickets out at their real physical size and pack as
// many as fit per A4 page. When absent (legacy templates) we fall back to width/height just
// to detect orientation, and print one undistorted ticket per page.
//   • landscape ticket           → 4 horizontal strips (1 col × 4)
//   • A6 portrait (~105×148mm)    → 4 per page (2 × 2)
//   • A5 portrait (~148×210mm)    → 1 per page (two don't fit a portrait A4 without rotation)
//   • A4 portrait (~210×297mm)    → 1 per page
//   • legacy portrait (no preset) → 1 per page, scaled to the page, aspect preserved
interface PdfLayout {
  tileW: number; tileH: number;
  cols: number; rows: number; tilesPerPage: number;
}
function computeLayout(
  presetW?: number, presetH?: number,
  fallbackW?: number, fallbackH?: number,
): PdfLayout {
  const PAGE_W = STRIP_W;                          // 575 pt printable width
  const PAGE_H = A4_H - STRIP_MT - STRIP_MB;       // 810 pt printable height
  const GAP    = STRIP_GAP;                         //   6 pt

  const hasPreset = !!(presetW && presetH);
  const W = hasPreset ? presetW! : fallbackW;
  const H = hasPreset ? presetH! : fallbackH;

  // Landscape (or no dims at all) → classic 4-strip layout
  if (!W || !H || W >= H * 1.15) {
    return { tileW: STRIP_W, tileH: STRIP_H, cols: 1, rows: 4, tilesPerPage: 4 };
  }

  const ratio = W / H; // < 1 → portrait

  // Helper: fit a tile of `ratio` inside a cell, preserving aspect
  const fitTile = (cellW: number, cellH: number) => {
    let tw = cellW;
    let th = tw / ratio;
    if (th > cellH) { th = cellH; tw = th * ratio; }
    return { tw: Math.floor(tw), th: Math.floor(th) };
  };

  // Legacy portrait (no preset px) → one undistorted ticket per page
  if (!hasPreset) {
    const { tw, th } = fitTile(PAGE_W, PAGE_H);
    return { tileW: tw, tileH: th, cols: 1, rows: 1, tilesPerPage: 1 };
  }

  // Preset known → lay out at real physical size (300 dpi → pt), pack to fit
  const PX_TO_PT = 72 / 300;                       // preset px → PDF points
  const idealW   = presetW! * PX_TO_PT;
  const idealH   = presetH! * PX_TO_PT;
  let cols = Math.min(4, Math.max(1, Math.round(PAGE_W / idealW)));
  let rows = Math.min(6, Math.max(1, Math.round(PAGE_H / idealH)));

  const cellW = (PAGE_W - (cols - 1) * GAP) / cols;
  const cellH = (PAGE_H - (rows - 1) * GAP) / rows;
  const { tw, th } = fitTile(cellW, cellH);
  return { tileW: tw, tileH: th, cols, rows, tilesPerPage: cols * rows };
}

@Injectable()
export class TicketExportService {
  private readonly logger = new Logger(TicketExportService.name);
  private _logoBuffer: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly qrcodeService: QrcodeService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  private async _getLogoBuffer(): Promise<Buffer> {
    if (this._logoBuffer) return this._logoBuffer;
    try {
      const svgRaw = fs.readFileSync(LOGO_SVG_PATH, 'utf-8');
      this._logoBuffer = await (sharp as any)(Buffer.from(svgRaw, 'utf-8')).resize(600, Math.round(600 / LOGO_ASPECT)).png().toBuffer();
    } catch (e) {
      this.logger.warn(`Could not load powered logo: ${(e as Error).message}`);
      this._logoBuffer = Buffer.alloc(0);
    }
    return this._logoBuffer!;
  }

  async generateTicketPDF(ticketId: string): Promise<Buffer> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        event: {
          select: {
            name: true,
            venue: true,
            city: true,
            country: true,
            startDate: true,
            endDate: true,
            bannerUrl: true,
            organizerId: true,
          },
        },
        // customFields must be included so drawTicketCell can use the canvas design.
        template: {
          select: { name: true, color: true, price: true, currency: true, customFields: true },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    // Generate a compact QR buffer (same spec as the grouped export).
    const qrContent = JSON.stringify({ id: ticket.id, sn: ticket.serialNumber, v: '2' });
    const qrBuffer: Buffer = await (QRCode as any).toBuffer(qrContent, {
      errorCorrectionLevel: 'L',
      type: 'png',
      margin: 2,
      width: 250,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    // Derive tile dimensions from the template's saved canvas preset — same logic as grouped export.
    const cf = ticket.template?.customFields as any;
    const { tileW, tileH } = computeLayout(cf?.presetWidth, cf?.presetHeight, cf?.width, cf?.height);

    // Center the single ticket on the A4 page.
    const cx = STRIP_MX + Math.max(0, (STRIP_W - tileW) / 2);
    const cy = STRIP_MT + Math.max(0, (A4_H - STRIP_MT - STRIP_MB - tileH) / 2);

    const showLogo = await this.subscriptionService.getShowPoweredBy((ticket.event as any).organizerId);
    const logoBuf = showLogo ? await this._getLogoBuffer() : Buffer.alloc(0);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.addPage({ size: 'A4', margin: 0 });
      this.drawTicketCell(doc, ticket, cx, cy, tileW, tileH, qrBuffer, logoBuf);
      doc.end();
    });
  }

  async generateBulkTicketsPDF(ticketIds: string[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let i = 0; i < ticketIds.length; i++) {
        const ticket = await this.prisma.ticket.findUnique({
          where: { id: ticketIds[i] },
          include: {
            event: { select: { name: true, venue: true, city: true, country: true, startDate: true } },
            template: { select: { name: true, color: true, price: true, currency: true } },
          },
        });

        if (!ticket) continue;

        doc.addPage();

        const color = ticket.template.color || '#1a1a2e';
        doc.rect(0, 0, 595, 120).fill(color);
        doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text(ticket.event.name, 40, 30, { width: 515 });
        doc.fontSize(13).font('Helvetica').text(ticket.template.name, 40, 65);
        doc.fontSize(10).text(`Serial: ${ticket.serialNumber}`, 40, 88);

        doc.fillColor('#000000');
        doc.fontSize(10).font('Helvetica');

        const startDate = new Date(ticket.event.startDate).toLocaleDateString();
        doc.text(`Date: ${startDate}`, 40, 140);
        doc.text(`Venue: ${ticket.event.venue}, ${ticket.event.city}`, 40, 156);
        if (ticket.holderName) doc.text(`Holder: ${ticket.holderName}`, 40, 172);
        doc.text(`Price: ${ticket.template.currency} ${Number(ticket.template.price).toFixed(2)}`, 40, 188);
        doc.text(`Status: ${ticket.status}`, 40, 204);

        if (ticket.qrCode) {
          const base64Data = ticket.qrCode.replace(/^data:image\/png;base64,/, '');
          const qrBuffer = Buffer.from(base64Data, 'base64');
          doc.image(qrBuffer, 400, 130, { width: 140, height: 140 });
        }
      }

      doc.end();
    });
  }

  async generateTicketsZip(ticketIds: string[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });
      const passThrough = new PassThrough();

      passThrough.on('data', (chunk) => chunks.push(chunk));
      passThrough.on('end', () => resolve(Buffer.concat(chunks)));
      passThrough.on('error', reject);
      archive.on('error', reject);

      archive.pipe(passThrough);

      for (const ticketId of ticketIds) {
        try {
          const pdfBuffer = await this.generateTicketPDF(ticketId);

          const ticket = await this.prisma.ticket.findUnique({
            where: { id: ticketId },
            select: { serialNumber: true },
          });

          if (ticket) {
            archive.append(pdfBuffer, { name: `ticket-${ticket.serialNumber}.pdf` });
          }
        } catch (err) {
          this.logger.error(`Failed to generate PDF for ticket ${ticketId}`, err);
        }
      }

      await archive.finalize();
    });
  }

  async generateEventTicketsZip(eventId: string): Promise<Buffer> {
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, status: { not: 'CANCELLED' } },
      select: { id: true },
    });

    const ticketIds = tickets.map((t) => t.id);
    return this.generateTicketsZip(ticketIds);
  }

  // ---------------------------------------------------------------------------
  // 4 TICKETS PER PAGE — main grouped export
  // ---------------------------------------------------------------------------

  /**
   * Génère un PDF avec 4 billets par page en grille 2×2.
   * Chaque billet occupe ~272×395 pts (moitié de A4 moins marges/gouttière).
   * Supporte le filtrage par statut et la pagination côté service.
   *
   * @param eventId   UUID de l'événement
   * @param ticketIds Liste d'IDs précise ; si absent, tous les billets valides de l'événement
   */
  async generateGroupedTicketsPDF(
    eventId: string,
    ticketIds?: string[],
  ): Promise<Buffer> {
    // Resolve ticket list
    let ids = ticketIds;
    if (!ids || ids.length === 0) {
      const rows = await this.prisma.ticket.findMany({
        where: { eventId, status: { not: 'CANCELLED' } },
        select: { id: true },
        // Group by template first so all tickets of the same tariff are consecutive in the PDF.
        orderBy: [{ templateId: 'asc' }, { serialNumber: 'asc' }],
      });
      ids = rows.map((r) => r.id);
    }

    if (ids.length === 0) {
      throw new BadRequestException('No valid tickets found for this event');
    }

    // Fetch all tickets in one query for performance.
    // Order by templateId then serialNumber so each tariff's tickets are grouped together.
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ids } },
      include: {
        event: {
          select: {
            name: true,
            venue: true,
            city: true,
            country: true,
            startDate: true,
            organizerId: true,
          },
        },
        template: {
          select: { name: true, color: true, price: true, currency: true, customFields: true },
        },
      },
      orderBy: [{ templateId: 'asc' }, { serialNumber: 'asc' }],
    });

    // Pre-generate all QR code buffers (compact V2 format, 'L' error correction for max printability)
    const qrBufferMap = new Map<string, Buffer>();
    await Promise.all(
      tickets.map(async (ticket) => {
        const content = JSON.stringify({ id: ticket.id, sn: ticket.serialNumber, v: '2' });
        const buf = await (QRCode as any).toBuffer(content, {
          errorCorrectionLevel: 'L',
          type: 'png',
          margin: 2,
          width: 250,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        qrBufferMap.set(ticket.id, buf);
      }),
    );

    const organizerIdForLogo = (tickets[0]?.event as any)?.organizerId;
    const showLogo = organizerIdForLogo
      ? await this.subscriptionService.getShowPoweredBy(organizerIdForLogo)
      : true;
    const logoBuf = showLogo ? await this._getLogoBuffer() : Buffer.alloc(0);

    // Group tickets by templateId so each tariff is rendered with its own canvas layout.
    // The Map preserves insertion order (tickets are already sorted by templateId then serialNumber).
    const groups = new Map<string, typeof tickets>();
    for (const t of tickets) {
      const key = t.templateId ?? '__no_template__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    // Total pages across all groups (needed for footer page numbering)
    let globalPage    = 0;
    const totalPages  = Array.from(groups.values()).reduce((sum, g) => {
      const cf   = g[0]?.template?.customFields as any;
      const lay  = computeLayout(cf?.presetWidth, cf?.presetHeight, cf?.width, cf?.height);
      return sum + Math.ceil(g.length / lay.tilesPerPage);
    }, 0);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const [, groupTickets] of groups) {
        // Each template group uses its own canvas layout
        const cf0 = groupTickets[0]?.template?.customFields as any;
        const { tileW, tileH, cols, tilesPerPage } = computeLayout(
          cf0?.presetWidth, cf0?.presetHeight, cf0?.width, cf0?.height,
        );

        for (let pageStart = 0; pageStart < groupTickets.length; pageStart += tilesPerPage) {
          globalPage++;
          doc.addPage({ size: 'A4', margin: 0 });

          // Footer: global page counter + template name for context
          const tplName = groupTickets[0]?.template?.name ?? '';
          doc
            .save()
            .fillColor('#AAAAAA')
            .fontSize(7)
            .font('Helvetica')
            .text(
              `Page ${globalPage} / ${totalPages}  •  ${tplName}  •  ${tickets.length} billets`,
              0, A4_H - 14,
              { width: A4_W, align: 'center' },
            )
            .restore();

          const pageGroup = groupTickets.slice(pageStart, pageStart + tilesPerPage);
          const usedRows  = Math.ceil(pageGroup.length / cols);
          const usedCols  = Math.min(cols, pageGroup.length);

          // Center the ticket block on the printable area (nice for 1-per-page A4/A5)
          const blockW = usedCols * tileW + (usedCols - 1) * STRIP_GAP;
          const blockH = usedRows * tileH + (usedRows - 1) * STRIP_GAP;
          const offX   = STRIP_MX + Math.max(0, (STRIP_W - blockW) / 2);
          const offY   = STRIP_MT + Math.max(0, ((A4_H - STRIP_MT - STRIP_MB) - blockH) / 2);

          for (let i = 0; i < pageGroup.length; i++) {
            const ticket = pageGroup[i];
            const col    = i % cols;
            const row    = Math.floor(i / cols);
            const cx     = offX + col * (tileW + STRIP_GAP);
            const cy     = offY + row * (tileH + STRIP_GAP);
            this.drawTicketCell(doc, ticket, cx, cy, tileW, tileH, qrBufferMap.get(ticket.id), logoBuf);
          }

          // Dashed cut marks between rows
          for (let r = 0; r < usedRows - 1; r++) {
            const sepY = offY + (r + 1) * (tileH + STRIP_GAP) - Math.floor(STRIP_GAP / 2);
            doc
              .save()
              .dash(4, { space: 4 })
              .moveTo(offX + 8, sepY)
              .lineTo(offX + blockW - 8, sepY)
              .strokeColor('#DDDDDD').lineWidth(0.4).stroke()
              .undash()
              .restore();
          }
          // Dashed cut mark between columns (multi-column grid)
          if (cols > 1 && usedCols > 1) {
            const sepX = offX + tileW + Math.floor(STRIP_GAP / 2);
            doc
              .save()
              .dash(4, { space: 4 })
              .moveTo(sepX, offY + 8)
              .lineTo(sepX, offY + blockH - 8)
              .strokeColor('#DDDDDD').lineWidth(0.4).stroke()
              .undash()
              .restore();
          }
        } // end pageStart loop
      }   // end groups loop

      doc.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Dessine un billet complet dans sa cellule (cx, cy) de taille CELL_W × CELL_H.
   *
   * Zones internes :
   *   0..60    — bande colorée (en-tête)
   *   60..200  — corps : texte à gauche, QR à droite
   *   200..215 — ligne de coupe en tirets
   *   215..395 — pied : ID billet + mention légale
   */
  /** Dispatcher: uses canvas design if available, otherwise generic strip */
  private drawTicketCell(doc: any, ticket: any, cx: number, cy: number, tileW: number, tileH: number, qrBuffer?: Buffer, logoBuf?: Buffer): void {
    const cf = ticket.template?.customFields as any;
    const preview: string | undefined = cf?.preview;
    const qrBounds = cf?.qrBounds as { left: number; top: number; width: number; height: number } | undefined;
    const serialBounds = cf?.serialBounds as { left: number; top: number; width: number; height: number; fontSize?: number; fontWeight?: string; fill?: string } | undefined;
    const nameBounds = cf?.nameBounds as { left: number; top: number; width: number; height: number; fontSize: number; fontFamily: string; fontWeight: string; fill: string; textAlign: string } | undefined;

    if (preview && preview.startsWith('data:image/')) {
      this.drawDesignCell(doc, ticket, cx, cy, preview, qrBounds, serialBounds, nameBounds, tileW, tileH, qrBuffer, logoBuf);
      return;
    }

    // ── Generic horizontal strip layout (fallback when no canvas preview) ────
    const color = (ticket.template?.color as string) || '#1a1a2e';
    const QR_SIZE = Math.min(tileH - 24, 100); // cap at 100pt for clean printing
    const QR_X   = cx + tileW - QR_SIZE - 12;
    const QR_Y   = cy + Math.floor((tileH - QR_SIZE) / 2);
    const TEXT_W  = tileW - QR_SIZE - 32;

    // Background
    doc
      .save()
      .roundedRect(cx, cy, tileW, tileH, 4)
      .clip()
      .fillColor(color)
      .rect(cx, cy, tileW, tileH)
      .fill()
      .restore();

    // Diagonal accent
    doc
      .save()
      .opacity(0.08)
      .fillColor('#FFFFFF')
      .moveTo(cx + tileW * 0.55, cy)
      .lineTo(cx + tileW, cy)
      .lineTo(cx + tileW, cy + tileH)
      .lineTo(cx + tileW * 0.45, cy + tileH)
      .fill()
      .opacity(1)
      .restore();

    // Event name
    doc
      .save()
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(ticket.event?.name ?? 'Événement', cx + 14, cy + 14, {
        width: TEXT_W, lineBreak: false, ellipsis: true,
      })
      .restore();

    // Date / venue
    const startDate = ticket.event?.startDate ? new Date(ticket.event.startDate) : null;
    const dateStr   = startDate
      ? startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—';
    const venue = [ticket.event?.venue, ticket.event?.city].filter(Boolean).join(', ');
    const price = ticket.template
      ? `${Number(ticket.template.price ?? 0).toFixed(2)} ${ticket.template.currency ?? ''}`
      : '—';

    const infoRows: [string, string][] = [
      ['DATE', dateStr],
      ['LIEU', venue || '—'],
      ['PRIX', price],
    ];
    if (ticket.holderName)  infoRows.push(['TITULAIRE', ticket.holderName]);

    let rowY = cy + 42;
    for (const [lbl, val] of infoRows) {
      doc
        .save()
        .fillColor('rgba(255,255,255,0.55)')
        .font('Helvetica-Bold').fontSize(6.5)
        .text(lbl, cx + 14, rowY, { width: TEXT_W, lineBreak: false })
        .fillColor('#FFFFFF')
        .font('Helvetica').fontSize(9)
        .text(val, cx + 14, rowY + 8, { width: TEXT_W, lineBreak: false, ellipsis: true })
        .restore();
      rowY += 24;
    }

    // Serial number at bottom-left
    doc
      .save()
      .fillColor('rgba(255,255,255,0.7)')
      .font('Helvetica').fontSize(8)
      .text(`N° ${ticket.serialNumber ?? ''}`, cx + 14, cy + tileH - 18, {
        width: TEXT_W, lineBreak: false,
      })
      .restore();

    // QR white background + image
    doc
      .save()
      .fillColor('#FFFFFF')
      .roundedRect(QR_X - 4, QR_Y - 4, QR_SIZE + 8, QR_SIZE + 8, 4)
      .fill()
      .restore();

    if (qrBuffer) {
      try {
        doc.image(qrBuffer, QR_X, QR_Y, { width: QR_SIZE, height: QR_SIZE });
      } catch (e) {
        this.logger.warn(`Failed to draw QR (generic) for ticket ${ticket.id}: ${(e as Error).message}`);
      }
    }

    // Powered-by logo below QR (white version, fits in the existing white QR background extension)
    if (logoBuf && logoBuf.length > 0) {
      const logoW = QR_SIZE + 8;
      const logoH = Math.round(logoW / LOGO_ASPECT);
      const logoX = QR_X - 4;
      const logoY = QR_Y + QR_SIZE + 5;
      // Extend white background to include logo
      doc.save().fillColor('#FFFFFF')
        .rect(logoX, logoY - 2, logoW, logoH + 4)
        .fill().restore();
      try {
        doc.image(logoBuf, logoX, logoY, { width: logoW, height: logoH });
      } catch {}
    }

    // Cell border
    doc
      .save()
      .roundedRect(cx, cy, tileW, tileH, 4)
      .strokeColor('rgba(0,0,0,0.15)')
      .lineWidth(0.5)
      .stroke()
      .restore();
  }

  /**
   * Dessine un billet avec le design PNG sauvegardé depuis TicketEditor.
   * Le PNG est utilisé comme fond de la bande horizontale.
   * Le vrai QR code et le numéro de série sont superposés aux positions stockées.
   */
  private drawDesignCell(
    doc: any,
    ticket: any,
    cx: number,
    cy: number,
    preview: string,
    qrBounds: { left: number; top: number; width: number; height: number } | undefined,
    serialBounds: { left: number; top: number; width: number; height: number; fontSize?: number; fontWeight?: string; fill?: string } | undefined,
    nameBounds: { left: number; top: number; width: number; height: number; fontSize: number; fontFamily: string; fontWeight: string; fill: string; textAlign: string } | undefined,
    tileW: number,
    tileH: number,
    qrBuffer?: Buffer,
    logoBuf?: Buffer,
  ): void {
    // Derive actual canvas dimensions from the PNG header.
    // The preview is exported at multiplier:2, so: pngW = 2 × canvasW.
    // This avoids relying on the stored designW/designH which may be incorrect (legacy saves
    // stored the full-resolution preset size rather than the actual screen canvas size).
    const imgBuffer = Buffer.from(preview.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const pngW = imgBuffer.readUInt32BE(16); // PNG IHDR width  (bytes 16–19)
    const pngH = imgBuffer.readUInt32BE(20); // PNG IHDR height (bytes 20–23)
    const actualW = pngW / 2;               // canvas was exported at 2× multiplier
    const actualH = pngH / 2;
    const scaleX = tileW / actualW;
    const scaleY = tileH / actualH;

    // ── 1. Background PNG — clipped to tile, scaled to exact tile dimensions ──
    try {
      doc.save();
      doc.roundedRect(cx, cy, tileW, tileH, 4).clip();
      doc.image(imgBuffer, cx, cy, { width: tileW, height: tileH });
      doc.restore();
    } catch (e) {
      this.logger.warn(`Failed to draw design background for ticket ${ticket.id}: ${(e as Error).message}`);
    }

    // ── 2. QR code — drawn AFTER clip is released, clamped to strip bounds ──────
    const serial: string = ticket.serialNumber ?? '';
    if (qrBuffer) {
      let qrX: number, qrY: number, qrSide: number;

      if (qrBounds && qrBounds.width > 0 && qrBounds.height > 0) {
        const boxW = qrBounds.width  * scaleX;
        const boxH = qrBounds.height * scaleY;
        // QR code must be square — use the min dimension and align to top-left of placeholder.
        // Top-left alignment ensures the QR appears exactly where the user placed the placeholder.
        qrSide = Math.min(boxW, boxH);
        qrX = cx + qrBounds.left * scaleX;
        qrY = cy + qrBounds.top  * scaleY;
      } else {
        qrSide = Math.min(tileH - 20, 90);
        qrX    = cx + tileW - qrSide - 10;
        qrY    = cy + Math.floor((tileH - qrSide) / 2);
      }

      // Hard clamp — cannot overflow the tile
      qrX = Math.max(cx + 2, Math.min(qrX, cx + tileW - qrSide - 2));
      qrY = Math.max(cy + 2, Math.min(qrY, cy + tileH - qrSide - 2));

      try {
        // White padding for contrast against any background
        const logoPadH = (logoBuf && logoBuf.length > 0) ? Math.round((qrSide + 6) / LOGO_ASPECT) + 2 : 0;
        doc.save().fillColor('#FFFFFF')
          .rect(qrX - 3, qrY - 3, qrSide + 6, qrSide + 6 + logoPadH)
          .fill().restore();
        doc.image(qrBuffer, qrX, qrY, { width: qrSide, height: qrSide });
        // Powered-by logo immediately below QR
        if (logoBuf && logoBuf.length > 0) {
          const logoW = qrSide + 6;
          const logoH = Math.round(logoW / LOGO_ASPECT);
          doc.image(logoBuf, qrX - 3, qrY + qrSide + 2, { width: logoW, height: logoH });
        }
      } catch (e) {
        this.logger.warn(`Failed to draw QR for ticket ${ticket.id}: ${(e as Error).message}`);
      }
    }

    // ── 3. Serial number — only if a serial-placeholder was explicitly placed ─────
    if (serialBounds && serialBounds.width > 0 && serialBounds.height > 0) {
      const sx = cx + serialBounds.left * scaleX;
      const sy = cy + serialBounds.top  * scaleY;

      // Use the saved fontSize when available; fall back to height-based estimate.
      const fontSize = serialBounds.fontSize
        ? Math.max(7, Math.round(serialBounds.fontSize * scaleY))
        : Math.max(7, Math.round(serialBounds.height * scaleY * 0.65));

      // Use the saved fill color; validate hex format, default to black.
      const fillColor = serialBounds.fill && /^#[0-9a-fA-F]{3,6}$/.test(serialBounds.fill)
        ? serialBounds.fill
        : '#000000';

      const isBold = (serialBounds.fontWeight ?? 'bold') === 'bold';
      const pdfFont = isBold ? 'Courier-Bold' : 'Courier';

      // The saved width already has a 2.5× buffer (set in getSerialBounds on the frontend).
      // Also ensure it is never smaller than the text itself: estimate ~0.6 × fontSize per char.
      const minW = serial.length * fontSize * 0.62;
      const sw   = Math.max(minW, serialBounds.width * scaleX);

      doc.save()
        .fillColor(fillColor)
        .font(pdfFont)
        .fontSize(fontSize)
        .text(serial, sx, sy, { width: sw, lineBreak: false, ellipsis: false })
        .restore();
    }

    // ── 4. Holder name — only if a name-placeholder was placed AND ticket has a holder ──
    if (nameBounds && nameBounds.width > 0 && ticket.holderName) {
      const nx          = cx + nameBounds.left  * scaleX;
      const ny          = cy + nameBounds.top   * scaleY;
      const nw          = Math.max(30, nameBounds.width * scaleX);
      const pdfFontSize = Math.max(6, nameBounds.fontSize * scaleY);
      const pdfFont     = nameBounds.fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica';
      const fillColor   = /^#[0-9a-fA-F]{3,6}$/.test(nameBounds.fill) ? nameBounds.fill : '#000000';
      doc.save()
        .fillColor(fillColor)
        .font(pdfFont)
        .fontSize(pdfFontSize)
        .text(ticket.holderName, nx, ny, {
          width: nw,
          align: (nameBounds.textAlign as any) || 'left',
          lineBreak: false,
          ellipsis: true,
        })
        .restore();
    }

    // ── 5. Tile border ───────────────────────────────────────────────────────────
    doc.save()
      .roundedRect(cx, cy, tileW, tileH, 4)
      .strokeColor('rgba(0,0,0,0.25)')
      .lineWidth(0.6)
      .stroke()
      .restore();
  }

  // drawCutGuides removed — horizontal strip layout uses inline separator lines in generateGroupedTicketsPDF

  // ---------------------------------------------------------------------------
  // Grouped export shortcuts
  // ---------------------------------------------------------------------------

  /** Exporte tous les billets valides d'un événement groupés par 4 par page. */
  async generateGroupedEventTicketsPDF(eventId: string): Promise<Buffer> {
    return this.generateGroupedTicketsPDF(eventId);
  }

  /**
   * Exporte une sélection de billets groupés par 4 par page.
   * Utile pour ré-imprimer un sous-ensemble précis.
   */
  async generateGroupedSelectionPDF(
    eventId: string,
    ticketIds: string[],
  ): Promise<Buffer> {
    if (!ticketIds || ticketIds.length === 0) {
      throw new BadRequestException('Veuillez sélectionner au moins un billet');
    }
    return this.generateGroupedTicketsPDF(eventId, ticketIds);
  }
}
