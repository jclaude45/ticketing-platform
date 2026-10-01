import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ScanResult, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_LABELS } from '../shop/shop.service';
import { MerchLookupDto } from './dto/merch-lookup.dto';
import { AddGuestDto } from './dto/add-guest.dto';
import { InvitationsService } from '../invitations/invitations.service';

const HANDABLE_STATUSES = ['PAID', 'READY'];

/** Only what a controller needs at the door — never revenue, ticket lists or guest contacts. */
const EVENT_FIELDS = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  venue: true,
  address: true,
  city: true,
  bannerUrl: true,
} as const;

@Injectable()
export class ControllerSpaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
  ) {}

  async getProfile(controllerId: string) {
    const controller = await this.prisma.controller.findUnique({
      where: { id: controllerId },
      select: {
        id: true, name: true, email: true,
        organizer: { select: { firstName: true, lastName: true } },
      },
    });
    return {
      id: controller.id,
      name: controller.name,
      email: controller.email,
      organizerName: `${controller.organizer.firstName} ${controller.organizer.lastName}`.trim(),
    };
  }

  async listEvents(controllerId: string) {
    const assignments = await this.prisma.controllerEvent.findMany({
      where: { controllerId },
      select: { assignedAt: true, event: { select: EVENT_FIELDS } },
      orderBy: { event: { startDate: 'asc' } },
    });
    return assignments.map((a) => ({ ...a.event, assignedAt: a.assignedAt }));
  }

  async getEvent(controllerId: string, eventId: string) {
    const assignment = await this.prisma.controllerEvent.findUnique({
      where: { controllerId_eventId: { controllerId, eventId } },
      // No banner here: this view is polled and base64 banners weigh ~100KB+
      select: { assignedAt: true, event: { select: { ...EVENT_FIELDS, bannerUrl: false } } },
    });
    if (!assignment) throw new ForbiddenException("Vous n'êtes pas assigné(e) à cet événement");

    const [checkedIn, totalTickets, myScans, myValidScans] = await Promise.all([
      this.prisma.ticket.count({ where: { eventId, status: TicketStatus.USED } }),
      this.prisma.ticket.count({ where: { eventId, status: { in: [TicketStatus.VALID, TicketStatus.USED] } } }),
      this.countMyScans(controllerId, eventId),
      this.countMyScans(controllerId, eventId, ScanResult.VALID),
    ]);

    return {
      ...assignment.event,
      assignedAt: assignment.assignedAt,
      stats: { checkedIn, totalTickets, myScans, myValidScans },
    };
  }

  /**
   * Offline pack: the event's tickets so the scanner app can validate without network.
   * Only what the door needs — no email, no price. With `since`, just the tickets changed
   * after that time (status updates, new sales), to refresh a pack already downloaded.
   */
  async offlineTickets(controllerId: string, eventId: string, since?: string) {
    await this.getAssignment(controllerId, eventId);
    const sinceDate = since ? new Date(since) : null;
    if (since && isNaN(sinceDate.getTime())) throw new BadRequestException('Paramètre "since" invalide');

    const generatedAt = new Date();
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, ...(sinceDate && { updatedAt: { gt: sinceDate } }) },
      select: {
        id: true, serialNumber: true, holderName: true, status: true, checkedInAt: true,
        template: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      generatedAt,
      full: !sinceDate,
      tickets: tickets.map((t) => ({
        id: t.id,
        serialNumber: t.serialNumber,
        holderName: t.holderName,
        templateName: t.template.name,
        status: t.status,
        checkedInAt: t.checkedInAt,
      })),
    };
  }

  /** "Ajouter invité" from the app: free invitation tickets, emailed to the guest. */
  async addGuest(controllerId: string, eventId: string, dto: AddGuestDto) {
    await this.getAssignment(controllerId, eventId);
    return this.invitations.inviteAtDoor(eventId, controllerId, dto);
  }

  // ─── Merchandise pickup at the stand ──────────────────────────────────────

  /** Finds a pickup order from its QR (`{"mo": id, "c": code}`) or its typed code. */
  async lookupMerchOrder(controllerId: string, eventId: string, dto: MerchLookupDto) {
    await this.getAssignment(controllerId, eventId);
    let where: { id?: string; code: string } | null = null;
    if (dto.qrContent) {
      try {
        const raw = JSON.parse(dto.qrContent);
        if (typeof raw?.mo === 'string' && typeof raw?.c === 'string') where = { id: raw.mo, code: raw.c };
      } catch {
        // not JSON: maybe the code itself was encoded
      }
      where ??= { code: dto.qrContent.trim().toUpperCase() };
    } else if (dto.code) {
      // "B-7K3P9Q", "b7k3p9q" or just "7K3P9Q" (the 6 characters can start with a B too)
      const raw = dto.code.toUpperCase().replace(/[\s-]/g, '');
      where = { code: `B-${raw.length === 7 && raw.startsWith('B') ? raw.slice(1) : raw}` };
    }
    if (!where) throw new BadRequestException('QR code ou code de commande requis');

    const order = await this.prisma.merchOrder.findFirst({ where: { ...where, eventId }, include: { items: true } });
    if (!order) throw new NotFoundException("Aucune commande de la boutique ne correspond pour cet événement");
    return this.serializePickup(order);
  }

  /** Hands a paid pickup order over; atomic so two stands can't give it out twice. */
  async handOverMerchOrder(controllerId: string, eventId: string, orderId: string) {
    await this.getAssignment(controllerId, eventId);
    const claimed = await this.prisma.merchOrder.updateMany({
      where: { id: orderId, eventId, fulfillment: 'PICKUP', status: { in: HANDABLE_STATUSES } },
      data: { status: 'PICKED_UP', fulfilledAt: new Date() },
    });
    const order = await this.prisma.merchOrder.findFirst({ where: { id: orderId, eventId }, include: { items: true } });
    if (!order) throw new NotFoundException('Commande introuvable');
    if (claimed.count === 0) {
      const reason = this.serializePickup(order).refusal;
      throw new BadRequestException(reason ?? 'Cette commande ne peut pas être remise');
    }
    return this.serializePickup(order);
  }

  /** What the stand needs: who, what, and whether it can be handed over (no email, no amounts). */
  private serializePickup(order: {
    id: string; code: string; buyerName: string; fulfillment: string; status: string;
    paidAt: Date | null; fulfilledAt: Date | null;
    items: { productName: string; size: string | null; color: string | null; quantity: number }[];
  }) {
    let refusal: string | null = null;
    if (order.fulfillment !== 'PICKUP') refusal = 'Cette commande est à livrer, pas à retirer au stand.';
    else if (order.status === 'PICKED_UP') refusal = 'Cette commande a déjà été remise.';
    else if (order.status === 'PENDING_PAYMENT') refusal = "Cette commande n'est pas payée.";
    else if (order.status === 'CANCELLED') refusal = 'Cette commande a été annulée.';
    else if (!HANDABLE_STATUSES.includes(order.status)) refusal = 'Cette commande ne peut pas être remise.';
    return {
      id: order.id,
      code: order.code,
      buyerName: order.buyerName,
      fulfillment: order.fulfillment,
      status: order.status,
      statusLabel: STATUS_LABELS[order.status] ?? order.status,
      paidAt: order.paidAt,
      fulfilledAt: order.fulfilledAt,
      canHandOver: refusal === null,
      refusal,
      items: order.items.map((i) => ({ productName: i.productName, size: i.size, color: i.color, quantity: i.quantity })),
    };
  }

  async listMyScans(controllerId: string, eventId: string, page = 1, limit = 50) {
    await this.getAssignment(controllerId, eventId);
    page = Math.max(1, Number(page) || 1);
    limit = Math.min(200, Math.max(1, Number(limit) || 50));

    const where = this.myScansWhere(controllerId, eventId);
    const [scans, total] = await Promise.all([
      this.prisma.scanValidation.findMany({
        where,
        orderBy: { scannedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, result: true, scannedAt: true,
          ticket: { select: { serialNumber: true, holderName: true, template: { select: { name: true } } } },
        },
      }),
      this.prisma.scanValidation.count({ where }),
    ]);

    return {
      data: scans.map((s) => ({
        id: s.id,
        result: s.result,
        scannedAt: s.scannedAt,
        serialNumber: s.ticket?.serialNumber ?? null,
        holderName: s.ticket?.holderName ?? null,
        templateName: s.ticket?.template?.name ?? null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async getAssignment(controllerId: string, eventId: string) {
    const assignment = await this.prisma.controllerEvent.findUnique({
      where: { controllerId_eventId: { controllerId, eventId } },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException("Vous n'êtes pas assigné(e) à cet événement");
    return assignment;
  }

  // Scans with an unreadable QR have no ticket, so they can't be tied to an event — count only
  // scans that resolved to a ticket of this event.
  private myScansWhere(controllerId: string, eventId: string, result?: ScanResult) {
    return { controllerId, ticket: { eventId }, ...(result && { result }) };
  }

  private countMyScans(controllerId: string, eventId: string, result?: ScanResult) {
    return this.prisma.scanValidation.count({ where: this.myScansWhere(controllerId, eventId, result) });
  }
}
