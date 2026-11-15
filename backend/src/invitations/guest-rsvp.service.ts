import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tariffLabel } from '../tickets/event-days';
import { INVITATION_SOURCE, InvitationsService } from './invitations.service';
import { cleanAnswers, countTaken, fieldsFor, ticketIdFromToken, type FormField } from './guest-form';
import { GuestAnswerDto, OpenSignUpDto } from './dto/guest-form.dto';
import { assertMailDomain } from '../common/email/mail-domain';
import { TicketGenerationService } from '../tickets/ticket-generation.service';

const PHONE_RE = /^\+?[0-9][0-9 .-]{5,18}[0-9]$/;

/**
 * The guest's own confirmation page (zaya.live/invitation/<token>): no account, the signed
 * link is the key. Confirming makes the ticket valid and e-mails it; declining gives the seat
 * back. Answers can change until the deadline (or the start of the event).
 */
@Injectable()
export class GuestRsvpService {
  private readonly logger = new Logger(GuestRsvpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
    private readonly config: ConfigService,
    private readonly ticketGeneration: TicketGenerationService,
  ) {}

  async getPage(token: string) {
    const { ticket, event, form } = await this.load(token);
    const fields = fieldsFor((form?.fields ?? []) as unknown as FormField[], ticket.templateId);
    const confirmed = await this.prisma.guestResponse.findMany({
      where: { eventId: event.id, status: 'CONFIRMED' },
      select: { ticketId: true, answers: true },
    });
    const taken = countTaken(fields, confirmed, ticket.id);
    const appBase = this.config.get<string>('APP_BASE_URL') || '';

    return {
      event: {
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        timeZone: event.timeZone,
        venue: event.venue,
        address: event.address,
        city: event.city,
        bannerUrl: event.bannerUrl?.replace(/^https?:\/\/localhost:\d+/, appBase) ?? null,
        organizer: `${event.organizer.firstName} ${event.organizer.lastName}`.trim(),
      },
      guest: {
        name: ticket.holderName,
        email: ticket.holderEmail,
        phone: ticket.holderPhone,
        category: tariffLabel(ticket.template.name, ticket.template.validDays),
        // Paper invitation made without an address: the guest gives it to get the ticket
        emailEditable: !ticket.holderEmail,
      },
      form: {
        intro: form?.intro ?? null,
        askPhone: form?.askPhone ?? 'OPTIONAL',
        deadline: this.deadline(form, event),
        fields: fields.map((f) => ({
          ...f,
          templateIds: undefined,
          // Places left of each limited option: the guest's own choice counts as theirs
          options: f.options?.map((o) => ({
            id: o.id,
            label: o.label,
            ...(o.limit && { left: Math.max(0, o.limit - (taken[f.id]?.[o.id] ?? 0)) }),
          })),
        })),
      },
      answer: ticket.guestResponse
        ? { status: ticket.guestResponse.status, answers: ticket.guestResponse.answers, updatedAt: ticket.guestResponse.updatedAt }
        : null,
      state: this.state(ticket, event, form),
      ticketSent: ticket.status === TicketStatus.VALID || ticket.status === TicketStatus.USED,
    };
  }

