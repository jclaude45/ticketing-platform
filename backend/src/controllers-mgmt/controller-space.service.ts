import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ScanResult, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

    const [checkedIn, myScans, myValidScans] = await Promise.all([
      this.prisma.ticket.count({ where: { eventId, status: TicketStatus.USED } }),
      this.countMyScans(controllerId, eventId),
      this.countMyScans(controllerId, eventId, ScanResult.VALID),
    ]);

    return {
      ...assignment.event,
      assignedAt: assignment.assignedAt,
      stats: { checkedIn, myScans, myValidScans },
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
