import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateTicketTemplateDto } from './dto/create-ticket-template.dto';
import { Role } from '@prisma/client';
import { assertCapacityPerDay, eventDays, normalizeValidDays } from './event-days';

@Injectable()
export class TicketTemplateService {
  private readonly logger = new Logger(TicketTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async create(eventId: string, organizerId: string, organizerRole: Role, dto: CreateTicketTemplateDto) {
    // Verify event exists and belongs to organizer
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('You can only add templates to your own events');
    }

    // Seats are counted per day of the event (tariffs of different days don't add up)
    const days = eventDays(event.startDate, event.endDate);
    const validDays = normalizeValidDays(dto.validDays, days);
    const existingTemplates = await this.prisma.ticketTemplate.findMany({
      where: { eventId },
      select: { quantity: true, validDays: true },
    });
    assertCapacityPerDay([...existingTemplates, { quantity: dto.quantity, validDays }], days, event.totalCapacity);

    const template = await this.prisma.ticketTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency || 'USD',
        quantity: dto.quantity,
        availableCount: dto.quantity,
        color: dto.color || '#1a1a2e',
        logoUrl: dto.logoUrl,
        backgroundUrl: dto.backgroundUrl,
        customFields: dto.customFields,
        validDays,
        eventId,
      },
    });

    await this.redisService.cacheDelete(`event:${eventId}`);
    return template;
  }

  async findAllForEvent(eventId: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.ticketTemplate.findMany({
      where: { eventId },
      include: {
        _count: { select: { tickets: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(templateId: string, organizerId: string, organizerRole: Role) {
    const template = await this.prisma.ticketTemplate.findUnique({
      where: { id: templateId },
      include: {
        event: { select: { id: true, name: true, organizerId: true } },
        _count: { select: { tickets: true } },
      },
    });

    if (!template) throw new NotFoundException('Template not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && template.event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    return template;
  }

  async update(
    templateId: string,
    organizerId: string,
    organizerRole: Role,
    dto: Partial<CreateTicketTemplateDto>,
  ) {
    const template = await this.prisma.ticketTemplate.findUnique({
      where: { id: templateId },
      include: { event: { select: { organizerId: true, totalCapacity: true, startDate: true, endDate: true } } },
    });

    if (!template) throw new NotFoundException('Template not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && template.event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const days = eventDays(template.event.startDate, template.event.endDate);
    const validDays = dto.validDays !== undefined ? normalizeValidDays(dto.validDays, days) : template.validDays;
    const daysChanged = dto.validDays !== undefined && validDays.join() !== template.validDays.join();

    // Check capacity (per day) if the quantity or the days change
    if ((dto.quantity && dto.quantity !== template.quantity) || daysChanged) {
      const others = await this.prisma.ticketTemplate.findMany({
        where: { eventId: template.eventId, NOT: { id: templateId } },
        select: { quantity: true, validDays: true },
      });
      assertCapacityPerDay([...others, { quantity: dto.quantity || template.quantity, validDays }], days, template.event.totalCapacity);
    }

    // Phones keep an offline list of tickets refreshed by date of change: touch the
    // tickets of this tariff so their new days reach the scanners
    if (daysChanged) {
      await this.prisma.ticket.updateMany({ where: { templateId }, data: { updatedAt: new Date() } });
    }

    if (dto.quantity && dto.quantity !== template.quantity) {

      // Update available count proportionally
      const generatedCount = template.quantity - template.availableCount;
      const newAvailable = Math.max(0, dto.quantity - generatedCount);
      await this.prisma.ticketTemplate.update({
        where: { id: templateId },
        data: { availableCount: newAvailable },
      });
    }

    return this.prisma.ticketTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.quantity && { quantity: dto.quantity }),
        ...(dto.color && { color: dto.color }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.backgroundUrl !== undefined && { backgroundUrl: dto.backgroundUrl }),
        ...(dto.customFields !== undefined && { customFields: dto.customFields }),
        ...(dto.validDays !== undefined && { validDays }),
      },
    });
  }

  async delete(templateId: string, organizerId: string, organizerRole: Role) {
    const template = await this.prisma.ticketTemplate.findUnique({
      where: { id: templateId },
      include: {
        event: { select: { organizerId: true } },
        _count: { select: { tickets: true } },
      },
    });

    if (!template) throw new NotFoundException('Template not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && template.event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    if (template._count.tickets > 0) {
      throw new BadRequestException(
        'Cannot delete a template that has generated tickets. Cancel the tickets first.',
      );
    }

    await this.prisma.ticketTemplate.delete({ where: { id: templateId } });
    return { message: 'Template deleted successfully' };
  }
}
