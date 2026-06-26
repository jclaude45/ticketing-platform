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

    // Check if total template capacity exceeds event capacity
    const existingTemplates = await this.prisma.ticketTemplate.findMany({
      where: { eventId },
      select: { quantity: true },
    });
    const existingTotal = existingTemplates.reduce((sum, t) => sum + t.quantity, 0);
    if (existingTotal + dto.quantity > event.totalCapacity) {
      throw new BadRequestException(
        `Total ticket quantity (${existingTotal + dto.quantity}) would exceed event capacity (${event.totalCapacity})`,
      );
    }

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
      include: { event: { select: { organizerId: true, totalCapacity: true } } },
    });

    if (!template) throw new NotFoundException('Template not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && template.event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    // Check capacity if quantity is being changed
    if (dto.quantity && dto.quantity !== template.quantity) {
      const existingTemplates = await this.prisma.ticketTemplate.findMany({
        where: { eventId: template.eventId, NOT: { id: templateId } },
        select: { quantity: true },
      });
      const otherTotal = existingTemplates.reduce((sum, t) => sum + t.quantity, 0);
      if (otherTotal + dto.quantity > template.event.totalCapacity) {
        throw new BadRequestException(
          `Total ticket quantity would exceed event capacity (${template.event.totalCapacity})`,
        );
      }

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