  async answer(token: string, dto: GuestAnswerDto) {
    const { ticket, event, form } = await this.load(token);
    const state = this.state(ticket, event, form);
    if (state === 'CLOSED') throw new BadRequestException('Les réponses sont closes pour cette invitation');
    if (state === 'CANCELLED') throw new BadRequestException("Cette invitation a été annulée par l'organisateur");
    if (state === 'USED') throw new BadRequestException('Vous êtes déjà entré(e) à cet événement');

    const askPhone = form?.askPhone ?? 'OPTIONAL';
    const name = dto.name?.trim() || ticket.holderName || '';
    const phone = askPhone === 'HIDDEN' ? ticket.holderPhone : dto.phone?.trim() || null;
    // Paper invitation made without an address: the ticket goes to the one the guest gives
    const email = ticket.holderEmail ?? (dto.email?.trim().toLowerCase() || null);
    if (dto.attending) {
      if (!name) throw new BadRequestException('Indiquez votre nom');
      if (!email) throw new BadRequestException('Indiquez votre adresse e-mail : votre billet y sera envoyé');
      if (!ticket.holderEmail) {
        await assertMailDomain(email);
        await this.assertNotInvited(event.id, email, ticket.id);
      }
      if (askPhone === 'REQUIRED' && !phone) throw new BadRequestException('Indiquez votre numéro de téléphone');
      if (phone && !PHONE_RE.test(phone)) throw new BadRequestException('Numéro de téléphone invalide');
    }
    const fields = fieldsFor((form?.fields ?? []) as unknown as FormField[], ticket.templateId);

    const before = ticket.status;
    await this.prisma.$transaction(async (tx) => {
      // One answer at a time per event: two guests cannot take the last place of an option
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rsvp:${event.id}`}, 0))`;
      const current = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true } });
      if (current.status !== before) throw new BadRequestException('Votre invitation vient de changer : rechargez la page');

