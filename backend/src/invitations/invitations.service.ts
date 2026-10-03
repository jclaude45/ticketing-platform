import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { PublicService } from '../public/public.service';
import { MAX_GUESTS_PER_BATCH } from './dto/invitation.dto';

/** Invitation tickets are regular tickets tagged with metadata.source = INVITATION. */
export const INVITATION_SOURCE = 'INVITATION';

export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED';

interface InvitationMetadata {
  source: typeof INVITATION_SOURCE;
  invitedBy: string;
  invitedAt: string;
  message: string | null;
  emailStatus: EmailStatus;
  emailSentAt?: string;
}

export interface Guest {
  name: string;
  email: string;
  row?: number; // spreadsheet row, for error reporting
}

export interface GuestIssue {
  row?: number;
  name: string;
  email: string;
  reason: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketGeneration: TicketGenerationService,
    private readonly publicService: PublicService,
  ) {}

  // ─── Send ─────────────────────────────────────────────────────────────────

  async sendInvitations(
    eventId: string,
    userId: string,
    role: Role,
    templateId: string,
    guests: Guest[],
    message?: string | null,
  ) {
    const event = await this.loadEvent(eventId, userId, role);
    const cleanMessage = message?.trim() || null;

    // Validate + dedupe within the batch
    const errors: GuestIssue[] = [];
    const skipped: GuestIssue[] = [];
    const valid: Guest[] = [];
    const seen = new Set<string>();
    for (const g of guests) {
      const name = (g.name ?? '').trim();
      const email = (g.email ?? '').trim().toLowerCase();
      if (!name) { errors.push({ row: g.row, name: '-', email, reason: 'Nom manquant' }); continue; }
      if (!EMAIL_RE.test(email)) { errors.push({ row: g.row, name, email, reason: 'Email invalide ou manquant' }); continue; }
      if (seen.has(email)) { skipped.push({ row: g.row, name, email, reason: 'Doublon dans la liste' }); continue; }
      seen.add(email);
      valid.push({ name, email, row: g.row });
    }

    // Skip guests who already hold an active invitation for this event
    if (valid.length) {
      const existing = await this.prisma.ticket.findMany({
        where: {
          eventId,
          holderEmail: { in: valid.map((g) => g.email) }, // invitation emails are stored lowercased
          status: { not: TicketStatus.CANCELLED },
          metadata: { path: ['source'], equals: INVITATION_SOURCE },
        },
        select: { holderEmail: true },
      });
      const already = new Set(existing.map((t) => t.holderEmail?.toLowerCase()));
      for (let i = valid.length - 1; i >= 0; i--) {
        if (already.has(valid[i].email)) {
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
      emailStatus: 'PENDING',
    };

    const result = await this.ticketGeneration.generateTickets(
      eventId,
      userId,
      role,
      { templateId, holders: valid.map((g) => ({ holderName: g.name, holderEmail: g.email })) },
      { price: 0, metadata: metadata as unknown as Prisma.InputJsonValue, source: 'INVITATION' },
    );

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: result.tickets.map((t) => t.id) } },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true,
        metadata: true, template: { select: { name: true, currency: true } },
      },
    });

    // Emails go out in the background: a large list would otherwise time out the request.
    // Each ticket's metadata.emailStatus tracks delivery, visible in the invitations list.
    this.deliver(event, tickets, cleanMessage).catch((err) =>
      this.logger.error(`Invitation delivery crashed for event ${eventId}: ${err?.message}`),
    );

    return {
      created: tickets.length,
      skipped,
      errors,
      invitations: tickets.map((t) => ({
        id: t.id,
        serialNumber: t.serialNumber,
        holderName: t.holderName,
        holderEmail: t.holderEmail,
        emailStatus: 'PENDING' as EmailStatus,
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
        startDate: true, endDate: true, city: true, venue: true,
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
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true,
        metadata: true, template: { select: { name: true, currency: true } },
      },
    });
    this.deliver(event, tickets, null).catch((err) =>
      this.logger.error(`Door invitation delivery crashed for event ${eventId}: ${err?.message}`),
    );

    return {
      created: tickets.length,
      templateName: template.name,
      guests: tickets.map((t) => ({ id: t.id, serialNumber: t.serialNumber, holderName: t.holderName })),
    };
  }

  async importInvitations(
    eventId: string,
    userId: string,
    role: Role,
    templateId: string,
    file: Express.Multer.File,
    message?: string | null,
  ) {
    // Check access before parsing so strangers can't probe the parser
    await this.loadEvent(eventId, userId, role);
    const guests = await this.parseGuestFile(file);
    return this.sendInvitations(eventId, userId, role, templateId, guests, message);
  }

  // ─── List / resend ────────────────────────────────────────────────────────

  async listInvitations(eventId: string, userId: string, role: Role) {
    await this.loadEvent(eventId, userId, role);
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, status: true,
        checkedInAt: true, createdAt: true, metadata: true,
        template: { select: { id: true, name: true } },
      },
    });

    return tickets.map((t) => {
      const meta = (t.metadata ?? {}) as Partial<InvitationMetadata>;
      return {
        id: t.id,
        serialNumber: t.serialNumber,
        holderName: t.holderName,
        holderEmail: t.holderEmail,
        status: t.status,
        checkedInAt: t.checkedInAt,
        createdAt: t.createdAt,
        template: t.template,
        emailStatus: meta.emailStatus ?? 'PENDING',
        emailSentAt: meta.emailSentAt ?? null,
      };
    });
  }

  async resendInvitation(eventId: string, ticketId: string, userId: string, role: Role) {
    const event = await this.loadEvent(eventId, userId, role);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, eventId, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
      select: {
        id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, status: true,
        metadata: true, template: { select: { name: true, currency: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Invitation introuvable');
    if (ticket.status === TicketStatus.CANCELLED) throw new BadRequestException('Cette invitation a été annulée');
    if (!ticket.holderEmail) throw new BadRequestException("Cette invitation n'a pas d'adresse email");

    const meta = (ticket.metadata ?? {}) as Partial<InvitationMetadata>;
    const status = await this.deliverOne(event, ticket, meta.message ?? null);
    if (status !== 'SENT') throw new BadRequestException("L'email n'a pas pu être envoyé. Réessayez plus tard.");
    return { emailStatus: status };
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
        startDate: true, endDate: true, city: true, venue: true,
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

  private async deliver(
    event: Awaited<ReturnType<InvitationsService['loadEvent']>>,
    tickets: Parameters<InvitationsService['deliverOne']>[1][],
    message: string | null,
  ) {
    let sent = 0;
    for (const t of tickets) {
      if ((await this.deliverOne(event, t, message)) === 'SENT') sent++;
    }
    this.logger.log(`Invitations for event ${event.id}: ${sent}/${tickets.length} emails sent`);
  }

  private async deliverOne(
    event: Awaited<ReturnType<InvitationsService['loadEvent']>>,
    ticket: {
      id: string; serialNumber: string; holderName: string | null; holderEmail: string | null;
      qrCode: string | null; metadata: Prisma.JsonValue;
      template: { name: string; currency: string };
    },
    message: string | null,
  ): Promise<EmailStatus> {
    let status: EmailStatus = 'FAILED';
    try {
      const sent = await this.publicService.sendConfirmationEmail(
        { holderName: ticket.holderName ?? '', holderEmail: ticket.holderEmail! },
        event,
        [{
          ticketId: ticket.id,
          serialNumber: ticket.serialNumber,
          templateName: ticket.template.name,
          price: 0,
          currency: ticket.template.currency,
          qrCode: ticket.qrCode,
        }],
        0,
        ticket.template.currency,
        event.bannerUrl,
        null,
        event.organizer,
        { message },
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
          ...(status === 'SENT' && { emailSentAt: new Date().toISOString() }),
        } as Prisma.InputJsonValue,
      },
    });
    return status;
  }

  /** Reads guests from .xlsx or .csv. Accepts a "Nom" column, or "Prénom" + "Nom". */
  private async parseGuestFile(file: Express.Multer.File): Promise<Guest[]> {
    if (!file) throw new BadRequestException('Aucun fichier reçu');

    const wb = new ExcelJS.Workbook();
    const isCsv = /\.csv$/i.test(file.originalname) || /csv/.test(file.mimetype);
    try {
      if (isCsv) {
        await wb.csv.read(Readable.from(file.buffer.toString('utf8').replace(/^\uFEFF/, '')));
      } else if (/\.xls$/i.test(file.originalname)) {
        throw new BadRequestException('Format .xls non pris en charge : enregistrez le fichier en .xlsx ou .csv');
      } else {
        await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Fichier invalide ou corrompu');
    }

    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Le fichier est vide');

    const normalize = (v: string) =>
      v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, '').trim().replace(/\s+/g, ' ');
    const ALIASES = {
      name: ['nom', 'name', 'nom complet', 'full name', 'invite', 'participant', 'prenom nom'],
      firstName: ['prenom', 'first name', 'firstname'],
      lastName: ['nom de famille', 'last name', 'lastname'],
      email: ['email', 'e-mail', 'mail', 'courriel', 'adresse email', 'adresse e-mail'],
    };

    const cols: Partial<Record<keyof typeof ALIASES, number>> = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const h = normalize(cell.text ?? '');
      for (const [field, aliases] of Object.entries(ALIASES) as [keyof typeof ALIASES, string[]][]) {
        if (cols[field] === undefined && aliases.includes(h)) cols[field] = col;
      }
    });
    if (cols.email === undefined) {
      throw new BadRequestException('Colonne "Email" introuvable dans la première ligne du fichier');
    }
    if (cols.name === undefined && cols.firstName === undefined && cols.lastName === undefined) {
      throw new BadRequestException('Colonne "Nom" introuvable dans la première ligne du fichier');
    }

    const guests: Guest[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const text = (col?: number) => (col ? (row.getCell(col).text ?? '').trim() : '');
      const name = [text(cols.firstName), text(cols.name) || text(cols.lastName)].filter(Boolean).join(' ');
      const email = text(cols.email);
      if (!name && !email) return; // blank line
      guests.push({ name, email, row: rowNumber });
    });

    if (!guests.length) throw new BadRequestException('Aucun invité trouvé dans le fichier');
    if (guests.length > MAX_GUESTS_PER_BATCH) {
      throw new BadRequestException(`Maximum ${MAX_GUESTS_PER_BATCH} invités par import`);
    }
    return guests;
  }
}
