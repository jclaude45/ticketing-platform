import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { GenerateTicketsDto } from './dto/generate-tickets.dto';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import { SubscriptionService } from '../subscription/subscription.service';
import { logTicketAction, type TicketSource } from '../audit/ticket-history';

@Injectable()
export class TicketGenerationService {
  private readonly logger = new Logger(TicketGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly qrcodeService: QrcodeService,
    private readonly configService: ConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async generateTickets(
    eventId: string,
    organizerId: string,
    organizerRole: Role,
    dto: GenerateTicketsDto,
    options?: {
      price?: number;
      metadata?: Prisma.InputJsonValue;
      /** For the ticket history: where the batch comes from (default: the organizer) */
      source?: TicketSource;
    },
  ) {
    // Validate event
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, organizerId: true, status: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('You can only generate tickets for your own events');
    }

    if (event.status === 'CANCELLED') {
      throw new BadRequestException('Cannot generate tickets for a cancelled event');
    }

    // Validate template
    const template = await this.prisma.ticketTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template) throw new NotFoundException('Ticket template not found');
    if (template.eventId !== eventId) throw new BadRequestException('Template does not belong to this event');

    // Drop empty holder rows so blank entries never inflate the ticket count
    const holders = (dto.holders ?? []).filter(
      (h) => h.holderName && h.holderName.trim().length > 0,
    );
    const count = holders.length ? holders.length : (dto.count ?? 0);
    if (count === 0) {
      throw new BadRequestException('Veuillez fournir soit un nombre de billets (count), soit une liste de participants (holders).');
    }

    if (count > template.availableCount) {
      throw new BadRequestException(
        `Cannot generate ${count} tickets. Only ${template.availableCount} available in this template.`,
      );
    }

    // Print quota: tickets made by the organizer (batches, invitations) use the plan quota,
    // then paid credits. Online sales and registrations never count.
    const source: TicketSource = options?.source ?? 'GENERATION';
    const creditsTaken = source === 'ONLINE'
      ? 0
      : await this.subscriptionService.consumePrint(event.organizerId, 'TICKETS', count, eventId);

