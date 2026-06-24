import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { GenerateTicketsDto } from './dto/generate-tickets.dto';
import { Role, TicketStatus } from '@prisma/client';

@Injectable()
export class TicketGenerationService {
  private readonly logger = new Logger(TicketGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly qrcodeService: QrcodeService,
    private readonly configService: ConfigService,
  ) {}

  async generateTickets(
    eventId: string,
    organizerId: string,
    organizerRole: Role,
    dto: GenerateTicketsDto,
  ) {
    // Validate event
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, organizerId: true, status: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && event.organizerId !== organizerId) {
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

    // Get the active key pair for the organizer — auto-generate if none exists
    const encKey = this.configService.get<string>('crypto.privateKeyEncryptionKey');
    let keyPair = await this.prisma.keyPair.findFirst({
      where: { organizerId: event.organizerId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!keyPair) {
      this.logger.log(`Auto-generating RSA key pair for organizer ${event.organizerId}`);
      const generated = await this.cryptoService.generateRSA4096KeyPair();
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

    for (let i = 0; i < count; i++) {
      const sequence = existingCount + i + 1;
      // Format: <eventCode>-<tmplDisc>-<sequence>  e.g.  KNK2026-A1B2C3-00001
      const serialNumber = `${eventCode}-${tmplDisc}-${sequence.toString().padStart(5, '0')}`;

      const holderName = holders[i]?.holderName?.trim();
      const holderEmail = holders[i]?.holderEmail?.trim();

      // Generate signed QR code
      const qrResult = await this.qrcodeService.generateSignedQRCode(
        {
          ticketId: `PENDING-${Date.now()}-${i}`, // Temp ID, will be updated
          serialNumber,
          eventId,
          eventName: event.name,
          holderName,
          templateId: dto.templateId,
        },
        plainPrivateKey,
      );

      ticketsData.push({
        serialNumber,
        qrCode: qrResult.qrCodeDataUrl,
        qrCodeSignature: qrResult.signature,
        holderName: holderName || null,
        holderEmail: holderEmail || null,
        status: TicketStatus.VALID,
        price: template.price,
        currency: template.currency,
        purchasedAt: new Date(),
        eventId,
        templateId: dto.templateId,
      });
    }

    // Batch insert tickets
    const createdTickets = await this.prisma.$transaction(async (tx) => {
      const tickets = [];
      for (const ticketData of ticketsData) {
        const ticket = await tx.ticket.create({ data: ticketData });
        tickets.push(ticket);
      }

      // Update available count on template.
      await tx.ticketTemplate.update({
        where: { id: dto.templateId },
        data: { availableCount: { decrement: count } },
      });

      return tickets;
    });

    // Regenerate QR codes with actual ticket IDs
    const ticketsWithQR = await Promise.all(
      createdTickets.map(async (ticket) => {
        const qrResult = await this.qrcodeService.generateSignedQRCode(
          {
            ticketId: ticket.id,
            serialNumber: ticket.serialNumber,
            eventId,
            eventName: event.name,
            holderName: ticket.holderName,
            templateId: dto.templateId,
          },
          plainPrivateKey,
        );

        return this.prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            qrCode: qrResult.qrCodeDataUrl,
            qrCodeSignature: qrResult.signature,
          },
        });
      }),
    );

    this.logger.log(`Generated ${count} tickets for event ${eventId}`);

    return {
      message: `Successfully generated ${count} tickets`,
      count,
      tickets: ticketsWithQR.map((t) => ({
        id: t.id,
        serialNumber: t.serialNumber,
        status: t.status,
        holderName: t.holderName,
        holderEmail: t.holderEmail,
      })),
    };
  }

  async cancelTicket(ticketId: string, organizerId: string, organizerRole: Role) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: { select: { organizerId: true } } },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (organizerRole !== Role.ADMIN && ticket.event.organizerId !== organizerId) {
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
