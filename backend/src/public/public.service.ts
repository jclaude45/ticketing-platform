import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { Role } from '@prisma/client';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);
  private mailer: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketGeneration: TicketGenerationService,
    private readonly config: ConfigService,
  ) {
    const host = this.config.get<string>('email.host');
    const user = this.config.get<string>('email.user');
    if (host && user) {
      this.mailer = nodemailer.createTransport({
        host,
        port: this.config.get<number>('email.port') ?? 587,
        secure: this.config.get<boolean>('email.secure') ?? false,
        auth: { user, pass: this.config.get<string>('email.password') },
      });
    }
  }

  // ─── List published events ──────────────────────────────────────────────────

  async listEvents(page = 1, limit = 12, search?: string, city?: string) {
    const skip = (page - 1) * limit;
    const where: any = { status: 'PUBLISHED', AND: [] };

    if (search) {
      where.AND.push({
        OR: [
          { name:        { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { venue:       { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (city) {
      where.AND.push({ city: { contains: city, mode: 'insensitive' } });
    }
    if (where.AND.length === 0) delete where.AND;

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'asc' },
        select: {
          id: true, name: true, description: true,
          venue: true, city: true, country: true,
          startDate: true, endDate: true,
          bannerUrl: true, totalCapacity: true,
          organizer: { select: { firstName: true, lastName: true } },
          ticketTemplates: {
            select: { id: true, name: true, price: true, currency: true, availableCount: true },
            orderBy: { price: 'asc' },
          },
          _count: { select: { tickets: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events.map(e => this.formatEvent(e)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Single event ───────────────────────────────────────────────────────────

  async getEvent(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true,
        venue: true, address: true, city: true, country: true,
        startDate: true, endDate: true,
        bannerUrl: true, totalCapacity: true, status: true,
        organizer: { select: { firstName: true, lastName: true } },
        ticketTemplates: {
          select: {
            id: true, name: true, description: true,
            price: true, currency: true,
            quantity: true, availableCount: true,
            color: true,
          },
          orderBy: { price: 'asc' },
        },
        _count: { select: { tickets: true } },
      },
    });

    if (!event) throw new NotFoundException('Événement introuvable');
    if (event.status !== 'PUBLISHED') throw new NotFoundException('Cet événement n\'est pas disponible');

    return this.formatEvent(event);
  }

  // ─── Purchase ticket ────────────────────────────────────────────────────────

  async purchaseTicket(eventId: string, dto: PurchaseTicketDto) {
    if (!dto.items?.length) throw new BadRequestException('Veuillez sélectionner au moins un billet');

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, organizerId: true, status: true,
        startDate: true, endDate: true, city: true, venue: true,
        address: true, description: true, bannerUrl: true,
        organizer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (event.status !== 'PUBLISHED') throw new BadRequestException('Cet événement n\'accepte plus d\'inscriptions');

    // Load and validate all requested templates in one query
    const templateIds = dto.items.map(i => i.templateId);
    const templates = await this.prisma.ticketTemplate.findMany({
      where: { id: { in: templateIds }, eventId },
      select: { id: true, name: true, price: true, currency: true, availableCount: true },
    });

    if (templates.length !== templateIds.length) {
      throw new NotFoundException('Une ou plusieurs catégories de billets sont introuvables');
    }
    for (const item of dto.items) {
      const tpl = templates.find(t => t.id === item.templateId)!;
      if (tpl.availableCount < item.quantity) {
        throw new BadRequestException(
          `Seulement ${tpl.availableCount} place(s) restante(s) pour la catégorie "${tpl.name}"`,
        );
      }
    }

    // Generate tickets for each item sequentially (each call decrements availableCount)
    const holder = { holderName: dto.holderName, holderEmail: dto.holderEmail };
    const allTicketIds: string[] = [];

    for (const item of dto.items) {
      const result = await this.ticketGeneration.generateTickets(
        eventId,
        event.organizerId,
        Role.ORGANIZER,
        {
          templateId: item.templateId,
          holders: Array.from({ length: item.quantity }, () => holder),
        },
      );
      allTicketIds.push(...result.tickets.map((t: any) => t.id));
    }

    // Fetch all generated tickets with QR codes
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: allTicketIds } },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true,
        template: { select: { id: true, name: true, price: true, currency: true } },
      },
    });

    const currency = templates[0].currency;
    const total = dto.items.reduce((sum, item) => {
      const tpl = templates.find(t => t.id === item.templateId)!;
      return sum + Number(tpl.price) * item.quantity;
    }, 0);

    const ticketRows = tickets.map(t => ({
      ticketId:     t.id,
      serialNumber: t.serialNumber,
      templateName: t.template.name,
      price:        Number(t.template.price),
      currency:     t.template.currency,
      qrCode:       t.qrCode,
    }));

    this.sendConfirmationEmail(
      { holderName: dto.holderName, holderEmail: dto.holderEmail },
      event,
      ticketRows,
      total,
      currency,
      (event as any).bannerUrl,
      null,
      (event as any).organizer,
    ).catch(err => this.logger.warn(`Confirmation email failed: ${err.message}`));

    return {
      eventName:  event.name,
      holderName: dto.holderName,
      holderEmail: dto.holderEmail,
      tickets:    ticketRows,
      total,
      currency,
    };
  }

  // ─── Available cities ───────────────────────────────────────────────────────

  async getCities() {
    const rows = await this.prisma.event.findMany({
      where: { status: 'PUBLISHED' },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });
    return rows.map(r => r.city);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private formatEvent(e: any) {
    const appBase = this.config.get<string>('APP_BASE_URL') || '';
    const resolveBanner = (url: string | null) =>
      url ? url.replace(/^https?:\/\/localhost:\d+/, appBase) : null;

    const templates = (e.ticketTemplates ?? []).map((t: any) => ({
      ...t,
      price: Number(t.price),
    }));
    const minPrice = templates.length > 0 ? Math.min(...templates.map((t: any) => t.price)) : null;

    return {
      ...e,
      bannerUrl: resolveBanner(e.bannerUrl),
      ticketTemplates: templates,
      minPrice,
      soldOut: templates.every((t: any) => t.availableCount === 0),
    };
  }

  async sendConfirmationEmail(
    holder: { holderName: string; holderEmail: string },
    event: {
      id: string; name: string; startDate: Date; endDate: Date;
      city: string; venue: string;
      address?: string | null;
      description?: string | null;
    },
    tickets: { ticketId: string; serialNumber: string; templateName: string; price: number; currency: string; qrCode: string | null }[],
    total: number,
    currency: string,
    bannerUrl?: string | null,
    reference?: string | null,
    organizer?: { firstName: string; lastName: string; email?: string } | null,
  ) {
    if (!this.mailer) return;

    const from        = this.config.get<string>('email.from') || this.config.get<string>('email.user');
    const frontendUrl = this.config.get<string>('frontend.publicUrl') || 'https://zaya.live';
    const appBase     = this.config.get<string>('APP_BASE_URL') || frontendUrl;

    // Resolve banner URL to a publicly accessible absolute URL
    let resolvedBannerUrl: string | null = null;
    if (bannerUrl) {
      if (bannerUrl.startsWith('/')) {
        resolvedBannerUrl = `${appBase}${bannerUrl}`;
      } else {
        resolvedBannerUrl = bannerUrl.replace(/^https?:\/\/localhost(:\d+)?/, appBase);
      }
    }

    // Date formatting
    const startDate = new Date(event.startDate);
    const dateStr = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(startDate);
    const timeStr = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit',
    }).format(startDate);

    // Calendar links
    const encodeCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const eventEnd      = event.endDate ? new Date(event.endDate) : new Date(startDate.getTime() + 2 * 3600000);
    const calStart      = encodeCalDate(startDate);
    const calEnd        = encodeCalDate(eventEnd);
    const calTitle      = encodeURIComponent(event.name);
    const calLocation   = encodeURIComponent(`${event.venue}, ${event.city}`);
    const googleCalUrl  = `https://www.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&dates=${calStart}/${calEnd}&location=${calLocation}`;
    const outlookCalUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${calTitle}&startdt=${startDate.toISOString()}&enddt=${eventEnd.toISOString()}&location=${calLocation}`;

    // ICS attachment (Apple Calendar)
    const icsContent = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZAYA//Ticketing//FR',
      'BEGIN:VEVENT',
      `UID:${event.id}-${holder.holderEmail}@zaya.live`,
      `DTSTART:${calStart}`, `DTEND:${calEnd}`,
      `SUMMARY:${event.name}`,
      `LOCATION:${event.venue}\\, ${event.city}`,
      `DESCRIPTION:Billet ZAYA pour ${holder.holderName}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');

    // Strategy to stay under Gmail's 102KB clip threshold:
    // - PDFs are attached WITHOUT the QR code (text+design only, ~15KB)
    // - QR codes are attached as inline CID images (original PNG, ~8KB each)
    // - Total MIME: ~30-50KB regardless of ticket count
    const attachments: { filename: string; content: Buffer | string; cid?: string; contentType?: string }[] = [];
    attachments.push({ filename: 'evenement.ics', content: icsContent, contentType: 'text/calendar; method=REQUEST; charset=UTF-8' });

    const qrCids: { ticketId: string; serialNumber: string; cid: string }[] = [];
    for (const t of tickets) {
      // QR code as inline CID image (original PNG, tiny compared to PDF-decoded version)
      if (t.qrCode) {
        const match = t.qrCode.match(/^data:image\/png;base64,(.+)$/);
        if (match) {
          const cid = `qr-${t.ticketId}`;
          attachments.push({
            filename: `qr-${t.serialNumber}.png`,
            content: Buffer.from(match[1], 'base64'),
            cid,
            contentType: 'image/png',
          });
          qrCids.push({ ticketId: t.ticketId, serialNumber: t.serialNumber, cid });
        }
      }
      // PDF without QR code (PDFKit decodes PNG to raw pixels which balloons PDF size;
      // removing QR from PDF keeps it ~15KB vs ~100KB+ with QR)
      try {
        const pdfBuf = await this.buildTicketPdf(
          { ...t, qrCode: null },
          event,
          holder.holderName,
          bannerUrl,
        );
        attachments.push({ filename: `billet-${t.serialNumber}.pdf`, content: pdfBuf });
      } catch (err) {
        this.logger.warn(`PDF generation failed for ticket ${t.serialNumber}: ${err?.message}`);
      }
    }

    const uniqueCategories = [...new Set(tickets.map(t => t.templateName))];
    const categoryLine     = uniqueCategories.length === 1 ? uniqueCategories[0] : `${tickets.length} billets`;
    const organizerName    = organizer ? `${organizer.firstName} ${organizer.lastName}` : '';
    const organizerEmail   = organizer?.email ?? '';

    const ctaBtn = reference
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
           <tr><td style="background:#4f46e5;border-radius:8px;">
             <a href="${frontendUrl}/billetterie/payment/success?reference=${reference}"
                style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;font-family:Arial,sans-serif;">
               T&eacute;l&eacute;charger mes billets &rarr;
             </a>
           </td></tr>
         </table>`
      : '';

    await this.mailer.sendMail({
      from,
      to: holder.holderEmail,
      subject: `${event.name} — votre billet`,
      attachments,
      html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f1f1f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:28px 16px 40px;">

<table role="presentation" width="560" cellpadding="0" cellspacing="0"
       style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">

  ${resolvedBannerUrl
    ? `<tr><td style="line-height:0;font-size:0;">
         <img src="${resolvedBannerUrl}" width="560" alt="${event.name}"
              style="display:block;width:100%;height:auto;"/>
       </td></tr>`
    : `<tr><td style="background:#4f46e5;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`
  }

  <!-- Main content -->
  <tr><td style="padding:36px 40px 28px;">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#4f46e5;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.1em;">Billet confirm&eacute;</p>
    <h1 style="margin:0 0 18px;font-size:22px;font-weight:700;color:#111827;font-family:Arial,sans-serif;line-height:1.3;">${event.name}</h1>

    <!-- Date + Lieu -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="50%" style="padding-right:6px;vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid #f3f4f6;border-radius:8px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;font-family:Arial,sans-serif;">Date &amp; heure</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:Arial,sans-serif;">${dateStr}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;font-family:Arial,sans-serif;">${timeStr}</p>
            </td></tr>
          </table>
        </td>
        <td width="50%" style="vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid #f3f4f6;border-radius:8px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;font-family:Arial,sans-serif;">Lieu</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:Arial,sans-serif;">${event.venue}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;font-family:Arial,sans-serif;">${event.city}${event.address ? ` &middot; ${event.address}` : ''}</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;font-family:Arial,sans-serif;">${categoryLine}</p>

    ${ctaBtn}
  </td></tr>

  <!-- QR codes -->
  ${qrCids.length > 0 ? `
  <tr><td style="padding:0 40px 28px;">
    <p style="margin:0 0 14px;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">
      ${qrCids.length === 1 ? 'Votre billet' : 'Vos billets'} &mdash; pr&eacute;sentez ce QR code &agrave; l&apos;entr&eacute;e
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${qrCids.map(q => `
        <td style="text-align:center;padding-right:16px;vertical-align:top;">
          <img src="cid:${q.cid}" width="130" height="130" alt="QR billet"
               style="display:block;width:130px;height:130px;border-radius:8px;"/>
          <p style="margin:6px 0 0;font-size:10px;color:#9ca3af;font-family:Arial,sans-serif;letter-spacing:0.04em;">${q.serialNumber}</p>
        </td>`).join('')}
      </tr>
    </table>
  </td></tr>` : ''}

  <!-- Calendar links -->
  <tr><td style="padding:0 40px 28px;">
    <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">Ajouter &agrave; mon agenda</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:6px;">
          <a href="${googleCalUrl}" style="display:inline-block;padding:8px 14px;border:1px solid #e5e7eb;border-radius:6px;color:#374151;text-decoration:none;font-size:12px;font-family:Arial,sans-serif;">Google</a>
        </td>
        <td style="padding-right:6px;">
          <a href="${outlookCalUrl}" style="display:inline-block;padding:8px 14px;border:1px solid #e5e7eb;border-radius:6px;color:#374151;text-decoration:none;font-size:12px;font-family:Arial,sans-serif;">Outlook</a>
        </td>
        <td>
          <span style="display:inline-block;padding:8px 14px;border:1px solid #f3f4f6;border-radius:6px;color:#d1d5db;font-size:12px;font-family:Arial,sans-serif;">Apple (.ics joint)</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Thin divider -->
  <tr><td style="padding:0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-top:1px solid #f3f4f6;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td></tr>

  <!-- Organisateur + Acheteur -->
  <tr><td style="padding:20px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${organizerName ? `<td style="width:50%;vertical-align:top;padding-right:16px;">
          <p style="margin:0 0 3px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#d1d5db;font-family:Arial,sans-serif;">Organisateur</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">${organizerName}</p>
          ${organizerEmail ? `<p style="margin:2px 0 0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">${organizerEmail}</p>` : ''}
        </td>` : ''}
        <td style="vertical-align:top;">
          <p style="margin:0 0 3px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#d1d5db;font-family:Arial,sans-serif;">Acheteur</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">${holder.holderName}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">${holder.holderEmail}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" style="background:#4f46e5;padding:18px 40px;">
    <a href="https://zaya.live" style="text-decoration:none;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;letter-spacing:0.08em;">ZAYA</p>
    </a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
    });
  }

  async buildTicketPdf(
    ticket: { serialNumber: string; templateName: string; price: number; currency: string; qrCode: string | null },
    event: { name: string; startDate: Date; endDate?: Date | null; city: string; venue: string },
    holderName: string,
    bannerUrl?: string | null,
  ): Promise<Buffer> {
    let bannerBuffer: Buffer | null = null;
    if (bannerUrl) {
      try {
        const appBase = this.config.get<string>('APP_BASE_URL') || '';
        let rel: string | null = null;
        if (appBase && bannerUrl.startsWith(appBase)) {
          rel = bannerUrl.slice(appBase.length);
        } else if (/^https?:\/\/localhost:\d+/.test(bannerUrl)) {
          rel = bannerUrl.replace(/^https?:\/\/localhost:\d+/, '');
        }
        if (rel) {
          const localPath = path.join(process.cwd(), 'public', rel);
          if (fs.existsSync(localPath)) bannerBuffer = fs.readFileSync(localPath);
        }
      } catch (_) { /* ignore */ }
    }

    return new Promise((resolve, reject) => {
      const W = 360;
      const H = 500;
      const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `Billet — ${event.name}`, Author: 'ZAYA' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PAD   = 22;
      const PERF  = 262;      // Y of perforation line
      const IMG   = 88;       // thumbnail size
      const startDate = new Date(event.startDate);

      const dateLabel = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric',
      }).format(startDate);
      const timeLabel = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short', hour: '2-digit', minute: '2-digit',
      }).format(startDate);

      // ── Background ────────────────────────────────────────────────────────
      doc.fillColor('#ffffff').rect(0, 0, W, H).fill();

      // ── Event thumbnail (top-left) ────────────────────────────────────────
      let imgDrawn = false;
      if (bannerBuffer) {
        doc.save();
        try {
          doc.roundedRect(PAD, PAD, IMG, IMG, 8).clip();
          doc.image(bannerBuffer, PAD, PAD, { cover: [IMG, IMG] });
          imgDrawn = true;
        } catch (_) { /* fall through to placeholder */ }
        doc.restore(); // always balance save/restore
      }
      if (!imgDrawn) {
        doc.fillColor('#e5e7eb').roundedRect(PAD, PAD, IMG, IMG, 8).fill();
        doc.fillColor('#a5b4fc').fontSize(28).font('Helvetica-Bold')
          .text('Z', PAD, PAD + 26, { width: IMG, align: 'center' });
      }

      // ── Event name + holder (right of thumbnail) ──────────────────────────
      const TX = PAD + IMG + 16;
      const TW = W - TX - PAD;

      doc.fillColor('#111111').fontSize(16).font('Helvetica-Bold')
        .text(event.name, TX, PAD, { width: TW, lineGap: 2, height: 42, ellipsis: true });

      doc.fillColor('#999999').fontSize(8).font('Helvetica')
        .text('Member Name', TX, 76, { characterSpacing: 0.5 });
      doc.fillColor('#222222').fontSize(11).font('Helvetica-Bold')
        .text(holderName, TX, 89, { width: TW });

      // ── Info grid ─────────────────────────────────────────────────────────
      const GY   = PAD + IMG + 20;   // y ≈ 130
      const GCW  = (W - PAD * 2) / 2; // column width ≈ 158

      // Thin separator before grid
      doc.strokeColor('#e5e7eb').lineWidth(0.5)
        .moveTo(PAD, GY - 8).lineTo(W - PAD, GY - 8).stroke();

      // Row 1 — Date | Time
      doc.fillColor('#999999').fontSize(8).font('Helvetica')
        .text('Date', PAD, GY, { characterSpacing: 0.4 });
      doc.fillColor('#999999').fontSize(8).font('Helvetica')
        .text('Time', PAD + GCW, GY, { characterSpacing: 0.4 });
      doc.fillColor('#111111').fontSize(11).font('Helvetica-Bold')
        .text(dateLabel, PAD, GY + 13, { width: GCW - 8 });
      doc.fillColor('#111111').fontSize(11).font('Helvetica-Bold')
        .text(timeLabel, PAD + GCW, GY + 13, { width: GCW - 8 });

      // Row 2 — Category | Venue
      const GY2 = GY + 48;
      doc.fillColor('#999999').fontSize(8).font('Helvetica')
        .text('Admit', PAD, GY2, { characterSpacing: 0.4 });
      doc.fillColor('#999999').fontSize(8).font('Helvetica')
        .text('Venue', PAD + GCW, GY2, { characterSpacing: 0.4 });
      doc.fillColor('#111111').fontSize(11).font('Helvetica-Bold')
        .text(ticket.templateName, PAD, GY2 + 13, { width: GCW - 8 });
      doc.fillColor('#111111').fontSize(11).font('Helvetica-Bold')
        .text(`${event.venue}, ${event.city}`, PAD + GCW, GY2 + 13, { width: GCW - 8, lineGap: 1 });

      // ── Perforation ───────────────────────────────────────────────────────
      // Half-circle notches
      doc.fillColor('#f0f0f0').circle(0, PERF, 13).fill();
      doc.fillColor('#f0f0f0').circle(W, PERF, 13).fill();
      // Dashed line
      doc.strokeColor('#cccccc').lineWidth(1)
        .dash(5, { space: 4 })
        .moveTo(18, PERF).lineTo(W - 18, PERF)
        .stroke().undash();

      // ── Bottom section (QR) ───────────────────────────────────────────────
      doc.fillColor('#f7f7f7').rect(0, PERF + 1, W, H - PERF - 1).fill();

      const QR  = 162;
      const QRX = (W - QR) / 2;
      const QRY = PERF + 28;

      if (ticket.qrCode) {
        const match = ticket.qrCode.match(/^data:image\/png;base64,(.+)$/);
        if (match) {
          try {
            doc.image(Buffer.from(match[1], 'base64'), QRX, QRY, { width: QR, height: QR });
          } catch (_) { /* skip */ }
        }
      }

      doc.fillColor('#333333').fontSize(9).font('Helvetica-Bold')
        .text(`BOOKING ID  -  ${ticket.serialNumber}`, 0, QRY + QR + 14, {
          width: W, align: 'center', characterSpacing: 0.8,
        });

      doc.end();
    });
  }
}
