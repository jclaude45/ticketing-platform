import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ticket history ("Historique des billets" in the dashboard): one AuditLog row per
 * generation batch, cancellation and scan, attached to the event (entity 'event',
 * entityId = event id) so the organizer sees online sales and controller scans too.
 */
export type TicketAction = 'ticket.generate' | 'ticket.cancel' | 'ticket.scan';

/** Where a batch of tickets comes from */
export type TicketSource = 'GENERATION' | 'ONLINE' | 'INVITATION';

const logger = new Logger('TicketHistory');

export async function logTicketAction(
  prisma: PrismaService,
  entry: {
    action: TicketAction;
    eventId: string;
    /** Who did it; none for a buyer on the public site or a controller (scanner) */
    userId?: string | null;
    values: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: 'event',
        entityId: entry.eventId,
        newValues: entry.values as any,
      },
    });
  } catch (error) {
    // History must never break a sale, a cancellation or a scan
    logger.error(`Could not record ${entry.action} for event ${entry.eventId}`, error as Error);
  }
}