      if (dto.attending) {
        const confirmed = await tx.guestResponse.findMany({
          where: { eventId: event.id, status: 'CONFIRMED' },
          select: { ticketId: true, answers: true },
        });
        const answers = cleanAnswers(dto.answers, fields, countTaken(fields, confirmed, ticket.id));
        // Declined before: the seat was given back, it is taken again if one is left
        if (current.status === TicketStatus.CANCELLED) {
          const seat = await tx.ticketTemplate.updateMany({
            where: { id: ticket.templateId, availableCount: { gte: 1 } },
            data: { availableCount: { decrement: 1 } },
          });
          if (seat.count === 0) throw new BadRequestException("Il n'y a plus de place pour cette invitation");
        }
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { status: TicketStatus.VALID, cancelledAt: null, holderName: name, holderPhone: phone, holderEmail: email },
        });
        await tx.guestResponse.upsert({
          where: { ticketId: ticket.id },
          create: { ticketId: ticket.id, eventId: event.id, status: 'CONFIRMED', answers: answers as Prisma.InputJsonValue },
          update: { status: 'CONFIRMED', answers: answers as Prisma.InputJsonValue },
        });
      } else {
        if (current.status === TicketStatus.INVITED || current.status === TicketStatus.VALID) {
          await tx.ticket.update({ where: { id: ticket.id }, data: { status: TicketStatus.CANCELLED, cancelledAt: new Date() } });
          await tx.ticketTemplate.update({ where: { id: ticket.templateId }, data: { availableCount: { increment: 1 } } });
        }
        await tx.guestResponse.upsert({
          where: { ticketId: ticket.id },
          create: { ticketId: ticket.id, eventId: event.id, status: 'DECLINED', answers: {} },
          update: { status: 'DECLINED', answers: {} },
        });
      }
    });

    // Just confirmed: the ticket goes out (in the background, the page answers at once)
    if (dto.attending && before !== TicketStatus.VALID) {
      this.sendTicket(ticket.id, event.id).catch((err) =>
        this.logger.error(`Ticket e-mail after confirmation failed for ${ticket.id}: ${err?.message}`),
      );
    }
    return this.getPage(token);
  }

  // ─── Shared link (one QR for everyone) ──────────────────────────────────────

  async getOpenPage(token: string) {
    const { event, form } = await this.loadOpen(token);
    const fields = fieldsFor((form.fields ?? []) as unknown as FormField[], form.openTemplateId!);
    const [confirmed, signUps, template] = await Promise.all([
      this.prisma.guestResponse.findMany({ where: { eventId: event.id, status: 'CONFIRMED' }, select: { ticketId: true, answers: true } }),
      this.invitations.openSignUps(event.id),
      this.prisma.ticketTemplate.findUnique({ where: { id: form.openTemplateId! }, select: { name: true, validDays: true, availableCount: true } }),
    ]);
    const taken = countTaken(fields, confirmed);
    const left = Math.min(template?.availableCount ?? 0, form.openLimit ? form.openLimit - signUps : Infinity);
    const appBase = this.config.get<string>('APP_BASE_URL') || '';
    return {
      event: {
        name: event.name, startDate: event.startDate, endDate: event.endDate, timeZone: event.timeZone,
        venue: event.venue, address: event.address, city: event.city,
        bannerUrl: event.bannerUrl?.replace(/^https?:\/\/localhost:\d+/, appBase) ?? null,
        organizer: `${event.organizer.firstName} ${event.organizer.lastName}`.trim(),
      },
      category: template ? tariffLabel(template.name, template.validDays) : '',
      form: {
        intro: form.intro, askPhone: form.askPhone, deadline: this.deadline(form, event),
        fields: fields.map((f) => ({
          ...f,
          templateIds: undefined,
          options: f.options?.map((o) => ({ id: o.id, label: o.label, ...(o.limit && { left: Math.max(0, o.limit - (taken[f.id]?.[o.id] ?? 0)) }) })),
        })),
      },
      state: event.status === 'CANCELLED' ? 'CANCELLED'
        : Date.now() >= this.deadline(form, event).getTime() ? 'CLOSED'
        : left <= 0 ? 'FULL' : 'OPEN',
    };
  }

  /**
   * A guest signs up through the shared link: a confirmed invitation (ticket e-mailed with the
   * link to change the answer). One at a time per event, so the limits cannot be overrun.
   */
  async openSignUp(token: string, dto: OpenSignUpDto) {
    const { event, form } = await this.loadOpen(token);
    return this.oneAtATime(event.id, async () => {
      const page = await this.getOpenPage(token);
      if (page.state === 'CLOSED') throw new BadRequestException('Les inscriptions sont closes');
      if (page.state === 'FULL') throw new BadRequestException("Il n'y a plus de place pour cette invitation");
      if (page.state !== 'OPEN') throw new BadRequestException("Cette invitation n'est plus disponible");

      const name = dto.name.trim();
      const email = dto.email.trim().toLowerCase();
      const phone = form.askPhone === 'HIDDEN' ? null : dto.phone?.trim() || null;
      if (form.askPhone === 'REQUIRED' && !phone) throw new BadRequestException('Indiquez votre numéro de téléphone');
      if (phone && !PHONE_RE.test(phone)) throw new BadRequestException('Numéro de téléphone invalide');
      await assertMailDomain(email);
      await this.assertNotInvited(event.id, email);

      const fields = fieldsFor((form.fields ?? []) as unknown as FormField[], form.openTemplateId!);
      const confirmed = await this.prisma.guestResponse.findMany({ where: { eventId: event.id, status: 'CONFIRMED' }, select: { ticketId: true, answers: true } });
      const answers = cleanAnswers(dto.answers, fields, countTaken(fields, confirmed));

      let created: { id: string };
      try {
        const result = await this.ticketGeneration.generateTickets(
          event.id, event.organizerId, Role.ORGANIZER,
          { templateId: form.openTemplateId!, holders: [{ holderName: name, holderEmail: email, holderPhone: phone ?? undefined }] },
          {
            price: 0, source: 'INVITATION',
            metadata: {
              source: INVITATION_SOURCE, invitedBy: 'OPEN_LINK', openLink: true,
              invitedAt: new Date().toISOString(), message: null, emailStatus: 'PENDING',
            } as Prisma.InputJsonValue,
          },
        );
        created = result.tickets[0];
      } catch (err: any) {
        // Out of seats or of the organizer's print quota: the guest cannot fix it
        if (err?.status === 402 || /stock|places|quota/i.test(err?.message ?? '')) {
          throw new BadRequestException("Il n'y a plus de place pour cette invitation");
        }
        throw err;
      }
      await this.prisma.guestResponse.create({
        data: { ticketId: created.id, eventId: event.id, status: 'CONFIRMED', answers: answers as Prisma.InputJsonValue },
      });
      this.sendTicket(created.id, event.id).catch((e) =>
        this.logger.error(`Ticket e-mail after open sign-up failed for ${created.id}: ${e?.message}`),
      );
      return { ok: true, email };
    });
  }

  private async loadOpen(token: string) {
    const form = token ? await this.prisma.guestForm.findUnique({ where: { openToken: String(token) } }) : null;
    if (!form || !form.openEnabled || !form.openTemplateId) throw new NotFoundException('Invitation introuvable');
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: form.eventId },
      select: {
        id: true, name: true, status: true, startDate: true, endDate: true, timeZone: true, organizerId: true,
        venue: true, address: true, city: true, bannerUrl: true,
        organizer: { select: { firstName: true, lastName: true } },
      },
    });
    return { event, form };
  }

  /** One invitation per address and event (the guest already invited uses the link they received) */
  private async assertNotInvited(eventId: string, email: string, exceptTicketId?: string) {
    const other = await this.prisma.ticket.count({
      where: {
        eventId, holderEmail: email, status: { not: TicketStatus.CANCELLED },
        metadata: { path: ['source'], equals: INVITATION_SOURCE },
        ...(exceptTicketId && { id: { not: exceptTicketId } }),
      },
    });
    if (other) throw new ConflictException('Cette adresse e-mail a déjà une invitation pour cet événement : utilisez le lien reçu par e-mail');
  }

  /** Sign-ups of one event run one after the other (one backend process) */
  private queues = new Map<string, Promise<unknown>>();
  private oneAtATime<T>(key: string, job: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(job);
    const tail = run.catch(() => undefined);
    this.queues.set(key, tail);
    tail.then(() => { if (this.queues.get(key) === tail) this.queues.delete(key); });
    return run;
  }

  private async sendTicket(ticketId: string, eventId: string) {
    const [event, ticket] = await Promise.all([
      this.invitations.eventForMail(eventId),
      this.prisma.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: {
          id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, status: true,
          metadata: true, template: { select: { name: true, currency: true, validDays: true } },
        },
      }),
    ]);
    if (!ticket.holderEmail) return;
    const message = (ticket.metadata as { message?: string | null } | null)?.message ?? null;
    await this.invitations.deliverOne(event, ticket, message);
  }

  private async load(token: string) {
    const ticketId = ticketIdFromToken(token);
    if (!ticketId) throw new NotFoundException('Invitation introuvable');
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, metadata: { path: ['source'], equals: INVITATION_SOURCE } },
      select: {
        id: true, status: true, holderName: true, holderEmail: true, holderPhone: true,
        checkedInAt: true, templateId: true, eventId: true,
        template: { select: { name: true, validDays: true } },
        guestResponse: { select: { status: true, answers: true, updatedAt: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Invitation introuvable');
    const [event, form] = await Promise.all([
      this.prisma.event.findUniqueOrThrow({
        where: { id: ticket.eventId },
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true, timeZone: true,
          venue: true, address: true, city: true, bannerUrl: true,
          organizer: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.guestForm.findUnique({ where: { eventId: ticket.eventId } }),
    ]);
    return { ticket, event, form };
  }

  /** Answers are taken until the organizer's deadline, or else until the event starts */
  private deadline(form: { deadline: Date | null } | null, event: { startDate: Date }) {
    return form?.deadline ?? event.startDate;
  }

  private state(
    ticket: { status: TicketStatus; checkedInAt: Date | null; guestResponse: { status: string } | null },
    event: { status: string; startDate: Date; endDate: Date },
    form: { deadline: Date | null } | null,
  ): 'OPEN' | 'CLOSED' | 'CANCELLED' | 'USED' {
    if (ticket.status === TicketStatus.USED || ticket.checkedInAt) return 'USED';
    // Cancelled without the guest declining: the organizer withdrew the invitation
    if (event.status === 'CANCELLED') return 'CANCELLED';
    if (ticket.status === TicketStatus.CANCELLED && ticket.guestResponse?.status !== 'DECLINED') return 'CANCELLED';
    if (ticket.status === TicketStatus.FRAUDULENT) return 'CANCELLED';
    if (Date.now() >= this.deadline(form, event).getTime()) return 'CLOSED';
    return 'OPEN';
  }
}
