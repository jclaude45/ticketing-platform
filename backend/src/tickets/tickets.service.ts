import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TicketStatus, Role } from '@prisma/client';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async findAllForEvent(
    eventId: string,
    requesterId: string,
    requesterRole: Role,
    page: number = 1,
    limit: number = 50,
    status?: TicketStatus,
    search?: string,
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    if (requesterRole !== Role.ADMIN && event.organizerId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }

    const skip = (page - 1) * limit;
    const where: any = { eventId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { holderName: { contains: search, mode: 'insensitive' } },
        { holderEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        include: {
          template: { select: { name: true, color: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: tickets,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(ticketId: string, requesterId: string, requesterRole: Role) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            city: true,
            country: true,
            startDate: true,
            endDate: true,
            organizerId: true,
          },
        },
        template: true,
        scanValidations: {
          include: {
            controller: { select: { name: true, email: true } },
          },
          orderBy: { scannedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (requesterRole !== Role.ADMIN && ticket.event.organizerId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }

    return ticket;
  }

  async findBySerial(serialNumber: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { serialNumber },
      include: {
        event: { select: { id: true, name: true, venue: true, startDate: true } },
        template: { select: { name: true } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async updateHolder(
    ticketId: string,
    requesterId: string,
    requesterRole: Role,
    holderName?: string,
    holderEmail?: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: { select: { organizerId: true } } },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (requesterRole !== Role.ADMIN && ticket.event.organizerId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...(holderName !== undefined && { holderName }),
        ...(holderEmail !== undefined && { holderEmail }),
      },
    });
  }

  async getTicketQR(ticketId: string, requesterId: string, requesterRole: Role) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: { select: { organizerId: true } } },
      });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (requesterRole !== Role.ADMIN && ticket.event.organizerId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }

    return {
      ticketId: ticket.id,
      serialNumber: ticket.serialNumber,
      qrCode: ticket.qrCode,
      status: ticket.status,
    };
  }

  async bulkStatusUpdate(
    ticketIds: string[],
    status: TicketStatus,
    requesterId: string,
    requesterRole: Role,
  ) {
    const results = { updated: 0, failed: 0, errors: [] as string[] };

    for (const ticketId of ticketIds) {
      try {
        const ticket = await this.prisma.ticket.findUnique({
          where: { id: ticketId },
          include: { event: { select: { organizerId: true } } },
        });

        if (!ticket) {
          results.failed++;
          results.errors.push(`${ticketId}: Not found`);
          continue;
        }

        if (requesterRole !== Role.ADMIN && ticket.event.organizerId !== requesterId) {
          results.failed++;
          results.errors.push(`${ticketId}: Access denied`);
          continue;
        }

        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: {
            status,
            ...(status === TicketStatus.CANCELLED && { cancelledAt: new Date() }),
            ...(status === TicketStatus.USED && { checkedInAt: new Date() }),
          },
        });
        results.updated++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${ticketId}: ${err.message}`);
      }
    }

    return results;
  }
}
