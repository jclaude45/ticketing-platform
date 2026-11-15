import { BadRequestException } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { eventDays } from './event-days';

/**
 * Invitations can draw on the event's capacity beyond its tariffs (capacity 500, tariffs 300:
 * 200 seats for guests). Those seats are a hidden category, the "capacity pool": a ticket
 * template like the others for tickets, scans and statistics, never sold nor shown publicly.
 * Its size follows the capacity and the tariffs, and never drops below the invitations issued.
 */

/** templateId sent by the dashboard to invite on the capacity rather than on a tariff */
export const CAPACITY_POOL = 'CAPACITY';

type Db = Prisma.TransactionClient | PrismaService;

/** Seats of the busiest day taken by the tariffs (the pool's tickets are valid every day) */
async function tariffSeats(db: Db, event: { id: string; startDate: Date; endDate: Date; timeZone: string }) {
  const tariffs = await db.ticketTemplate.findMany({
    where: { eventId: event.id, capacityPool: false },
    select: { quantity: true, validDays: true },
  });
  const days = eventDays(event.startDate, event.endDate, event.timeZone);
  return Math.max(0, ...days.map((day) =>
    tariffs.filter((t) => t.validDays.length === 0 || t.validDays.includes(day)).reduce((n, t) => n + t.quantity, 0)));
}

/** Invitations issued on the pool and still held (pending, valid or used) */
export async function poolIssued(db: Db, eventId: string): Promise<number> {
  return db.ticket.count({
    where: { eventId, template: { capacityPool: true }, status: { not: TicketStatus.CANCELLED } },
  });
}

/** Seats of the capacity left for invitations, without creating the pool */
export async function capacityLeft(db: Db, eventId: string): Promise<number> {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { id: true, totalCapacity: true, startDate: true, endDate: true, timeZone: true },
  });
  return Math.max(0, event.totalCapacity - (await tariffSeats(db, event)) - (await poolIssued(db, eventId)));
}

/**
 * Resizes the pool to the capacity left by the tariffs (creating it when asked). Runs under a
 * lock on the pool row, the one ticket generation takes: no batch can slip in between.
 */
export async function syncCapacityPool(prisma: PrismaService, eventId: string, create = false) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { id: true, totalCapacity: true, startDate: true, endDate: true, timeZone: true, currency: true },
    });
    let pool = await tx.ticketTemplate.findFirst({ where: { eventId, capacityPool: true }, select: { id: true } });
    if (!pool && !create) return null;
    if (pool) await tx.$queryRaw`SELECT id FROM "TicketTemplate" WHERE id = ${pool.id} FOR UPDATE`;

    const issued = await poolIssued(tx, eventId);
    const quantity = Math.max(issued, event.totalCapacity - (await tariffSeats(tx, event)));
    const data = { quantity, availableCount: quantity - issued };
    pool = pool
      ? await tx.ticketTemplate.update({ where: { id: pool.id }, data, select: { id: true } })
      : await tx.ticketTemplate.create({
          data: { eventId, name: 'Invitation', price: 0, currency: event.currency, color: '#181818', capacityPool: true, ...data },
          select: { id: true },
        });
    return { id: pool.id, available: data.availableCount };
  });
}

/** The template to use for invitations: a tariff, or the pool when CAPACITY is asked */
export async function invitationTemplateId(prisma: PrismaService, eventId: string, templateId: string): Promise<string> {
  if (templateId !== CAPACITY_POOL) return templateId;
  const pool = await syncCapacityPool(prisma, eventId, true);
  if (!pool || pool.available <= 0) {
    throw new BadRequestException("Plus aucune place libre dans la capacité d'accueil : augmentez-la ou utilisez un tarif");
  }
  return pool.id;
}
