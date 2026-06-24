import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Role } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getEventAnalytics(eventId: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true },
    });
    if (!event) throw new ForbiddenException('Event not found');
    if (organizerRole !== Role.ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const [totalTickets, scannedTickets, scanValidations] = await Promise.all([
      this.prisma.ticket.count({ where: { eventId } }),
      this.prisma.ticket.count({ where: { eventId, status: 'USED' } }),
      this.prisma.scanValidation.findMany({
        where: { ticket: { eventId } },
        include: {
          ticket: { select: { serialNumber: true, holderName: true } },
          controller: { select: { id: true, name: true } },
        },
        orderBy: { scannedAt: 'desc' },
        take: 500,
      }),
    ]);

    // Scans grouped by hour (last 24 h buckets)
    const hourMap: Record<string, number> = {};
    scanValidations.forEach((s) => {
      const h = new Date(s.scannedAt).toISOString().slice(0, 13) + ':00';
      hourMap[h] = (hourMap[h] ?? 0) + 1;
    });
    const scansByHour = Object.entries(hourMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }));

    // Scans grouped by controller
    const ctrlMap: Record<string, { controllerId: string; name: string; count: number }> = {};
    scanValidations.forEach((s) => {
      const id = s.controller?.id ?? 'unknown';
      if (!ctrlMap[id]) {
        ctrlMap[id] = { controllerId: id, name: s.controller?.name ?? 'Inconnu', count: 0 };
      }
      ctrlMap[id].count++;
    });
    const scansByController = Object.values(ctrlMap).sort((a, b) => b.count - a.count);

    // Recent scans (latest 20)
    const recentScans = scanValidations.slice(0, 20).map((s) => ({
      id: s.id,
      ticketId: s.ticketId,
      eventId,
      controllerId: s.controllerId,
      timestamp: s.scannedAt,
      isValid: s.result === 'VALID',
      rejectionReason: s.result !== 'VALID' ? s.result : undefined,
      ticket: s.ticket,
      controller: s.controller,
    }));

    return {
      eventId,
      totalTickets,
      scannedTickets,
      occupancyRate: totalTickets > 0 ? scannedTickets / totalTickets : 0,
      scansByHour,
      scansByController,
      recentScans,
    };
  }

  async getDashboardStats(organizerId: string, organizerRole: Role) {
    const cacheKey = `analytics:dashboard:${organizerId}`;
    const cached = await this.redisService.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const where = organizerRole === Role.ADMIN ? {} : { organizerId };
    const eventWhere = organizerRole === Role.ADMIN ? {} : { event: { organizerId } };

    const [
      totalEvents,
      publishedEvents,
      totalTickets,
      validTickets,
      usedTickets,
      cancelledTickets,
      fraudulentTickets,
      totalControllers,
      totalScans,
      recentScans,
    ] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.count({ where: { ...where, status: 'PUBLISHED' } }),
      this.prisma.ticket.count({ where: { event: { ...where } } }),
      this.prisma.ticket.count({ where: { event: { ...where }, status: 'VALID' } }),
      this.prisma.ticket.count({ where: { event: { ...where }, status: 'USED' } }),
      this.prisma.ticket.count({ where: { event: { ...where }, status: 'CANCELLED' } }),
      this.prisma.ticket.count({ where: { event: { ...where }, status: 'FRAUDULENT' } }),
      this.prisma.controller.count({ where: organizerRole === Role.ADMIN ? {} : { organizerId } }),
      this.prisma.scanValidation.count({ where: { ticket: { event: { ...where } } } }),
      this.prisma.scanValidation.findMany({
        where: { ticket: { event: { ...where } } },
        take: 10,
        orderBy: { scannedAt: 'desc' },
        include: {
          ticket: { select: { serialNumber: true, holderName: true } },
          controller: { select: { name: true } },
        },
      }),
    ]);

    const checkInRate = totalTickets > 0 ? Math.round((usedTickets / totalTickets) * 100) : 0;

    const stats = {
      overview: {
        totalEvents,
        publishedEvents,
        totalTickets,
        totalControllers,
        totalScans,
        checkInRate,
      },
      tickets: {
        total: totalTickets,
        valid: validTickets,
        used: usedTickets,
        cancelled: cancelledTickets,
        fraudulent: fraudulentTickets,
      },
      recentScans,
      generatedAt: new Date().toISOString(),
    };

    await this.redisService.cacheSet(cacheKey, stats, 60); // Cache for 1 minute
    return stats;
  }

  async getEventTimeSeries(
    eventId: string,
    organizerId: string,
    organizerRole: Role,
    days: number = 7,
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new Error('Event not found');

    if (organizerRole !== Role.ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily scan counts for the last N days
    const scans = await this.prisma.scanValidation.findMany({
      where: {
        ticket: { eventId },
        scannedAt: { gte: startDate },
      },
      select: { scannedAt: true, result: true },
      orderBy: { scannedAt: 'asc' },
    });

    // Group by day
    const dailyData: Record<string, { valid: number; invalid: number; total: number }> = {};
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      dailyData[key] = { valid: 0, invalid: 0, total: 0 };
    }

    scans.forEach((scan) => {
      const key = scan.scannedAt.toISOString().split('T')[0];
      if (dailyData[key]) {
        dailyData[key].total++;
        if (scan.result === 'VALID') dailyData[key].valid++;
        else dailyData[key].invalid++;
      }
    });

    return {
      eventId,
      days,
      timeSeries: Object.entries(dailyData).map(([date, data]) => ({ date, ...data })),
    };
  }

  async getCheckInProgress(eventId: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, totalCapacity: true, organizerId: true },
    });
    if (!event) throw new Error('Event not found');

    if (organizerRole !== Role.ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const cacheKey = `analytics:checkin:${eventId}`;
    const cached = await this.redisService.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const [totalValid, totalUsed, recentScans] = await Promise.all([
      this.prisma.ticket.count({ where: { eventId, status: { in: ['VALID', 'USED'] } } }),
      this.prisma.ticket.count({ where: { eventId, status: 'USED' } }),
      this.prisma.scanValidation.findMany({
        where: { ticket: { eventId }, result: 'VALID' },
        take: 5,
        orderBy: { scannedAt: 'desc' },
        include: {
          ticket: { select: { serialNumber: true, holderName: true } },
          controller: { select: { name: true } },
        },
      }),
    ]);

    const progress = {
      eventId,
      eventName: event.name,
      capacity: event.totalCapacity,
      totalSold: totalValid,
      totalCheckedIn: totalUsed,
      checkInRate: totalValid > 0 ? Math.round((totalUsed / totalValid) * 100) : 0,
      remainingToCheckIn: totalValid - totalUsed,
      recentCheckIns: recentScans,
      lastUpdated: new Date().toISOString(),
    };

    await this.redisService.cacheSet(cacheKey, progress, 10); // Cache 10 seconds for real-time feel
    return progress;
  }

  async getTopEvents(organizerId: string, organizerRole: Role, limit: number = 5) {
    const where = organizerRole === Role.ADMIN ? {} : { organizerId };

    const events = await this.prisma.event.findMany({
      where,
      include: {
        _count: {
          select: { tickets: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2, // Fetch more to filter and sort
    });

    // Sort by ticket count
    const sorted = events.sort((a, b) => b._count.tickets - a._count.tickets).slice(0, limit);

    return sorted.map((event) => ({
      id: event.id,
      name: event.name,
      status: event.status,
      startDate: event.startDate,
      city: event.city,
      totalCapacity: event.totalCapacity,
      ticketCount: event._count.tickets,
      soldRate: Math.round((event._count.tickets / event.totalCapacity) * 100),
    }));
  }

  async getGlobalAnalytics(organizerId: string, organizerRole: Role) {
    const cacheKey = `analytics:global:${organizerId}`;
    const cached = await this.redisService.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const where       = organizerRole === Role.ADMIN ? {} : { organizerId };
    const ticketWhere = organizerRole === Role.ADMIN ? {} : { event: { organizerId } };

    const now             = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    // Month boundaries for MoM comparison
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Today boundaries for hourly scan chart
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [
      totalEvents, activeEvents, totalTickets, totalScans,
      publishedEvents, recentEvents, topEvents,
      eventsThisMonth, eventsLastMonth,
      ticketsThisMonth, ticketsLastMonth,
      scansThisMonth, scansLastMonth,
      todayScans,
    ] = await Promise.all([
        this.prisma.event.count({ where }),
        this.prisma.event.count({ where: { ...where, status: 'PUBLISHED' } }),
        this.prisma.ticket.count({ where: ticketWhere }),
        this.prisma.scanValidation.count({ where: { ticket: ticketWhere } }),
        // For average occupancy
        this.prisma.event.findMany({
          where: { ...where, status: 'PUBLISHED', totalCapacity: { gt: 0 } },
          include: { _count: { select: { tickets: true } } },
        }),
        // For eventsByMonth (last 12 months)
        this.prisma.event.findMany({
          where: { ...where, createdAt: { gte: twelveMonthsAgo } },
          select: { createdAt: true },
        }),
        // For ticketsByEvent top-10
        this.prisma.event.findMany({
          where,
          include: { _count: { select: { tickets: true } } },
          take: 30,
          orderBy: { createdAt: 'desc' },
        }),
        // MoM: events
        this.prisma.event.count({ where: { ...where, createdAt: { gte: thisMonthStart } } }),
        this.prisma.event.count({ where: { ...where, createdAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
        // MoM: tickets
        this.prisma.ticket.count({ where: { ...ticketWhere, createdAt: { gte: thisMonthStart } } }),
        this.prisma.ticket.count({ where: { ...ticketWhere, createdAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
        // MoM: scans
        this.prisma.scanValidation.count({ where: { ticket: ticketWhere, scannedAt: { gte: thisMonthStart } } }),
        this.prisma.scanValidation.count({ where: { ticket: ticketWhere, scannedAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
        // Today's scans for hourly chart
        this.prisma.scanValidation.findMany({
          where: { ticket: ticketWhere, scannedAt: { gte: todayStart, lte: todayEnd } },
          select: { scannedAt: true },
        }),
      ]);

    // Average occupancy across PUBLISHED events
    let averageOccupancy = 0;
    if (publishedEvents.length > 0) {
      const sum = publishedEvents.reduce(
        (acc, e) => acc + Math.min(100, (e._count.tickets / e.totalCapacity) * 100),
        0,
      );
      averageOccupancy = Math.round(sum / publishedEvents.length);
    }

    // Scans by hour today — fill all 24 slots so the chart always has a full axis
    const hourlyMap: Record<string, number> = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[String(h).padStart(2, '0') + ':00'] = 0;
    }
    todayScans.forEach((s) => {
      const h = new Date(s.scannedAt).getHours();
      const key = String(h).padStart(2, '0') + ':00';
      hourlyMap[key] = (hourlyMap[key] ?? 0) + 1;
    });
    const scansByHour = Object.entries(hourlyMap).map(([hour, count]) => ({ hour, count }));

    // Events created per month (last 12 months)
    const monthMap: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = 0;
    }
    recentEvents.forEach((e) => {
      const d   = new Date(e.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key in monthMap) monthMap[key]++;
    });
    const eventsByMonth = Object.entries(monthMap).map(([month, count]) => ({ month, count }));

    // Top events by ticket count
    const ticketsByEvent = topEvents
      .sort((a, b) => b._count.tickets - a._count.tickets)
      .slice(0, 10)
      .map((e) => ({ eventId: e.id, name: e.name, count: e._count.tickets }));

    const result = {
      totalEvents, activeEvents, totalTickets, totalScans, averageOccupancy,
      eventsByMonth, ticketsByEvent, scansByHour,
      // Month-over-month raw counts — frontend computes the % delta
      mom: {
        eventsThisMonth, eventsLastMonth,
        ticketsThisMonth, ticketsLastMonth,
        scansThisMonth, scansLastMonth,
      },
    };
    await this.redisService.cacheSet(cacheKey, result, 60);
    return result;
  }

  async getRevenueStats(organizerId: string, organizerRole: Role) {
    const where = organizerRole === Role.ADMIN ? {} : { event: { organizerId } };

    const tickets = await this.prisma.ticket.findMany({
      where: {
        ...where,
        status: { in: ['VALID', 'USED'] },
      },
      select: { price: true, currency: true },
    });

    // Group by currency
    const revenueByCurrency: Record<string, number> = {};
    tickets.forEach((ticket) => {
      const currency = ticket.currency || 'USD';
      revenueByCurrency[currency] = (revenueByCurrency[currency] || 0) + Number(ticket.price);
    });

    return {
      totalTicketsSold: tickets.length,
      revenueByCurrency,
      generatedAt: new Date().toISOString(),
    };
  }

  async getControllerPerformance(eventId: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new Error('Event not found');

    if (organizerRole !== Role.ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const controllers = await this.prisma.controller.findMany({
      where: {
        controllerEvents: { some: { eventId } },
      },
      include: {
        _count: {
          select: { scanValidations: true },
        },
      },
    });

    const performance = await Promise.all(
      controllers.map(async (controller) => {
        const [validScans, invalidScans] = await Promise.all([
          this.prisma.scanValidation.count({
            where: { controllerId: controller.id, ticket: { eventId }, result: 'VALID' },
          }),
          this.prisma.scanValidation.count({
            where: { controllerId: controller.id, ticket: { eventId }, result: { not: 'VALID' } },
          }),
        ]);

        return {
          controllerId: controller.id,
          controllerName: controller.name,
          totalScans: controller._count.scanValidations,
          validScans,
          invalidScans,
          successRate: controller._count.scanValidations > 0
            ? Math.round((validScans / controller._count.scanValidations) * 100)
            : 0,
        };
      }),
    );

    return { eventId, controllers: performance };
  }
}
