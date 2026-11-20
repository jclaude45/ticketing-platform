import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentStatus, Prisma, Role, TicketStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { loadCsv, loadXlsx } from '../common/spreadsheet-guard';
import { readPeople } from '../common/contact-sheet';
import { unsubscribeLinks } from '../communication/unsubscribe';
import { EmailVerifierService, type Verdict } from '../common/email/email-verifier.service';
import { PassThrough } from 'stream';
import { randomBytes } from 'crypto';
import * as archiver from 'archiver';
import * as QRCode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { PublicService } from '../public/public.service';
import { MAX_GUESTS_PER_BATCH, type DeliveryMode } from './dto/invitation.dto';
import { tariffLabel } from '../tickets/event-days';
import { CAPACITY_POOL, capacityLeft, invitationTemplateId, syncCapacityPool } from '../tickets/capacity-pool';
import { ASK_PHONE, answerLabel, cleanFields, guestToken, type Answers, type FormField } from './guest-form';
import { SaveGuestFormDto } from './dto/guest-form.dto';

/** Invitation tickets are regular tickets tagged with metadata.source = INVITATION. */
export const INVITATION_SOURCE = 'INVITATION';

/**
 * NONE: paper invitation, no e-mail is sent (the guest confirms by scanning its QR code).
 * HELD: past the day's allowance of addresses ZAYA does not know yet, sent on a later day.
 */
export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED' | 'NONE' | 'HELD';

/** Invitation e-mails to addresses ZAYA does not know, per organizer and 24 hours: to start, and at most */
const NEW_ADDRESSES_DAILY_START = 200;
const NEW_ADDRESSES_DAILY_MAX = 5000;
const HELD_NOTE = 'En attente : 200 nouvelles adresses par jour au plus, envoi automatique les jours suivants';

interface InvitationMetadata {
  source: typeof INVITATION_SOURCE;
  invitedBy: string;
  invitedAt: string;
  message: string | null;
  emailStatus: EmailStatus;
  emailSentAt?: string;
  /** Sent to an address ZAYA did not know: counts against the organizer's daily allowance */
  emailNew?: boolean;
  delivery?: DeliveryMode;
}

export interface Guest {
  name: string;
  /** Empty for a paper invitation whose address is not known */
  email: string;
  phone?: string;
  row?: number; // spreadsheet row, for error reporting
}

/** Guests read from a file before anything is created: the organizer picks whom to invite */
const MAX_PREVIEW = 5000;

