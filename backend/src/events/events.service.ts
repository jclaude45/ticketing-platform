import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventStatus, Role } from '@prisma/client';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly subscriptionService: SubscriptionService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(organizerId: string, dto: CreateEventDto) {
    if (new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('End date must be after start date');
    }
    await this.subscriptionService.checkEventCreation(organizerId);

    const event = await this.prisma.event.create({
      data: {
        name: dto.name,
        description: dto.description,
        venue: dto.venue,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        totalCapacity: dto.totalCapacity,
        status: dto.status || EventStatus.DRAFT,
        bannerUrl: dto.bannerUrl,
        organizerId,
      },
      include: {
        organizer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { tickets: true, ticketTemplates: true },
        },
      },
    });

    await this.redisService.cacheDeletePattern(`events:${organizerId}:*`);
    return event;
  }

  async findAll(
    organizerId: string,
    organizerRole: Role,
    rawPage?: number | string,
    rawLimit?: number | string,
    status?: EventStatus,
    search?: string,
  ) {
    const page = Math.max(1, parseInt(String(rawPage ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(rawLimit ?? '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const where: any = { AND: [] };

    // Non-admins see their own events + events they're a ProjectMember of
    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN) {
      where.AND.push({
        OR: [
          { organizerId: organizerId },
          { projectMembers: { some: { userId: organizerId } } },
        ],
      });
    }

    if (status) where.AND.push({ status });
    if (search) {
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { venue: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        include: {
          organizer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { tickets: true, ticketTemplates: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        ticketTemplates: true,
        _count: {
          select: { tickets: true },
        },
      },
    });

    if (!event) throw new NotFoundException('Event not found');

    if (requesterRole !== Role.ADMIN && requesterRole !== Role.SUPER_ADMIN && event.organizerId !== requesterId) {
      // Also allow ProjectMembers
      const membership = await this.prisma.projectMember.findUnique({
        where: { eventId_userId: { eventId: id, userId: requesterId } },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this event');
    }

    return event;
  }

  async update(id: string, organizerId: string, organizerRole: Role, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      const membership = await this.prisma.projectMember.findUnique({
        where: { eventId_userId: { eventId: id, userId: organizerId } },
      });
      if (!membership || membership.projectRole !== 'MANAGER') {
        throw new ForbiddenException('You can only update your own events');
      }
    }

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled event');
    }

    if (dto.startDate && dto.endDate && new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('End date must be after start date');
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.venue && { venue: dto.venue }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city && { city: dto.city }),
        ...(dto.country && { country: dto.country }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.totalCapacity && { totalCapacity: dto.totalCapacity }),
        ...(dto.status && { status: dto.status }),
        ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
      },
      include: {
        organizer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        ticketTemplates: true,
        _count: { select: { tickets: true } },
      },
    });

    await this.redisService.cacheDelete(`event:${id}`);
    await this.redisService.cacheDeletePattern(`events:${event.organizerId}:*`);
    return updated;
  }

  async publish(id: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { _count: { select: { ticketTemplates: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('You can only publish your own events');
    }

    if (event.status !== EventStatus.DRAFT) {
      throw new BadRequestException('Only draft events can be published');
    }

    if (event._count.ticketTemplates === 0) {
      throw new BadRequestException('Cannot publish event without ticket templates');
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PUBLISHED },
    });

    await this.redisService.cacheDelete(`event:${id}`);

    await this.notificationsService.create(organizerId, {
      title: 'Événement publié',
      message: `"${updated.name}" est maintenant en ligne.`,
      type: 'success',
      link: `/dashboard/events/${id}`,
    });

    return updated;
  }

  async cancel(id: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('You can only cancel your own events');
    }

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled');
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
    });

    // Cancel all pending/valid tickets
    await this.prisma.ticket.updateMany({
      where: { eventId: id, status: { in: ['PENDING', 'VALID'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await this.redisService.cacheDelete(`event:${id}`);

    await this.notificationsService.create(organizerId, {
      title: 'Événement annulé',
      message: `"${updated.name}" a été annulé.`,
      type: 'warning',
      link: `/dashboard/events/${id}`,
    });

    return updated;
  }

  async duplicate(id: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { ticketTemplates: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('You can only duplicate your own events');
    }

    // Create duplicated event as draft
    const newEvent = await this.prisma.event.create({
      data: {
        name: `${event.name} (Copy)`,
        description: event.description,
        venue: event.venue,
        address: event.address,
        city: event.city,
        country: event.country,
        startDate: event.startDate,
        endDate: event.endDate,
        totalCapacity: event.totalCapacity,
        status: EventStatus.DRAFT,
        bannerUrl: event.bannerUrl,
        organizerId: event.organizerId,
      },
    });

    // Duplicate ticket templates
    if (event.ticketTemplates.length > 0) {
      await this.prisma.ticketTemplate.createMany({
        data: event.ticketTemplates.map((tmpl) => ({
          name: tmpl.name,
          description: tmpl.description,
          price: tmpl.price,
          currency: tmpl.currency,
          quantity: tmpl.quantity,
          availableCount: tmpl.quantity,
          color: tmpl.color,
          logoUrl: tmpl.logoUrl,
          backgroundUrl: tmpl.backgroundUrl,
          customFields: tmpl.customFields as any,
          eventId: newEvent.id,
        })),
      });
    }

    return newEvent;
  }

  async delete(id: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('You can only delete your own events');
    }

    // Delete in dependency order — Ticket and ScanValidation lack onDelete:Cascade.
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete scan validations linked to tickets of this event
      await tx.scanValidation.deleteMany({
        where: { ticket: { eventId: id } },
      });
      // 2. Delete tickets
      await tx.ticket.deleteMany({ where: { eventId: id } });
      // 3. Delete the event (TicketTemplate + ControllerEvent cascade automatically)
      await tx.event.delete({ where: { id } });
    });

    await this.redisService.cacheDelete(`event:${id}`);
    await this.redisService.cacheDeletePattern(`events:${event.organizerId}:*`);

    return { message: 'Event deleted successfully' };
  }

  async getStats(eventId: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const [totalTickets, validTickets, usedTickets, cancelledTickets, fraudulentTickets, scanCount] =
      await Promise.all([
        this.prisma.ticket.count({ where: { eventId } }),
        this.prisma.ticket.count({ where: { eventId, status: 'VALID' } }),
        this.prisma.ticket.count({ where: { eventId, status: 'USED' } }),
        this.prisma.ticket.count({ where: { eventId, status: 'CANCELLED' } }),
        this.prisma.ticket.count({ where: { eventId, status: 'FRAUDULENT' } }),
        this.prisma.scanValidation.count({ where: { ticket: { eventId } } }),
      ]);

    const checkInRate = totalTickets > 0 ? Math.round((usedTickets / totalTickets) * 100) : 0;
    const soldRate = totalTickets > 0 ? Math.round((totalTickets / event.totalCapacity) * 100) : 0;

    return {
      eventId,
      eventName: event.name,
      capacity: event.totalCapacity,
      soldRate,
      checkInRate,
      tickets: {
        total: totalTickets,
        valid: validTickets,
        used: usedTickets,
        cancelled: cancelledTickets,
        fraudulent: fraudulentTickets,
      },
      scans: scanCount,
    };
  }
}
