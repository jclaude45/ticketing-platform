import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { Role, EventType } from '@prisma/client';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { ContactDto } from './dto/contact.dto';
import { tariffLabel } from '../tickets/event-days';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';

/** The "Z" of the ZAYA logo, copied from frontend/public/zaya-logo.svg. */
const ZAYA_LOGO_Z_PATH =
  'M751.532 248.66L700.694 399.422L700.579 399.762H508.587L751.413 644.335L751.559 644.481V752.123H643.915' +
  'L643.769 751.976L494.269 601.812L450.015 751.765L449.909 752.123H249L249.213 751.469L298.298 600.707' +
  'L298.41 600.361H492.824L249.334 355.788L249.089 355.542L249.234 355.227L298.319 248.291L298.453 248' +
  'H751.755L751.532 248.66Z';

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

  async listEvents(page = 1, limit = 12, search?: string, city?: string, type?: string) {
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
    if (type && (Object.values(EventType) as string[]).includes(type)) {
      where.AND.push({ type });
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
          venue: true, city: true, country: true, type: true,
          startDate: true, endDate: true,
          bannerUrl: true, totalCapacity: true,
          organizer: { select: { firstName: true, lastName: true } },
          ticketTemplates: {
            select: { id: true, name: true, price: true, currency: true, availableCount: true, validDays: true },
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
        venue: true, address: true, city: true, country: true, type: true,
        startDate: true, endDate: true,
        bannerUrl: true, totalCapacity: true, status: true,
        organizer: { select: { firstName: true, lastName: true, avatar: true } },
        ticketTemplates: {
          select: {
            id: true, name: true, description: true,
            price: true, currency: true,
            quantity: true, availableCount: true,
            color: true, validDays: true,
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
    if (new Set(templateIds).size !== templateIds.length) {
      throw new BadRequestException('Chaque catégorie de billet ne doit apparaître qu\'une fois');
    }
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

    // This endpoint issues tickets without payment: free categories only.
    // Paid tickets must go through initiate-payment.
    if (templates.some(t => Number(t.price) > 0)) {
      throw new BadRequestException('Ces billets sont payants : utilisez le paiement en ligne');
    }

    await this.ticketGeneration.assertCanSell(event.organizerId, dto.items.reduce((n, i) => n + i.quantity, 0));

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
        { source: 'ONLINE' },
      );
      allTicketIds.push(...result.tickets.map((t: any) => t.id));
    }

    // Fetch all generated tickets with QR codes
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: allTicketIds } },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true,
        template: { select: { id: true, name: true, price: true, currency: true, validDays: true } },
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
      templateName: tariffLabel(t.template.name, t.template.validDays),
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

  // ─── Subscription plans (landing page pricing) ──────────────────────────────

  async getPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
      select: {
        id: true, name: true, description: true, price: true,
        maxTickets: true, maxBadges: true, maxEvents: true,
        showPoweredBy: true, allowBulkExport: true, allowCommunication: true,
      },
    });
    return plans;
  }

  // ─── Contact form ("Parle-nous") ────────────────────────────────────────────

  /** Messages per visitor address over the last 10 minutes */
  private readonly contactHits = new Map<string, number[]>();

  async sendContact(dto: ContactDto, ip?: string) {
    // Bots fill the hidden field: pretend it worked
    if (dto.website) return { sent: true };

    const now = Date.now();
    const key = ip || 'unknown';
    const recent = (this.contactHits.get(key) ?? []).filter(t => now - t < 10 * 60_000);
    if (recent.length >= 3) {
      throw new BadRequestException('Trop de messages envoyés. Réessayez dans quelques minutes.');
    }
    this.contactHits.set(key, [...recent, now]);
    if (this.contactHits.size > 5000) this.contactHits.clear();

    // CONTACT_EMAIL when set, else every super admin
    const configured = this.config.get<string>('CONTACT_EMAIL');
    const recipients = configured
      ? configured.split(',').map(e => e.trim()).filter(Boolean)
      : (await this.prisma.user.findMany({
          where: { role: Role.SUPER_ADMIN, isActive: true },
          select: { email: true },
        })).map(u => u.email);

    if (!this.mailer || recipients.length === 0) {
      this.logger.warn(`Contact message from ${dto.email} not delivered: no mailer or recipient`);
      throw new BadRequestException("L'envoi est momentanément indisponible. Écrivez-nous par email.");
    }

    const esc = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rows: [string, string | undefined][] = [
      ['Nom', `${dto.firstName} ${dto.lastName}`],
      ['Email', dto.email],
      ['Entreprise', dto.company],
      ['Pays', dto.country],
      ['Profil', dto.profile],
      ['Mises à jour ZAYA', dto.newsletter ? 'Oui' : 'Non'],
    ];

    await this.mailer.sendMail({
      from: this.config.get<string>('email.from') || this.config.get<string>('email.user'),
      to: recipients,
      replyTo: dto.email,
      subject: `Contact zaya.live — ${dto.firstName} ${dto.lastName}${dto.profile ? ` (${dto.profile})` : ''}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
  <h2 style="margin:0 0 16px">Nouveau message depuis le formulaire « Parle-nous »</h2>
  <table cellpadding="6" style="border-collapse:collapse">
    ${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="color:#666">${k}</td><td><strong>${esc(v!)}</strong></td></tr>`).join('')}
  </table>
  <p style="margin:16px 0 4px;color:#666">Message :</p>
  <p style="white-space:pre-wrap;margin:0">${esc(dto.message)}</p>
</div>`,
    });
    return { sent: true };
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
      ...(e.organizer && { organizer: { ...e.organizer, avatar: resolveBanner(e.organizer.avatar ?? null) } }),
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
    invitation?: { message?: string | null } | null,
  ): Promise<boolean> {
    if (!this.mailer) return false;

    const from        = this.config.get<string>('email.from') || this.config.get<string>('email.user');
    const frontendUrl = this.config.get<string>('frontend.publicUrl') || 'https://zaya.live';
    const appBase     = this.config.get<string>('APP_BASE_URL') || frontendUrl;

    // Banner: banners are often stored as base64 data URIs, which Gmail blocks and which
    // push the HTML past its 102KB clip limit. Send the image as a downscaled CID attachment
    // (attachments don't count toward the clip limit); fall back to a public URL otherwise.
    let bannerSrc: string | null = null;
    let bannerAttachment: { filename: string; content: Buffer; cid: string; contentType: string } | null = null;
    const bannerSource = this.readBannerSource(bannerUrl);
    if (bannerSource) {
      try {
        const content = await sharp(bannerSource)
          .resize({ width: 1120, withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();
        bannerAttachment = { filename: 'banniere.jpg', content, cid: 'event-banner', contentType: 'image/jpeg' };
        bannerSrc = 'cid:event-banner';
      } catch (err) {
        this.logger.warn(`Email banner failed: ${err?.message}`);
      }
    }
    if (!bannerSrc && bannerUrl && !bannerUrl.startsWith('data:')) {
      bannerSrc = bannerUrl.startsWith('/')
        ? `${appBase}${bannerUrl}`
        : bannerUrl.replace(/^https?:\/\/localhost(:\d+)?/, appBase);
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

    // The QR code lives only in the PDF, drawn as vector shapes (no embedded PNG),
    // which keeps each attachment around 15-20KB and the email under Gmail's clip threshold.
    const attachments: { filename: string; content: Buffer | string; cid?: string; contentType?: string }[] = [];
    attachments.push({ filename: 'evenement.ics', content: icsContent, contentType: 'text/calendar; method=REQUEST; charset=UTF-8' });
    if (bannerAttachment) attachments.push(bannerAttachment);

    for (const t of tickets) {
      try {
        const pdfBuf = await this.buildTicketPdf({ ...t, isInvitation: !!invitation }, event, holder.holderName, bannerUrl, {
          holderEmail: holder.holderEmail,
          purchasedAt: new Date(),
          organizer,
        });
        attachments.push({ filename: `billet-${t.serialNumber}.pdf`, content: pdfBuf });
      } catch (err) {
        this.logger.warn(`PDF generation failed for ticket ${t.serialNumber}: ${err?.message}`);
      }
    }

    const uniqueCategories = [...new Set(tickets.map(t => t.templateName))];
    const categoryLine     = uniqueCategories.length === 1 ? uniqueCategories[0] : `${tickets.length} billets`;
    const organizerName    = organizer ? `${organizer.firstName} ${organizer.lastName}` : '';
    const escapeHtml = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const invitationIntro = invitation
      ? `<p style="margin:0 0 18px;font-size:15px;color:#374151;font-family:Arial,sans-serif;line-height:1.5;">
           ${organizerName ? `<strong>${escapeHtml(organizerName)}</strong> vous invite` : 'Vous &ecirc;tes invit&eacute;(e)'} &agrave; cet &eacute;v&eacute;nement.
         </p>
         ${invitation.message?.trim()
           ? `<p style="margin:0 0 18px;padding:12px 16px;border-left:3px solid #4f46e5;background:#f5f3ff;font-size:14px;color:#374151;font-family:Arial,sans-serif;line-height:1.5;white-space:pre-line;">${escapeHtml(invitation.message.trim())}</p>`
           : ''}`
      : '';
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
      subject: invitation ? `Invitation — ${event.name}` : `${event.name} — votre billet`,
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

  ${bannerSrc
    ? `<tr><td style="line-height:0;font-size:0;">
         <img src="${bannerSrc}" width="560" alt="${event.name}"
              style="display:block;width:100%;height:auto;"/>
       </td></tr>`
    : `<tr><td style="background:#4f46e5;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`
  }

  <!-- Main content -->
  <tr><td style="padding:36px 40px 28px;">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#4f46e5;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.1em;">${invitation ? 'Invitation' : 'Billet confirm&eacute;'}</p>
    <h1 style="margin:0 0 18px;font-size:22px;font-weight:700;color:#111827;font-family:Arial,sans-serif;line-height:1.3;">${event.name}</h1>
    ${invitationIntro}

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

    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;font-family:Arial,sans-serif;">${invitation ? `Invitation &middot; ${categoryLine}` : categoryLine}</p>

    ${ctaBtn}
  </td></tr>

  <!-- Ticket reminder -->
  <tr><td style="padding:0 40px 28px;">
    <p style="margin:0;font-size:13px;color:#374151;font-family:Arial,sans-serif;line-height:1.5;">
      ${tickets.length === 1 ? 'Votre billet est joint' : 'Vos billets sont joints'} &agrave; cet email au format PDF.
      Pr&eacute;sentez le QR code &agrave; l&apos;entr&eacute;e, sur votre t&eacute;l&eacute;phone ou imprim&eacute;.
    </p>
  </td></tr>

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
          <p style="margin:0 0 3px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#d1d5db;font-family:Arial,sans-serif;">${invitation ? 'Invit&eacute;(e)' : 'Acheteur'}</p>
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
    return true;
  }

  /** Raw banner bytes from a base64 data URI or a file under public/, or null. */
  private readBannerSource(bannerUrl?: string | null): Buffer | null {
    if (!bannerUrl) return null;
    try {
      const dataMatch = bannerUrl.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
      if (dataMatch) return Buffer.from(dataMatch[1], 'base64');

      const appBase = this.config.get<string>('APP_BASE_URL') || '';
      let rel: string | null = null;
      if (bannerUrl.startsWith('/')) {
        rel = bannerUrl;
      } else if (appBase && bannerUrl.startsWith(appBase)) {
        rel = bannerUrl.slice(appBase.length);
      } else if (/^https?:\/\/localhost:\d+/.test(bannerUrl)) {
        rel = bannerUrl.replace(/^https?:\/\/localhost:\d+/, '');
      }
      if (rel) {
        const localPath = path.join(process.cwd(), 'public', rel);
        if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
      }
    } catch (err) {
      this.logger.warn(`Banner read failed: ${err?.message}`);
    }
    return null;
  }

  async buildTicketPdf(
    ticket: { ticketId?: string; isInvitation?: boolean; serialNumber: string; templateName: string; price: number; currency: string; qrCode: string | null },
    event: { name: string; startDate: Date; endDate?: Date | null; city: string; venue: string; address?: string | null },
    holderName: string,
    bannerUrl?: string | null,
    extra?: {
      holderEmail?: string | null;
      purchasedAt?: Date | null;
      organizer?: { firstName: string; lastName: string; email?: string | null } | null;
    },
  ): Promise<Buffer> {
    // QR drawn as vector modules (a few KB) instead of an embedded PNG, which
    // PDFKit decodes to raw pixels (~100KB) and pushes the email past Gmail's clip limit.
    // Content must match QrcodeService.generateSignedQRCode (V2 compact format).
    let qrModules: { size: number; data: Uint8Array } | null = null;
    if (ticket.ticketId) {
      const qrContent = JSON.stringify({ id: ticket.ticketId, sn: ticket.serialNumber, v: '2' });
      qrModules = QRCode.create(qrContent, { errorCorrectionLevel: 'M' }).modules;
    }

    // Event thumbnail, downscaled (~10KB) so the PDF stays light
    let thumbBuffer: Buffer | null = null;
    const bannerSource = this.readBannerSource(bannerUrl);
    if (bannerSource) {
      try {
        thumbBuffer = await sharp(bannerSource)
          .resize(240, 240, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (err) {
        this.logger.warn(`Ticket thumbnail failed: ${err?.message}`);
      }
    }

    return new Promise((resolve, reject) => {
      const W = 595.28;   // A4
      const M = 56;       // page margin
      const CW = W - M * 2;
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Billet — ${event.name}`, Author: 'ZAYA' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const startDate = new Date(event.startDate);
      const fmtDate = (d: Date) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
      const fmtTime = (d: Date) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);

      // ── Logo (same mark as frontend/public/zaya-logo.svg, 1000×1000 viewBox) ──
      const LOGO = 40;
      const LOGO_Y = 50;
      doc.fillColor('#5C37FF').roundedRect(M, LOGO_Y, LOGO, LOGO, 9).fill();
      doc.save();
      doc.translate(M, LOGO_Y).scale(LOGO / 1000);
      doc.path(ZAYA_LOGO_Z_PATH).fill('#FEFFFF');
      doc.restore();
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(22)
        .text('ZAYA', M + LOGO + 12, LOGO_Y + 10, { lineBreak: false });
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(11)
        .text('www.zaya.live', M, LOGO_Y + 56, { lineBreak: false });

      // ── QR code (top-right, vector) ───────────────────────────────────────
      const QR = 120;
      const QRX = W - M - QR;
      const QRY = 140;
      if (qrModules) {
        const cell = QR / qrModules.size;
        for (let row = 0; row < qrModules.size; row++) {
          for (let col = 0; col < qrModules.size; col++) {
            if (qrModules.data[row * qrModules.size + col]) {
              // Slight overlap avoids hairline gaps between modules in some viewers
              doc.rect(QRX + col * cell, QRY + row * cell, cell + 0.05, cell + 0.05);
            }
          }
        }
        doc.fillColor('#000000').fill();
      } else if (ticket.qrCode) {
        const match = ticket.qrCode.match(/^data:image\/png;base64,(.+)$/);
        if (match) {
          try {
            doc.image(Buffer.from(match[1], 'base64'), QRX, QRY, { width: QR, height: QR });
          } catch (_) { /* skip */ }
        }
      }

      // ── Thumbnail + title ─────────────────────────────────────────────────
      const THUMB = 100;
      const THUMB_Y = QRY + (QR - THUMB) / 2;
      let titleX = M;
      if (thumbBuffer) {
        doc.save();
        try {
          doc.roundedRect(M, THUMB_Y, THUMB, THUMB, 8).clip();
          doc.image(thumbBuffer, M, THUMB_Y, { width: THUMB, height: THUMB });
          titleX = M + THUMB + 18;
        } catch (_) { /* no thumbnail */ }
        doc.restore(); // always balance save/restore
      }
      const titleW = QRX - titleX - 20;
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(20)
        .text(`Billet ${ticket.serialNumber}`, titleX, THUMB_Y + 14, { width: titleW });
      doc.fillColor('#555555').font('Helvetica').fontSize(11)
        .text(event.name, titleX, doc.y + 6, { width: titleW, height: 28, ellipsis: true });
      doc.fillColor('#222222').font('Helvetica').fontSize(11)
        .text(`Réservation : ${fmtDate(extra?.purchasedAt ? new Date(extra.purchasedAt) : new Date())}`, titleX, doc.y + 6, { width: titleW });

      // ── Info table ────────────────────────────────────────────────────────
      const organizerName = extra?.organizer ? `${extra.organizer.firstName} ${extra.organizer.lastName}` : '—';
      const priceLabel = ticket.isInvitation ? 'Invitation'
        : ticket.price > 0 ? `${Number(ticket.price).toFixed(2)} ${ticket.currency}` : 'Gratuit';
      const place = [event.venue, event.address, event.city].filter(Boolean).join(', ');
      const rows: [string, string][][] = [
        [['Événement', event.name],        ['Prix', priceLabel]],
        [['Lieu', place],                   ['Date et heure', `${fmtDate(startDate)}\nà ${fmtTime(startDate)}`]],
        [['Participant', holderName],       ['Catégorie', ticket.templateName]],
        [['Contact', extra?.holderEmail || '—'], ['Organisateur', organizerName]],
      ];

      const PAD = 12;
      const COL = CW / 2;
      const TW = COL - PAD * 2;
      let y = 300;
      doc.lineWidth(0.75).strokeColor('#c8c8c8');
      for (const row of rows) {
        const cellH = (label: string, value: string) =>
          doc.font('Helvetica-Bold').fontSize(11).heightOfString(label, { width: TW }) + 6 +
          doc.font('Helvetica').fontSize(11).heightOfString(value, { width: TW, lineGap: 4 });
        const h = Math.max(...row.map(([l, v]) => cellH(l, v))) + PAD * 2;

        row.forEach(([label, value], i) => {
          const x = M + i * COL;
          doc.rect(x, y, COL, h).stroke();
          doc.fillColor('#111111').font('Helvetica-Bold').fontSize(11).text(label, x + PAD, y + PAD, { width: TW });
          doc.fillColor('#222222').font('Helvetica').fontSize(11).text(value, x + PAD, doc.y + 6, { width: TW, lineGap: 4 });
        });
        y += h;
      }

      // ── Legal footer ──────────────────────────────────────────────────────
      const orgLine = extra?.organizer
        ? `L'organisateur de cet événement et vendeur des billets est : ${organizerName}${extra.organizer.email ? `, adresse e-mail : ${extra.organizer.email}` : ''}.`
        : null;
      doc.fillColor('#333333').font('Helvetica').fontSize(8.5);
      let fy = y + 28;
      if (orgLine) {
        doc.text(orgLine, M, fy, { width: CW, lineGap: 3 });
        fy = doc.y + 8;
      }
      doc.text('Ce billet est personnel. Présentez le QR code à l\'entrée : il ne peut être scanné qu\'une seule fois.', M, fy, { width: CW, lineGap: 3 });
      doc.text('Ce billet n\'est pas une facture. L\'émission de la facture relève de l\'organisateur de l\'événement, vendeur des billets.', M, doc.y + 8, { width: CW, lineGap: 3 });

      doc.end();
    });
  }
}