export interface GuestIssue {
  row?: number;
  name: string;
  email: string;
  reason: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Marie Kabila" → "Marie-Kabila": a file name every system accepts */
const fileSlug = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'invite';

/** 144-bit random token of the shared link */
const newOpenToken = () => randomBytes(18).toString('base64url');

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketGeneration: TicketGenerationService,
    private readonly publicService: PublicService,
    private readonly config: ConfigService,
    private readonly verifier: EmailVerifierService,
  ) {}

  // ─── Send ─────────────────────────────────────────────────────────────────

  async sendInvitations(
    eventId: string,
    userId: string,
    role: Role,
    templateId: string,
    guests: Guest[],
    message?: string | null,
    delivery: DeliveryMode = 'EMAIL',
  ) {
    const event = await this.loadEvent(eventId, userId, role);
    const cleanMessage = message?.trim() || null;
    // A tariff, or the seats of the capacity left by the tariffs
    templateId = await invitationTemplateId(this.prisma, eventId, templateId);
    // Paper invitations are printed with their QR code: the address is optional, nothing is sent
    const paper = delivery === 'PAPER';

    // Validate + dedupe within the batch
    const errors: GuestIssue[] = [];
    const skipped: GuestIssue[] = [];
    const valid: Guest[] = [];
    const seen = new Set<string>();
    for (const g of guests) {
      const name = (g.name ?? '').trim();
      const email = (g.email ?? '').trim().toLowerCase();
      if (!name) { errors.push({ row: g.row, name: '-', email, reason: 'Nom manquant' }); continue; }
      if (!(paper && !email) && !EMAIL_RE.test(email)) { errors.push({ row: g.row, name, email, reason: 'Email invalide ou manquant' }); continue; }
      if (email && seen.has(email)) { skipped.push({ row: g.row, name, email, reason: 'Doublon dans la liste' }); continue; }
      if (email) seen.add(email);
      valid.push({ name, email, phone: g.phone?.trim().slice(0, 30) || undefined, row: g.row });
    }

    // Skip guests who already hold an active invitation for this event
    if (valid.some((g) => g.email)) {
      const existing = await this.prisma.ticket.findMany({
        where: {
          eventId,
          holderEmail: { in: valid.filter((g) => g.email).map((g) => g.email) }, // invitation emails are stored lowercased
          status: { not: TicketStatus.CANCELLED },
          metadata: { path: ['source'], equals: INVITATION_SOURCE },
        },
        select: { holderEmail: true },
      });
      const already = new Set(existing.map((t) => t.holderEmail?.toLowerCase()));
      for (let i = valid.length - 1; i >= 0; i--) {
        if (valid[i].email && already.has(valid[i].email)) {
          skipped.unshift({ ...valid[i], reason: 'Déjà invité(e) à cet événement' });
          valid.splice(i, 1);
        }
      }
    }

    if (!valid.length) {
      return { created: 0, skipped, errors, invitations: [] };
    }

    const metadata: InvitationMetadata = {
      source: INVITATION_SOURCE,
      invitedBy: userId,
      invitedAt: new Date().toISOString(),
      message: cleanMessage,
      emailStatus: paper ? 'NONE' : 'PENDING',
      ...(paper && { delivery }),
    };

    // Confirmation form on: the guest gets a link and the ticket only once they confirm.
    // The seat is held meanwhile; declining gives it back.
    const form = await this.prisma.guestForm.findUnique({ where: { eventId }, select: { enabled: true } });
    const result = await this.ticketGeneration.generateTickets(
      eventId,
      userId,
      role,
      { templateId, holders: valid.map((g) => ({ holderName: g.name, holderEmail: g.email || undefined, holderPhone: g.phone })) },
      {
        price: 0, metadata: metadata as unknown as Prisma.InputJsonValue, source: 'INVITATION',
        // A paper guest always confirms by scanning the QR: that is when their ticket goes out
        ...((form?.enabled || paper) && { status: TicketStatus.INVITED }),
      },
    );

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: result.tickets.map((t) => t.id) } },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, status: true,
        metadata: true, template: { select: { name: true, currency: true, validDays: true } },
      },
    });

    // Emails go out in the background: a large list would otherwise time out the request.
    // Each ticket's metadata.emailStatus tracks delivery, visible in the invitations list.
    // Addresses ZAYA does not know past the day's allowance wait for the following days.
    let heldIds = new Set<string>();
    if (!paper) {
      const { now, later, fresh } = await this.withinAllowance(event.organizerId, tickets);
      heldIds = new Set(later.map((t) => t.id));
      await this.hold(later.map((t) => t.id));
      this.deliver(event, now, cleanMessage, fresh).catch((err) =>
        this.logger.error(`Invitation delivery crashed for event ${eventId}: ${err?.message}`),
      );
    }

    return {
      created: tickets.length,
      held: heldIds.size,
      skipped,
      errors,
      invitations: tickets.map((t) => ({
        id: t.id,
        serialNumber: t.serialNumber,
        holderName: t.holderName,
        holderEmail: t.holderEmail,
        emailStatus: (paper ? 'NONE' : heldIds.has(t.id) ? 'HELD' : 'PENDING') as EmailStatus,
      })),
    };
  }

  /**
   * Guest added at the door by a controller (scanner app). The caller has checked the
   * controller's assignment. `count` tickets (the guest + companions) on the cheapest
   * category with enough places, "Invitation" categories first; emailed in the background.
   */
  async inviteAtDoor(
    eventId: string,
    controllerId: string,
    guest: { firstName: string; lastName: string; email: string; phone?: string; address?: string; count?: number },
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, organizerId: true, status: true,
        startDate: true, endDate: true, timeZone: true, city: true, venue: true,
        address: true, description: true, bannerUrl: true,
        organizer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!event) throw new NotFoundException('Événement introuvable');

    const count = guest.count ?? 1;
    const name = `${guest.firstName.trim()} ${guest.lastName.trim()}`;
    const email = guest.email.trim().toLowerCase();

    const already = await this.prisma.ticket.count({
      where: {
        eventId,
        holderEmail: email,
        status: { not: TicketStatus.CANCELLED },
        metadata: { path: ['source'], equals: INVITATION_SOURCE },
      },
    });
    if (already) throw new BadRequestException('Cette personne est déjà invitée à cet événement');

    const templates = await this.prisma.ticketTemplate.findMany({
      where: { eventId, availableCount: { gte: count } },
      select: { id: true, name: true, price: true },
      orderBy: { price: 'asc' },
    });
    const template = templates.find((t) => /invit/i.test(t.name)) ?? templates[0];
    if (!template) throw new BadRequestException("Plus assez de places disponibles pour ajouter cet invité");

    const metadata = {
      source: INVITATION_SOURCE,
      invitedBy: controllerId,
      invitedByRole: 'CONTROLLER',
      invitedAt: new Date().toISOString(),
      message: null,
      emailStatus: 'PENDING',
      guest: { phone: guest.phone?.trim() || null, address: guest.address?.trim() || null },
    };

    const result = await this.ticketGeneration.generateTickets(
      eventId,
      event.organizerId,
      Role.ORGANIZER,
      {
        templateId: template.id,
        holders: Array.from({ length: count }, (_, i) => ({
          holderName: i === 0 ? name : `${name} (+${i})`,
          holderEmail: email,
        })),
      },
      { price: 0, metadata: metadata as unknown as Prisma.InputJsonValue, source: 'INVITATION' },
    );

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: result.tickets.map((t) => t.id) } },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, status: true,
        metadata: true, template: { select: { name: true, currency: true, validDays: true } },
      },
    });
    // The guest stands at the door: a real person, outside the daily allowance
    this.deliver(event, tickets, null, new Set()).catch((err) =>
      this.logger.error(`Door invitation delivery crashed for event ${eventId}: ${err?.message}`),
    );

    return {
      created: tickets.length,
      templateName: template.name,
      guests: tickets.map((t) => ({ id: t.id, serialNumber: t.serialNumber, holderName: t.holderName })),
    };
  }

  /**
   * The guests of a file as they will be invited, nothing created yet: each line with what
   * would stop it (no name, bad address, twice in the file, already invited, address that
   * bounced, person who unsubscribed). The organizer then invites all, some or one.
   */
  async previewImport(eventId: string, userId: string, role: Role, file: Express.Multer.File, delivery: DeliveryMode = 'EMAIL') {
    const event = await this.loadEvent(eventId, userId, role);
    const paper = delivery === 'PAPER';
    const guests = await this.parseGuestFile(file, !paper, MAX_PREVIEW);
    const emails = guests.map((g) => (g.email ?? '').trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));
    const [invited, bounced, gone] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { eventId, holderEmail: { in: emails }, status: { not: TicketStatus.CANCELLED }, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
        select: { holderEmail: true },
      }),
      this.prisma.emailSuppression.findMany({ where: { email: { in: emails } }, select: { email: true } }),
      this.prisma.emailUnsubscribe.findMany({ where: { organizerId: event.organizerId, email: { in: emails } }, select: { email: true } }),
    ]);
    const already = new Set(invited.map((t) => t.holderEmail?.toLowerCase()));
    const bad = new Set(bounced.map((r) => r.email));
    const out = new Set(gone.map((r) => r.email));
    const seen = new Set<string>();
    return {
      guests: guests.map((g) => {
        const name = (g.name ?? '').trim();
        const email = (g.email ?? '').trim().toLowerCase();
        let issue: string | null = null;
        if (!name) issue = 'Nom manquant';
        else if (!(paper && !email) && !EMAIL_RE.test(email)) issue = email ? 'E-mail invalide' : 'E-mail manquant';
        else if (email && seen.has(email)) issue = 'Doublon dans le fichier';
        else if (email && already.has(email)) issue = 'Déjà invité(e)';
        else if (email && bad.has(email)) issue = 'Adresse en erreur (rebond ou spam)';
        else if (email && out.has(email) && !paper) issue = 'S’est désinscrit(e) de vos e-mails';
        if (email && !issue) seen.add(email);
        return { row: g.row, name, email, phone: g.phone ?? '', issue };
      }),
    };
  }

  async importInvitations(
    eventId: string,
    userId: string,
    role: Role,
    templateId: string,
    file: Express.Multer.File,
    message?: string | null,
    delivery: DeliveryMode = 'EMAIL',
  ) {
    // Check access before parsing so strangers can't probe the parser
    await this.loadEvent(eventId, userId, role);
    const guests = await this.parseGuestFile(file, delivery === 'EMAIL');
    return this.sendInvitations(eventId, userId, role, templateId, guests, message, delivery);
  }

  // ─── List / resend ────────────────────────────────────────────────────────

  async listInvitations(eventId: string, userId: string, role: Role) {
    await this.loadEvent(eventId, userId, role);
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, holderPhone: true, status: true,
        checkedInAt: true, createdAt: true, metadata: true,
        template: { select: { id: true, name: true } },
        guestResponse: { select: { status: true, answers: true, respondedAt: true, updatedAt: true } },
      },
    });
    const fields = await this.formFields(eventId);

    return tickets.map((t) => {
      const meta = (t.metadata ?? {}) as Partial<InvitationMetadata>;
      const r = t.guestResponse;
      return {
        holderPhone: t.holderPhone,
        response: r && {
          status: r.status,
          respondedAt: r.respondedAt,
          updatedAt: r.updatedAt,
          answers: this.labelAnswers(fields, r.answers as Answers),
        },
        id: t.id,
        serialNumber: t.serialNumber,
        holderName: t.holderName,
        holderEmail: t.holderEmail,
        status: t.status,
        checkedInAt: t.checkedInAt,
        createdAt: t.createdAt,
        template: t.template,
        emailStatus: meta.emailStatus ?? 'PENDING',
        delivery: meta.delivery ?? 'EMAIL',
        emailSentAt: meta.emailSentAt ?? null,
        /** Why it was not sent, or why it waits */
        emailError: (meta as { emailError?: string | null }).emailError ?? null,
      };
    });
  }

  async resendInvitation(eventId: string, ticketId: string, userId: string, role: Role) {
    const event = await this.loadEvent(eventId, userId, role);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, eventId, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, status: true,
        metadata: true, template: { select: { name: true, currency: true, validDays: true } },
      },
    });
    // A guest still to answer gets the link again; a confirmed one, their ticket
    if (!ticket) throw new NotFoundException('Invitation introuvable');
    if (ticket.status === TicketStatus.CANCELLED) throw new BadRequestException('Cette invitation a été annulée');
    if (!ticket.holderEmail) throw new BadRequestException("Cette invitation n'a pas d'adresse email");

    const meta = (ticket.metadata ?? {}) as Partial<InvitationMetadata>;
    // Already reached once: no new address. Otherwise it takes a place in the day's allowance.
    const { now, fresh } = meta.emailStatus === 'SENT'
      ? { now: [ticket], fresh: new Set<string>() }
      : await this.withinAllowance(event.organizerId, [ticket]);
    if (!now.length) {
      throw new BadRequestException('Limite du jour atteinte : 200 nouvelles adresses par 24 heures. Cette invitation partira automatiquement plus tard.');
    }
    if (fresh.has(ticket.id) && ticket.holderEmail) {
      const verdict = (await this.verifier.verify([ticket.holderEmail])).get(ticket.holderEmail.trim().toLowerCase());
      if (verdict === 'unchecked') throw new BadRequestException('La vérification de l’adresse est indisponible. Réessayez plus tard.');
      if (verdict === 'risky' || verdict === 'unknown') {
        await this.markUnverified(ticket, verdict);
        throw new BadRequestException('Cette adresse n’a pas pu être confirmée par la vérification : l’invitation n’est pas envoyée.');
      }
    }
    const status = await this.deliverOne(event, ticket, meta.message ?? null, false, fresh.has(ticket.id));
    if (status !== 'SENT') throw new BadRequestException("L'email n'a pas pu être envoyé. Réessayez plus tard.");
    return { emailStatus: status };
  }

  // ─── Confirmation form ────────────────────────────────────────────────────

  async getForm(eventId: string, userId: string, role: Role) {
    await this.loadEvent(eventId, userId, role);
    const form = await this.prisma.guestForm.findUnique({ where: { eventId } });
    if (!form) {
      return {
        eventId, enabled: false, deadline: null, intro: null, askPhone: 'OPTIONAL', fields: [],
        openEnabled: false, openTemplateId: null, openLimit: null, openUrl: null, openCount: 0,
      };
    }
    const { openToken, ...rest } = form;
    return { ...rest, openUrl: openToken ? this.openLink(openToken) : null, openCount: await this.openSignUps(eventId) };
  }

  async saveForm(eventId: string, userId: string, role: Role, dto: SaveGuestFormDto) {
    const event = await this.loadEvent(eventId, userId, role);
    // The shared QR may draw on the capacity left by the tariffs
    if (dto.openEnabled && dto.openTemplateId === CAPACITY_POOL) {
      dto.openTemplateId = (await syncCapacityPool(this.prisma, eventId, true))!.id;
    }
    const templates = await this.prisma.ticketTemplate.findMany({ where: { eventId }, select: { id: true } });
    const fields = cleanFields(dto.fields ?? [], templates.map((t) => t.id));
    const deadline = dto.deadline ? new Date(dto.deadline) : null;
    if (deadline && isNaN(deadline.getTime())) throw new BadRequestException('Date limite invalide');
    if (deadline && deadline > event.endDate) throw new BadRequestException("La date limite doit précéder la fin de l'événement");
    const askPhone = ASK_PHONE.includes(dto.askPhone as any) ? dto.askPhone! : 'OPTIONAL';
    if (dto.openEnabled && !templates.some((t) => t.id === dto.openTemplateId)) {
      throw new BadRequestException('Choisissez la catégorie des invitations du QR commun');
    }
    const current = await this.prisma.guestForm.findUnique({ where: { eventId }, select: { openToken: true } });
    const data = {
      enabled: !!dto.enabled,
      deadline,
      intro: dto.intro?.trim() || null,
      askPhone,
      fields: fields as unknown as Prisma.InputJsonValue,
      openEnabled: !!dto.openEnabled,
      openTemplateId: dto.openTemplateId || null,
      openLimit: dto.openLimit ?? null,
      // The shared link is made the first time it is turned on, and kept until regenerated
      ...(dto.openEnabled && !current?.openToken && { openToken: newOpenToken() }),
    };
    await this.prisma.guestForm.upsert({ where: { eventId }, create: { eventId, ...data }, update: data });
    return this.getForm(eventId, userId, role);
  }

  /** Seats of the capacity left by the tariffs, for invitations */
  async capacityForInvitations(eventId: string, userId: string, role: Role) {
    await this.loadEvent(eventId, userId, role);
    const pool = await syncCapacityPool(this.prisma, eventId);
    return { available: pool ? pool.available : await capacityLeft(this.prisma, eventId), templateId: pool?.id ?? null };
  }

  /** New shared link: the QR codes printed with the old one stop working */
  async regenerateOpenLink(eventId: string, userId: string, role: Role) {
    await this.loadEvent(eventId, userId, role);
    const form = await this.prisma.guestForm.findUnique({ where: { eventId }, select: { eventId: true } });
    if (!form) throw new BadRequestException("Activez d'abord le QR commun");
    await this.prisma.guestForm.update({ where: { eventId }, data: { openToken: newOpenToken() } });
    return this.getForm(eventId, userId, role);
  }

  openLink(token: string): string {
    const base = this.config.get<string>('frontend.publicUrl') || 'https://zaya.live';
    return `${base}/invitation/ouverte/${token}`;
  }

  /** Guests who signed up through the shared link and still hold their invitation */
  async openSignUps(eventId: string, db: Pick<PrismaService, 'ticket'> = this.prisma): Promise<number> {
    return db.ticket.count({
      where: { eventId, status: { not: TicketStatus.CANCELLED }, metadata: { path: ['openLink'], equals: true } },
    });
  }

  // ─── QR codes to print on paper invitations ───────────────────────────────

  /** One PNG per invitation still to use, named after the guest: placed in the invitation design */
  async qrZip(eventId: string, userId: string, role: Role): Promise<Buffer> {
    await this.loadEvent(eventId, userId, role);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        eventId,
        status: { in: [TicketStatus.INVITED, TicketStatus.VALID] },
        metadata: { path: ['source'], equals: INVITATION_SOURCE },
      },
      orderBy: [{ holderName: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, holderName: true, template: { select: { name: true } } },
    });
    if (!tickets.length) throw new BadRequestException('Aucune invitation à imprimer');

    const archive = archiver('zip', { zlib: { level: 6 } });
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      out.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });
    archive.pipe(out);
    const used = new Set<string>();
    for (const [i, t] of tickets.entries()) {
      let name = `${String(i + 1).padStart(3, '0')}-${fileSlug(t.holderName || 'invite')}-${fileSlug(t.template.name)}.png`;
      if (used.has(name)) name = name.replace(/\.png$/, `-${t.id.slice(0, 6)}.png`);
      used.add(name);
      archive.append(await this.qrImage(this.guestLink(t.id)), { name });
    }
    await archive.finalize();
    return done;
  }

  /** The QR of one guest (to reprint a single invitation) */
  async guestQr(eventId: string, ticketId: string, userId: string, role: Role) {
    await this.loadEvent(eventId, userId, role);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, eventId, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
      select: { id: true, holderName: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Invitation introuvable');
    if (ticket.status === TicketStatus.CANCELLED) throw new BadRequestException('Cette invitation a été annulée');
    return { png: await this.qrImage(this.guestLink(ticket.id)), filename: `qr-${fileSlug(ticket.holderName || 'invite')}.png` };
  }

  /** The QR of the shared link */
  async openQr(eventId: string, userId: string, role: Role) {
    await this.loadEvent(eventId, userId, role);
    const form = await this.prisma.guestForm.findUnique({ where: { eventId }, select: { openToken: true } });
    if (!form?.openToken) throw new BadRequestException("Activez d'abord le QR commun");
    return this.qrImage(this.openLink(form.openToken));
  }

  /** Large enough to print sharp at 4 cm; quiet zone included */
  private qrImage(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, { type: 'png', width: 800, margin: 2, errorCorrectionLevel: 'M' });
  }

  /** Every invitation with its answers, one column per question, plus the totals per choice */
  async exportResponses(eventId: string, userId: string, role: Role): Promise<Buffer> {
    const event = await this.loadEvent(eventId, userId, role);
    const fields = await this.formFields(eventId);
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
      orderBy: { createdAt: 'asc' },
      select: {
        holderName: true, holderEmail: true, holderPhone: true, status: true, checkedInAt: true,
        template: { select: { name: true } },
        guestResponse: { select: { status: true, answers: true, updatedAt: true } },
      },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Réponses');
    ws.columns = [
      { header: 'Nom', width: 28 }, { header: 'Email', width: 32 }, { header: 'Téléphone', width: 16 },
      { header: 'Catégorie', width: 18 }, { header: 'Réponse', width: 14 }, { header: 'Répondu le', width: 18 },
      { header: 'Entré(e)', width: 10 },
      ...fields.map((f) => ({ header: f.label, width: Math.min(40, Math.max(14, f.label.length + 2)) })),
    ];
    ws.getRow(1).font = { bold: true };
    for (const t of tickets) {
      const r = t.guestResponse;
      const answers = (r?.answers ?? {}) as Answers;
      ws.addRow([
        t.holderName ?? '', t.holderEmail ?? '', t.holderPhone ?? '', t.template.name,
        this.responseLabel(t.status, r?.status),
        r ? r.updatedAt.toLocaleString('fr-FR', { timeZone: event.timeZone }) : '',
        t.checkedInAt ? 'Oui' : '',
        ...fields.map((f) => (r?.status === 'CONFIRMED' ? answerLabel(f, answers[f.id]) : '')),
      ]);
    }

    // Totals: how many confirmed guests chose each option, against its places
    const choices = fields.filter((f) => f.type === 'CHOICE' || f.type === 'YESNO');
    if (choices.length) {
      const totals = wb.addWorksheet('Totaux');
      totals.columns = [{ header: 'Question', width: 32 }, { header: 'Choix', width: 28 }, { header: 'Confirmés', width: 12 }, { header: 'Places', width: 10 }];
      totals.getRow(1).font = { bold: true };
      const confirmed = tickets.filter((t) => t.guestResponse?.status === 'CONFIRMED').map((t) => t.guestResponse!.answers as Answers);
      for (const f of choices) {
        const options = f.type === 'YESNO'
          ? [{ id: true as string | boolean, label: 'Oui', limit: null }, { id: false as string | boolean, label: 'Non', limit: null }]
          : f.options!.map((o) => ({ id: o.id as string | boolean, label: o.label, limit: o.limit ?? null }));
        for (const o of options) {
          totals.addRow([f.label, o.label, confirmed.filter((a) => a[f.id] === o.id).length, o.limit ?? '']);
        }
      }
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async formFields(eventId: string): Promise<FormField[]> {
    const form = await this.prisma.guestForm.findUnique({ where: { eventId }, select: { fields: true } });
    return (form?.fields ?? []) as unknown as FormField[];
  }

  private labelAnswers(fields: FormField[], answers: Answers | null) {
    return fields
      .filter((f) => answers?.[f.id] !== undefined)
      .map((f) => ({ fieldId: f.id, label: f.label, value: answerLabel(f, answers![f.id]) }));
  }

  private responseLabel(ticketStatus: TicketStatus, response?: string) {
    if (response === 'DECLINED') return 'Décliné';
    if (ticketStatus === TicketStatus.CANCELLED) return 'Annulée';
    if (response === 'CONFIRMED') return 'Confirmé';
    if (ticketStatus === TicketStatus.INVITED) return 'En attente';
    return 'Billet envoyé';
  }

  // ─── Excel template ───────────────────────────────────────────────────────

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Invités');
    ws.columns = [
      { header: 'Nom *', key: 'nom', width: 28 },
      { header: 'Email *', key: 'email', width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow(['Marie Dupont', 'marie.dupont@example.com']);
    ws.addRow(['Jean Mukendi', 'jean.mukendi@example.com']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async loadEvent(eventId: string, userId: string, role: Role) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, organizerId: true, status: true,
        startDate: true, endDate: true, timeZone: true, city: true, venue: true,
        address: true, description: true, bannerUrl: true,
        organizer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }
    return event;
  }

  /** The event as the invitation e-mails show it (no access check: for the guest's own page) */
  async eventForMail(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, organizerId: true, status: true,
        startDate: true, endDate: true, timeZone: true, city: true, venue: true,
        address: true, description: true, bannerUrl: true,
        organizer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    return event;
  }

  /** The guest's confirmation page */
  guestLink(ticketId: string): string {
    const base = this.config.get<string>('frontend.publicUrl') || 'https://zaya.live';
    return `${base}/invitation/${guestToken(ticketId)}`;
  }

  private async deliver(
    event: Awaited<ReturnType<InvitationsService['loadEvent']>>,
    tickets: Parameters<InvitationsService['deliverOne']>[1][],
    message: string | null | ((t: Parameters<InvitationsService['deliverOne']>[1]) => string | null),
    fresh: Set<string>,
  ) {
    // New addresses are verified first: only those found deliverable are written to
    const verdicts = await this.verifier.verify(tickets.filter((t) => fresh.has(t.id) && t.holderEmail).map((t) => t.holderEmail!));
    let sent = 0;
    const waiting: string[] = [];
    for (const t of tickets) {
      const verdict = fresh.has(t.id) ? verdicts.get(t.holderEmail?.trim().toLowerCase() ?? '') : undefined;
      if (verdict === 'unchecked') { waiting.push(t.id); continue; }
      if (verdict === 'risky' || verdict === 'unknown') { await this.markUnverified(t, verdict); continue; }
      // Undeliverable ones are now suppressed: deliverOne records the refusal
      const text = typeof message === 'function' ? message(t) : message;
      if ((await this.deliverOne(event, t, text, false, fresh.has(t.id))) === 'SENT') sent++;
    }
    // The verification service could not be reached: tried again with the waiting ones
    await this.hold(waiting, 'En attente : vérification de l’adresse indisponible, nouvel essai automatique');
    this.logger.log(`Invitations for event ${event.id}: ${sent}/${tickets.length} emails sent${waiting.length ? `, ${waiting.length} awaiting verification` : ''}`);
  }

  /** An address the verification could not confirm (catch-all, server unreachable): not written to */
  private async markUnverified(ticket: { id: string; metadata: Prisma.JsonValue }, verdict: Verdict) {
    const meta = (ticket.metadata ?? {}) as Record<string, unknown>;
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        metadata: {
          ...meta,
          emailStatus: 'FAILED',
          emailError: verdict === 'risky'
            ? 'Adresse non confirmée par la vérification (le serveur accepte toute adresse) : e-mail non envoyé'
            : 'Adresse impossible à vérifier : e-mail non envoyé',
        } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Which invitations may be e-mailed now. Addresses ZAYA knows (an account, a ticket bought or
   * registered for online, an order paid, a shop purchase) always; the others within the organizer's allowance of the day, the
   * rest waits (`later`). Suppressed addresses take no place: deliverOne refuses them anyway.
   */
  private async withinAllowance<T extends { id: string; holderEmail: string | null }>(organizerId: string, tickets: T[]) {
    const emails = Array.from(new Set(tickets.map((t) => t.holderEmail?.trim().toLowerCase()).filter((e): e is string => !!e)));
    const [users, holders, payers, shoppers, suppressed] = emails.length
      ? await Promise.all([
          this.prisma.user.findMany({ where: { email: { in: emails, mode: 'insensitive' } }, select: { email: true } }),
          this.prisma.ticket.findMany({ where: { holderEmail: { in: emails, mode: 'insensitive' }, source: 'ONLINE' }, select: { holderEmail: true }, distinct: ['holderEmail'] }),
          this.prisma.payment.findMany({ where: { holderEmail: { in: emails, mode: 'insensitive' }, status: PaymentStatus.COMPLETED }, select: { holderEmail: true }, distinct: ['holderEmail'] }),
          this.prisma.merchOrder.findMany({ where: { buyerEmail: { in: emails, mode: 'insensitive' }, paidAt: { not: null } }, select: { buyerEmail: true }, distinct: ['buyerEmail'] }),
          this.prisma.emailSuppression.findMany({ where: { email: { in: emails } }, select: { email: true } }),
        ])
      : [[], [], [], [], []];
    const known = new Set([
      ...users.map((u) => u.email), ...holders.map((h) => h.holderEmail!), ...payers.map((p) => p.holderEmail),
      ...shoppers.map((o) => o.buyerEmail), ...suppressed.map((s) => s.email),
    ].map((e) => e.toLowerCase()));

    let allowance = await this.newAddressAllowance(organizerId);
    const now: T[] = [];
    const later: T[] = [];
    const fresh = new Set<string>();
    for (const t of tickets) {
      const email = t.holderEmail?.trim().toLowerCase();
      if (!email || known.has(email)) now.push(t);
      else if (allowance > 0) { allowance--; fresh.add(t.id); now.push(t); }
      else later.push(t);
    }
    return { now, later, fresh };
  }

  /**
   * New addresses an organizer's invitations may reach in the next 24 hours: 200 to start, plus
   * those reached in the last 30 days that neither bounced nor complained (a real guest list
   * opens the way for more), at most 5000. None while the day's bounces and complaints pass 5 %
   * (10 or more): a made-up list cannot get far, nor get ZAYA's sending suspended again.
   */
  private async newAddressAllowance(organizerId: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ today: bigint; proven: bigint; bad: bigint }[]>`
      SELECT
        count(*) FILTER (WHERE x.sent >= now() - interval '24 hours') AS today,
        count(*) FILTER (WHERE x.sent < now() - interval '24 hours' AND s.email IS NULL) AS proven,
        count(*) FILTER (WHERE x.sent >= now() - interval '24 hours' AND s.email IS NOT NULL) AS bad
      FROM (
        SELECT lower(t."holderEmail") AS email, (t.metadata->>'emailSentAt')::timestamptz AS sent
        FROM "Ticket" t JOIN "Event" e ON e.id = t."eventId"
        WHERE e."organizerId" = ${organizerId} AND t.source = 'INVITATION' AND t.metadata->>'emailNew' = 'true'
      ) x
      LEFT JOIN "EmailSuppression" s ON s.email = x.email
      WHERE x.sent >= now() - interval '30 days'`;
    const today = Number(row?.today ?? 0);
    const bad = Number(row?.bad ?? 0);
    if (bad >= 10 && bad >= today * 0.05) return 0;
    return Math.max(0, Math.min(NEW_ADDRESSES_DAILY_MAX, NEW_ADDRESSES_DAILY_START + Number(row?.proven ?? 0)) - today);
  }

  /** Marks invitations as waiting for a later day's allowance */
  private async hold(ticketIds: string[], note = HELD_NOTE) {
    if (!ticketIds.length) return;
    const patch = JSON.stringify({ emailStatus: 'HELD', emailError: note });
    await this.prisma.$executeRaw`
      UPDATE "Ticket" SET metadata = coalesce(metadata, '{}'::jsonb) || ${patch}::jsonb
      WHERE id IN (${Prisma.join(ticketIds)})`;
  }

  private releasing = false;

  /** Waiting invitations go out as each organizer's allowance frees up, oldest first */
  @Cron(CronExpression.EVERY_HOUR)
  async releaseHeldInvitations() {
    if (this.releasing) return;
    this.releasing = true;
    try {
      const held = await this.prisma.ticket.findMany({
        where: { source: 'INVITATION', status: { not: TicketStatus.CANCELLED }, metadata: { path: ['emailStatus'], equals: 'HELD' } },
        orderBy: { createdAt: 'asc' },
        take: 5000,
        select: {
          id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, status: true, eventId: true,
          metadata: true, template: { select: { name: true, currency: true, validDays: true } },
          event: { select: { organizerId: true } },
        },
      });
      const byOrganizer = new Map<string, typeof held>();
      held.forEach((t) => byOrganizer.set(t.event.organizerId, [...(byOrganizer.get(t.event.organizerId) ?? []), t]));

      for (const [organizerId, tickets] of Array.from(byOrganizer)) {
        const { now, fresh } = await this.withinAllowance(organizerId, tickets);
        for (const eventId of Array.from(new Set(now.map((t) => t.eventId)))) {
          const event = await this.eventForMail(eventId);
          await this.deliver(event, now.filter((t) => t.eventId === eventId), (t) => ((t.metadata ?? {}) as Partial<InvitationMetadata>).message ?? null, fresh);
        }
        if (now.length) this.logger.log(`Invitations en attente (organisateur ${organizerId}) : ${now.length} reprises, ${tickets.length - now.length} attendent encore`);
      }
    } catch (err) {
      this.logger.error(`Release of held invitations failed: ${(err as Error).message}`);
    } finally {
      this.releasing = false;
    }
  }

  /**
   * One invitation e-mail. A ticket still INVITED gets the link to its confirmation page; a
   * confirmed one gets its ticket, with the guest's answers and the link to change them.
   */
  async deliverOne(
    event: Awaited<ReturnType<InvitationsService['loadEvent']>>,
    ticket: {
      id: string; serialNumber: string; holderName: string | null; holderEmail: string | null;
      qrCode: string | null; metadata: Prisma.JsonValue; status?: TicketStatus;
      template: { name: string; currency: string; validDays?: string[] };
    },
    message: string | null,
    /** The guest asked for it (they just answered on their page): their unsubscribe does not apply */
    requestedByGuest = false,
    /** An address ZAYA did not know: once sent, it counts in the organizer's daily allowance */
    fresh = false,
  ): Promise<EmailStatus> {
    let status: EmailStatus = 'FAILED';
    let skipped: string | null = null;
    try {
      // Never again to an address that bounced or reported spam, nor to someone who asked
      // this organizer to stop: those are what got the platform's sending suspended
      const email = ticket.holderEmail!.trim().toLowerCase();
      const [bad, gone] = await Promise.all([
        this.prisma.emailSuppression.findUnique({ where: { email }, select: { reason: true } }),
        this.prisma.emailUnsubscribe.findUnique({ where: { organizerId_email: { organizerId: event.organizerId, email } }, select: { id: true } }),
      ]);
      if (bad || (gone && !requestedByGuest)) {
        skipped = bad ? 'Adresse en erreur ou plainte pour spam : e-mail non envoyé' : 'Cette personne s’est désinscrite de vos e-mails';
        throw new Error(skipped);
      }
      const awaitingReply = ticket.status === TicketStatus.INVITED;
      const [form, response] = await Promise.all([
        this.prisma.guestForm.findUnique({ where: { eventId: event.id }, select: { deadline: true, fields: true } }),
        awaitingReply ? null : this.prisma.guestResponse.findUnique({ where: { ticketId: ticket.id }, select: { answers: true } }),
      ]);
      const fields = (form?.fields ?? []) as unknown as FormField[];
      // The link only where the guest has a page to go to: waiting, or already answered
      const withLink = awaitingReply || !!response;
      const sent = await this.publicService.sendConfirmationEmail(
        { holderName: ticket.holderName ?? '', holderEmail: ticket.holderEmail! },
        event,
        [{
          ticketId: ticket.id,
          serialNumber: ticket.serialNumber,
          templateName: tariffLabel(ticket.template.name, ticket.template.validDays),
          price: 0,
          currency: ticket.template.currency,
          qrCode: ticket.qrCode,
        }],
        0,
        ticket.template.currency,
        event.bannerUrl,
        null,
        event.organizer,
        {
          message,
          ...(withLink && {
            link: this.guestLink(ticket.id),
            awaitingReply,
            deadline: form?.deadline ?? null,
            answers: response
              ? this.labelAnswers(fields, response.answers as Answers).map((a) => [a.label, a.value] as [string, string])
              : [],
          }),
          unsubscribe: unsubscribeLinks(this.config, event.organizerId, email),
        },
      );
      status = sent ? 'SENT' : 'FAILED';
      if (!sent) this.logger.warn('Invitation email skipped: mailer not configured');
    } catch (err) {
      this.logger.warn(`Invitation email failed for ticket ${ticket.serialNumber}: ${err?.message}`);
    }

    const meta = (ticket.metadata ?? {}) as Record<string, unknown>;
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        metadata: {
          ...meta,
          emailStatus: status,
          ...(status === 'SENT' && { emailSentAt: new Date().toISOString(), ...(fresh && { emailNew: true }) }),
          ...(skipped ? { emailError: skipped } : { emailError: null }),
        } as Prisma.InputJsonValue,
      },
    });
    return status;
  }

  /** Reads guests from .xlsx or .csv (see readPeople for the layouts understood) */
  private async parseGuestFile(file: Express.Multer.File, requireEmail = true, max = MAX_GUESTS_PER_BATCH): Promise<Guest[]> {
    if (!file) throw new BadRequestException('Aucun fichier reçu');

    const wb = new ExcelJS.Workbook();
    const isCsv = /\.csv$/i.test(file.originalname) || /csv/.test(file.mimetype);
    try {
      if (isCsv) {
        await loadCsv(wb, file.buffer);
      } else if (/\.xls$/i.test(file.originalname)) {
        throw new BadRequestException('Format .xls non pris en charge : enregistrez le fichier en .xlsx ou .csv');
      } else {
        await loadXlsx(wb, file.buffer);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Fichier invalide ou corrompu');
    }

    // Found by content: titles above the table or headers worded differently no longer block it
    const guests: Guest[] = readPeople(wb, requireEmail).map((p) => ({ name: p.name, email: p.email, phone: p.phone, row: p.row }));

    if (!guests.length) throw new BadRequestException('Aucun invité trouvé dans le fichier');
    if (guests.length > max) {
      throw new BadRequestException(`Maximum ${max} invités par import`);
    }
    return guests;
  }
}
