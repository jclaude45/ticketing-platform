import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlatformOverview() {
    const [
      totalOrganizers,
      activeOrganizers,
      totalEvents,
      activeEvents,
      totalTickets,
      totalScans,
      totalBadges,
      recentRegistrations,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.ORGANIZER } }),
      this.prisma.user.count({ where: { role: Role.ORGANIZER, isActive: true } }),
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: { in: ['PUBLISHED', 'DRAFT'] } } }),
      this.prisma.ticket.count(),
      this.prisma.scanValidation.count(),
      this.prisma.accreditation.count(),
      this.prisma.user.findMany({
        where: { role: Role.ORGANIZER },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
      }),
    ]);

    // Tickets per month for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const ticketsByMonth = await this.prisma.$queryRaw<
      { month: string; count: bigint }[]
    >`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(*)::bigint AS count
      FROM "Ticket"
      WHERE "createdAt" >= ${sixMonthsAgo}
      GROUP BY 1
      ORDER BY 1
    `;

    return {
      totals: {
        organizers: totalOrganizers,
        activeOrganizers,
        events: totalEvents,
        activeEvents,
        tickets: totalTickets,
        scans: totalScans,
        badges: totalBadges,
      },
      ticketsByMonth: ticketsByMonth.map(r => ({
        month: r.month,
        count: Number(r.count),
      })),
      recentRegistrations,
    };
  }

  async getOrganizers(search?: string) {
    const where: any = { role: Role.ORGANIZER };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
      ];
    }

    const organizers = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        isEmailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { events: true } },
        subscription: {
          include: { plan: { select: { id: true, name: true, showPoweredBy: true, maxTickets: true, maxBadges: true } } },
        },
      },
    });

    // For each organizer, count tickets and scans
    const withStats = await Promise.all(
      organizers.map(async (org) => {
        const [ticketCount, scanCount, eventIds] = await Promise.all([
          this.prisma.ticket.count({ where: { event: { organizerId: org.id } } }),
          this.prisma.scanValidation.count({ where: { ticket: { event: { organizerId: org.id } } } }),
          this.prisma.event.findMany({ where: { organizerId: org.id }, select: { id: true, name: true, status: true, startDate: true } }),
        ]);

        return {
          id: org.id,
          firstName: org.firstName,
          lastName: org.lastName,
          email: org.email,
          isActive: org.isActive,
          isEmailVerified: org.isEmailVerified,
          lastLoginAt: org.lastLoginAt,
          createdAt: org.createdAt,
          eventsCount: org._count.events,
          ticketsCount: ticketCount,
          scansCount: scanCount,
          events: eventIds,
          subscription: org.subscription ?? null,
        };
      }),
    );

    return withStats;
  }

  async getOrganizerDetail(organizerId: string) {
    const org = await this.prisma.user.findUnique({
      where: { id: organizerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        subscription: { include: { plan: true } },
        events: {
          orderBy: { startDate: 'desc' },
          select: {
            id: true, name: true, status: true, startDate: true, endDate: true,
            city: true, venue: true, totalCapacity: true,
            _count: { select: { tickets: true, teamMembers: true } },
          },
        },
      },
    });

    if (!org) return null;

    const [ticketCount, scanCount, badgeCount] = await Promise.all([
      this.prisma.ticket.count({ where: { event: { organizerId } } }),
      this.prisma.scanValidation.count({ where: { ticket: { event: { organizerId } } } }),
      this.prisma.accreditation.count({ where: { event: { organizerId } } }),
    ]);

    return { ...org, ticketCount, scanCount, badgeCount };
  }

  async setOrganizerActive(organizerId: string, isActive: boolean) {
    return this.prisma.user.update({
      where: { id: organizerId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });
  }
}
