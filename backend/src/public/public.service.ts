import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { Role } from '@prisma/client';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';

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
      select: { id: true, name: true, organizerId: true, status: true, startDate: true, endDate: true, city: true, venue: true },
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

    this.sendConfirmationEmail(dto, event, ticketRows, total, currency).catch(err =>
      this.logger.warn(`Confirmation email failed: ${err.message}`),
    );

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

  private async sendConfirmationEmail(
    dto: PurchaseTicketDto,
    event: { id: string; name: string; startDate: Date; endDate: Date; city: string; venue: string },
    tickets: { ticketId: string; serialNumber: string; templateName: string; price: number; currency: string; qrCode: string | null }[],
    total: number,
    currency: string,
  ) {
    if (!this.mailer) return;

    const from = this.config.get<string>('email.from') || this.config.get<string>('email.user');
    const totalLabel = total === 0 ? 'Gratuit' : `${total.toFixed(2)} ${currency}`;

    const dateStr = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(event.startDate));

    // Build CID attachments (QR images) + PDF attachment per ticket
    const attachments: { filename: string; content: Buffer; cid?: string }[] = [];
    for (const t of tickets) {
      if (t.qrCode) {
        const match = t.qrCode.match(/^data:image\/png;base64,(.+)$/);
        if (match) {
          attachments.push({
            filename: `qr-${t.serialNumber}.png`,
            content: Buffer.from(match[1], 'base64'),
            cid: `qr_${t.ticketId}`,
          });
        }
      }
      // Generate PDF ticket and attach it
      try {
        const pdfBuf = await this.buildTicketPdf(t, event, dto.holderName);
        attachments.push({
          filename: `billet-${t.serialNumber}.pdf`,
          content: pdfBuf,
        });
      } catch (err) {
        this.logger.warn(`PDF generation failed for ticket ${t.serialNumber}: ${err?.message}`);
      }
    }

    // Build one visual ticket card per ticket
    const ticketCards = tickets.map(t => {
      const priceLabel = t.price === 0 ? 'Gratuit' : `${t.price.toFixed(2)} ${t.currency}`;
      const qrBlock = attachments.find(a => a.cid === `qr_${t.ticketId}`)
        ? `<img src="cid:qr_${t.ticketId}" width="120" height="120" alt="QR" style="display:block;border-radius:6px;border:4px solid #ffffff;"/>`
        : `<p style="font-family:'Courier New',monospace;font-size:9px;color:#6366f1;word-break:break-all;">${t.serialNumber}</p>`;

      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin-bottom:20px;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(79,70,229,0.18);">
        <!-- Header gradient -->
        <tr>
          <td colspan="2" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:18px 20px 14px;">
            <p style="margin:0 0 2px;color:rgba(255,255,255,0.65);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;font-family:Arial,sans-serif;">Billet d'entrée</p>
            <h2 style="margin:0 0 8px;color:#ffffff;font-size:17px;font-weight:700;font-family:Arial,sans-serif;">${event.name}</h2>
            <p style="margin:0 0 3px;color:rgba(255,255,255,0.82);font-size:12px;font-family:Arial,sans-serif;">&#128197; ${dateStr}</p>
            <p style="margin:0;color:rgba(255,255,255,0.82);font-size:12px;font-family:Arial,sans-serif;">&#128205; ${event.venue}, ${event.city}</p>
          </td>
        </tr>
        <!-- Dashed perforation -->
        <tr>
          <td colspan="2" style="background:#5b50e8;padding:0 20px;">
            <div style="border-top:2px dashed rgba(255,255,255,0.35);height:0;font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>
        <!-- Stub: details + QR -->
        <tr>
          <td style="background:#ffffff;padding:18px 16px 18px 20px;vertical-align:top;">
            <p style="margin:0 0 2px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;font-family:Arial,sans-serif;">Catégorie</p>
            <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e1b4b;font-family:Arial,sans-serif;">${t.templateName}</p>
            <p style="margin:0 0 2px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;font-family:Arial,sans-serif;">Titulaire</p>
            <p style="margin:0 0 12px;font-size:13px;font-weight:500;color:#374151;font-family:Arial,sans-serif;">${dto.holderName}</p>
            <p style="margin:0 0 2px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;font-family:Arial,sans-serif;">N° de billet</p>
            <p style="margin:0 0 12px;font-family:'Courier New',monospace;font-size:12px;font-weight:700;color:#4f46e5;letter-spacing:0.04em;">${t.serialNumber}</p>
            <p style="margin:0 0 2px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;font-family:Arial,sans-serif;">Prix</p>
            <p style="margin:0;font-size:13px;font-weight:600;color:#374151;font-family:Arial,sans-serif;">${priceLabel}</p>
          </td>
          <!-- QR code -->
          <td style="background:#ffffff;padding:18px 20px 18px 0;vertical-align:middle;text-align:center;border-left:2px dashed #e0e7ff;width:150px;">
            ${qrBlock}
            <p style="margin:6px 0 0;font-size:9px;color:#9ca3af;font-family:Arial,sans-serif;">Scanner à l'entrée</p>
          </td>
        </tr>
        <!-- Footer stripe -->
        <tr>
          <td colspan="2" style="background:#f5f3ff;padding:8px 20px;border-top:1px solid #e0e7ff;">
            <p style="margin:0;font-size:10px;color:#a5b4fc;font-family:Arial,sans-serif;text-align:center;letter-spacing:0.05em;">ZAYA — Plateforme de billetterie</p>
          </td>
        </tr>
      </table>`;
    }).join('');

    // Summary rows
    const summaryRows = tickets.map(t => {
      const p = t.price === 0 ? 'Gratuit' : `${t.price.toFixed(2)} ${t.currency}`;
      return `<tr>
        <td style="padding:9px 14px;font-size:12px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;">${t.templateName}</td>
        <td style="padding:9px 14px;font-family:'Courier New',monospace;font-size:12px;color:#1e1b4b;border-bottom:1px solid #e5e7eb;">${t.serialNumber}</td>
        <td style="padding:9px 14px;font-size:12px;color:#374151;text-align:right;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;">${p}</td>
      </tr>`;
    }).join('');

    await this.mailer.sendMail({
      from,
      to: dto.holderEmail,
      subject: `🎟️ Vos billets — ${event.name}`,
      attachments,
      html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Vos billets — ${event.name}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f0f5">
  <tr><td align="center" style="padding:24px 16px 40px;">

    <!-- Wrapper card -->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
           style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.07);max-width:600px;">

      <!-- Top banner -->
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 32px 24px;">
          <img src="https://zaya.live/email-logo.png" width="52" height="52" alt="ZAYA" style="display:block;margin:0 auto 14px;border-radius:12px;border:2px solid rgba(255,255,255,0.25);" />
          <h1 style="margin:0 0 6px;color:#ffffff;font-size:22px;font-weight:700;">&#10003; Inscription confirmée</h1>
          <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;">${event.name}</p>
        </td>
      </tr>

      <!-- Body -->
      <tr><td style="padding:28px 32px;">

        <p style="margin:0 0 6px;font-size:15px;color:#374151;">Bonjour <strong>${dto.holderName}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
          Votre commande est confirmée. Vos billets sont disponibles ci-dessous — présentez le QR code de chaque billet à l'entrée de l'événement.
        </p>

        <!-- Ticket cards -->
        ${ticketCards}

        <!-- Summary table -->
        <p style="margin:24px 0 10px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.06em;">Récapitulatif</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#f8f8ff;border-radius:10px;overflow:hidden;border:1px solid #e0e7ff;">
          <tr style="background:#eef2ff;">
            <th style="padding:7px 14px;font-size:10px;color:#6366f1;text-align:left;text-transform:uppercase;letter-spacing:0.07em;">Catégorie</th>
            <th style="padding:7px 14px;font-size:10px;color:#6366f1;text-align:left;text-transform:uppercase;letter-spacing:0.07em;">Numéro</th>
            <th style="padding:7px 14px;font-size:10px;color:#6366f1;text-align:right;text-transform:uppercase;letter-spacing:0.07em;">Prix</th>
          </tr>
          ${summaryRows}
          <tr style="background:#eef2ff;">
            <td colspan="2" style="padding:9px 14px;font-size:13px;font-weight:700;color:#374151;font-family:Arial,sans-serif;">Total</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:700;color:#4f46e5;text-align:right;font-family:Arial,sans-serif;">${totalLabel}</td>
          </tr>
        </table>

        <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
          Vous pouvez également télécharger vos billets en PDF depuis la page de confirmation sur notre plateforme.
        </p>

      </td></tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif;">Propulsé par <strong>ZAYA</strong></p>
        </td>
      </tr>
    </table>

  </td></tr>
</table>
</body>
</html>`,
    });
  }

  private buildTicketPdf(
    ticket: { serialNumber: string; templateName: string; price: number; currency: string; qrCode: string | null },
    event: { name: string; startDate: Date; city: string; venue: string },
    holderName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [300, 480], margin: 0, info: { Title: `Billet — ${event.name}`, Author: 'ZAYA' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 300;
      const headerH = 195;
      const priceLabel = ticket.price === 0 ? 'Gratuit' : `${ticket.price.toFixed(2)} ${ticket.currency}`;
      const dateStr = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      }).format(new Date(event.startDate));

      // ── Header (purple gradient) ──────────────────────────────────────────
      const grad = doc.linearGradient(0, 0, W, headerH);
      grad.stop(0, '#4f46e5').stop(1, '#7c3aed');
      doc.rect(0, 0, W, headerH).fill(grad);

      doc.fillColor('rgba(255,255,255,0.55)').fontSize(7.5).font('Helvetica')
        .text("BILLET D'ENTREE", 20, 18, { width: W - 40, characterSpacing: 1.5 });

      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
        .text(event.name, 20, 33, { width: W - 40 });

      const nameBottom = doc.y + 6;
      doc.fillColor('rgba(255,255,255,0.75)').fontSize(9.5).font('Helvetica')
        .text(dateStr, 20, nameBottom, { width: W - 40 });
      doc.text(`${event.venue}, ${event.city}`, 20, doc.y + 2, { width: W - 40 });

      // Category + price chips
      const chipY = headerH - 38;
      doc.fillColor('rgba(255,255,255,0.18)').roundedRect(20, chipY, 130, 20, 10).fill();
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text(ticket.templateName, 28, chipY + 5, { width: 114 });

      doc.fillColor('rgba(255,255,255,0.18)').roundedRect(W - 90, chipY, 70, 20, 10).fill();
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text(priceLabel, W - 84, chipY + 5, { width: 58, align: 'right' });

      // ── Perforation ───────────────────────────────────────────────────────
      doc.fillColor('#5b50e8').rect(0, headerH, W, 3).fill();
      doc.strokeColor('rgba(255,255,255,0.45)').lineWidth(0.8)
        .dash(4, { space: 3 })
        .moveTo(18, headerH + 1.5).lineTo(W - 18, headerH + 1.5).stroke().undash();

      // ── Stub (white) ─────────────────────────────────────────────────────
      doc.fillColor('#ffffff').rect(0, headerH + 3, W, 255).fill();

      // QR code image
      const stubTop = headerH + 18;
      if (ticket.qrCode) {
        const match = ticket.qrCode.match(/^data:image\/png;base64,(.+)$/);
        if (match) {
          try {
            doc.image(Buffer.from(match[1], 'base64'), 16, stubTop, { width: 118, height: 118 });
          } catch (_) { /* skip if image fails */ }
        }
      }
      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
        .text("Scanner a l'entree", 16, stubTop + 122, { width: 118, align: 'center' });

      // Vertical separator
      doc.strokeColor('#e0e7ff').lineWidth(1)
        .dash(3, { space: 3 })
        .moveTo(148, stubTop - 4).lineTo(148, stubTop + 148).stroke().undash();

      // Details: holder, serial, category
      const dx = 158;
      let dy = stubTop;

      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica').text('TITULAIRE', dx, dy, { characterSpacing: 0.8 });
      dy += 11;
      doc.fillColor('#1e1b4b').fontSize(11).font('Helvetica-Bold').text(holderName, dx, dy, { width: W - dx - 14 });
      dy = doc.y + 12;

      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica').text('N° DE BILLET', dx, dy, { characterSpacing: 0.8 });
      dy += 11;
      doc.fillColor('#4f46e5').fontSize(8.5).font('Courier-Bold').text(ticket.serialNumber, dx, dy, { width: W - dx - 14 });
      dy = doc.y + 12;

      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica').text('CATEGORIE', dx, dy, { characterSpacing: 0.8 });
      dy += 11;
      doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold').text(ticket.templateName, dx, dy, { width: W - dx - 14 });
      dy = doc.y + 12;

      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica').text('PRIX', dx, dy, { characterSpacing: 0.8 });
      dy += 11;
      doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold').text(priceLabel, dx, dy);

      // ── Footer ────────────────────────────────────────────────────────────
      const footerY = 453;
      doc.fillColor('#f5f3ff').rect(0, footerY, W, 27).fill();
      doc.fillColor('#a5b4fc').fontSize(8).font('Helvetica')
        .text('ZAYA — Plateforme de billetterie', 0, footerY + 9, { width: W, align: 'center' });

      doc.end();
    });
  }
}