    // Get the active key pair for the organizer — auto-generate if none exists
    // resolveEncKey() returns the KMS-decrypted DEK (or raw env var as fallback)
    const encKey = this.cryptoService.resolveEncKey();
    let keyPair = await this.prisma.keyPair.findFirst({
      where: { organizerId: event.organizerId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!keyPair) {
      this.logger.log(`Auto-generating Ed25519 key pair for organizer ${event.organizerId}`);
      const generated = await this.cryptoService.generateEd25519KeyPair();
      const encryptedPrivKey = this.cryptoService.encryptAES(generated.privateKey, encKey);
      keyPair = await this.prisma.keyPair.create({
        data: {
          publicKey: generated.publicKey,
          privateKey: encryptedPrivKey,
          organizerId: event.organizerId,
          isActive: true,
        },
      });
    }

    // Decrypt private key — stored encrypted (AES-256-GCM) in DB
    const plainPrivateKey = this.cryptoService.decryptAES(keyPair.privateKey, encKey);

    // Count existing tickets FOR THIS TEMPLATE only — serial numbers restart at 1 per template.
    // The template discriminator (tmplDisc) embedded in the serial ensures global @unique is
    // never violated even when multiple templates share the same event + eventCode.
    const existingCount = await this.prisma.ticket.count({
      where: { eventId, templateId: dto.templateId },
    });

    const ticketsData: any[] = [];
    const year = new Date().getFullYear();
    const eventCode = this.cryptoService.generateEventCode(event.name, year);
    // 6-char template discriminator — derived from the template UUID so it is globally unique.
    const tmplDisc = dto.templateId.replace(/-/g, '').slice(0, 6).toUpperCase();

    const purchasedAt = new Date();
    for (let i = 0; i < count; i++) {
      const sequence = existingCount + i + 1;
      // Format: <eventCode>-<tmplDisc>-<sequence>  e.g.  KNK2026-A1B2C3-00001
      const serialNumber = `${eventCode}-${tmplDisc}-${sequence.toString().padStart(5, '0')}`;

      const holderName = holders[i]?.holderName?.trim();
      const holderEmail = holders[i]?.holderEmail?.trim();
      const holderPhone = holders[i]?.holderPhone?.trim();

      // The id is chosen here, so the ticket is signed once with its final id. No QR image is
      // stored: it is drawn from the id and serial wherever it is shown (PDF, e-mail, page).
      const id = randomUUID();
      const signature = this.qrcodeService.signTicket(
        { ticketId: id, serialNumber, eventId, eventName: event.name, holderName, templateId: dto.templateId },
        plainPrivateKey,
      );

      ticketsData.push({
        id,
        serialNumber,
        qrCode: null,
        qrCodeSignature: signature,
        holderName: holderName || null,
        holderEmail: holderEmail || null,
        holderPhone: holderPhone || null,
        status: TicketStatus.VALID,
        price: options?.price ?? template.price,
        currency: template.currency,
        purchasedAt,
        eventId,
        templateId: dto.templateId,
        ...(options?.metadata !== undefined && { metadata: options.metadata }),
        source,
      });
    }

    // Batch insert tickets + atomic stock decrement in one transaction.
    // updateMany with gte condition is the critical section: prevents overselling
    // even when concurrent requests both passed the pre-flight check above.
    await this.prisma.$transaction(async (tx) => {
      const reserved = await tx.ticketTemplate.updateMany({
        where: { id: dto.templateId, availableCount: { gte: count } },
        data: { availableCount: { decrement: count } },
      });
      if (reserved.count === 0) {
        throw new BadRequestException(`Stock épuisé : plus assez de places disponibles pour ce type de billet.`);
      }
      // One insert per 1 000 tickets instead of one per ticket
      for (let i = 0; i < ticketsData.length; i += 1000) {
        await tx.ticket.createMany({ data: ticketsData.slice(i, i + 1000) });
      }
    }, { timeout: 60_000 }).catch(async (err) => {
      // Nothing was issued: give back the credits taken for this batch
      await this.subscriptionService.refundCredits(event.organizerId, 'TICKETS', creditsTaken);
      throw err;
    });
    const ticketsWithQR = ticketsData as { id: string; serialNumber: string; status: TicketStatus; holderName: string | null; holderEmail: string | null; holderPhone: string | null }[];

    this.logger.log(`Generated ${count} tickets for event ${eventId}`);

    await logTicketAction(this.prisma, {
      action: 'ticket.generate',
      eventId,
      // A buyer on the public site is not a user: organizerId is then only the event owner
      userId: source === 'ONLINE' ? null : organizerId,
      values: {
        eventName: event.name,
        templateName: template.name,
        count,
        source,
        serialNumber: ticketsWithQR[0]?.serialNumber,
        serialNumbers: ticketsWithQR.slice(0, 20).map((t) => t.serialNumber),
        ...(holders[0]?.holderName && { holderName: holders[0].holderName }),
      },
    });

    return {
      message: `Successfully generated ${count} tickets`,
      count,
      tickets: ticketsWithQR.map((t) => ({
        id: t.id,
        serialNumber: t.serialNumber,
        status: t.status,
        holderName: t.holderName,
        holderEmail: t.holderEmail,
        holderPhone: t.holderPhone,
      })),
    };
  }

  async cancelTicket(ticketId: string, organizerId: string, organizerRole: Role) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: { select: { organizerId: true, name: true } } },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && ticket.event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    if (ticket.status === 'CANCELLED') {
      throw new BadRequestException('Ticket is already cancelled');
    }

    if (ticket.status === 'USED') {
      throw new BadRequestException('Cannot cancel a ticket that has already been used');
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.CANCELLED, cancelledAt: new Date() },
    });

    // Restore available count if cancelling a valid ticket
    if (ticket.status === 'VALID' || ticket.status === 'PENDING') {
      await this.prisma.ticketTemplate.update({
        where: { id: ticket.templateId },
        data: { availableCount: { increment: 1 } },
      });
    }

    await logTicketAction(this.prisma, {
      action: 'ticket.cancel',
      eventId: ticket.eventId,
      userId: organizerId,
      values: { eventName: ticket.event.name, serialNumber: ticket.serialNumber, holderName: ticket.holderName, status: 'CANCELLED' },
    });

    return updated;
  }

  async bulkCancelTickets(ticketIds: string[], organizerId: string, organizerRole: Role) {
    const results = { cancelled: 0, failed: 0, errors: [] as string[] };

    for (const ticketId of ticketIds) {
      try {
        await this.cancelTicket(ticketId, organizerId, organizerRole);
        results.cancelled++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${ticketId}: ${err.message}`);
      }
    }

    return results;
  }
}
