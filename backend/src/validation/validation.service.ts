import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ScanTicketDto, OfflineScanDto } from './dto/scan-ticket.dto';
import { ScanResult, TicketStatus, Role } from '@prisma/client';

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly qrcodeService: QrcodeService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  // Returns a Controller.id valid for ScanValidation FK.
  // Organizers/admins don't have Controller rows — create one on first use.
  private async resolveControllerIdForScan(userId: string, callerRole: Role): Promise<string> {
    if (callerRole !== Role.ORGANIZER && callerRole !== Role.ADMIN && callerRole !== Role.SUPER_ADMIN) {
      return userId; // already a Controller ID
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) throw new ForbiddenException('User not found');

    const existing = await this.prisma.controller.findUnique({ where: { email: user.email } });
    if (existing) return existing.id;

    const created = await this.prisma.controller.create({
      data: {
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
        email: user.email,
        password: '',
        isActive: true,
        organizerId: userId,
      },
    });
    return created.id;
  }

  async scanTicket(
    userId: string,
    eventId: string,
    dto: ScanTicketDto,
    ipAddress?: string,
    callerRole?: Role,
  ) {
    // ORGANIZER and ADMIN can scan any event they own without being in ControllerEvent table
    const isPrivileged = callerRole === Role.ORGANIZER || callerRole === Role.ADMIN || callerRole === Role.SUPER_ADMIN;

    // Resolve to a valid Controller table ID for ScanValidation FK
    const controllerId = await this.resolveControllerIdForScan(userId, callerRole ?? Role.CONTROLLER as any);

    if (!isPrivileged) {
      const controllerEvent = await this.prisma.controllerEvent.findUnique({
        where: { controllerId_eventId: { controllerId, eventId } },
        include: { event: { select: { id: true, name: true, status: true } } },
      });
      if (!controllerEvent) {
        throw new ForbiddenException('You are not authorized to scan tickets for this event');
      }
    } else {
      const event = await this.prisma.event.findFirst({
        where: { id: eventId, organizerId: userId },
      });
      if (!event && callerRole !== Role.ADMIN && callerRole !== Role.SUPER_ADMIN) {
        throw new ForbiddenException('You are not the organizer of this event');
      }
    }

    // Parse QR code — supports v2 compact format {"id","sn","v":"2"} and legacy v1 {"p","s","v":"1"}
    let ticketId: string;
    let serialNumber: string;
    let isLegacyV1 = false;

    try {
      const raw = JSON.parse(dto.qrContent);
      if (raw.v === '2') {
        // V2 compact: just id + serial
        ticketId = raw.id;
        serialNumber = raw.sn;
      } else {
        // V1 legacy: full payload + RSA signature embedded in QR
        const payloadData = JSON.parse(raw.p);
        ticketId = payloadData.tid;
        serialNumber = payloadData.sn;
        isLegacyV1 = true;
      }
      if (!ticketId || !serialNumber) throw new Error('missing fields');
    } catch {
      const scanRecord = await this.recordScan(controllerId, null, ScanResult.INVALID, dto, ipAddress);
      return {
        result: ScanResult.INVALID,
        message: 'Invalid QR code format',
        scanId: scanRecord.id,
      };
    }

    // Find ticket
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        AND: [
          { OR: [{ id: ticketId }, { serialNumber }] },
          { eventId },
        ],
      },
      include: {
        event: {
          select: { id: true, name: true, status: true, endDate: true, organizerId: true },
        },
        template: { select: { name: true, color: true } },
      },
    });

    if (!ticket) {
      const scanRecord = await this.recordScan(controllerId, null, ScanResult.INVALID, dto, ipAddress);
      return {
        result: ScanResult.INVALID,
        message: 'Ticket not found for this event',
        scanId: scanRecord.id,
      };
    }

    // Cryptographic verification:
    // V1 (legacy): signature is embedded in the QR → verify against organizer public key
    // V2 (compact): signature is stored in DB (qrCodeSignature) → verify ticket ID + serial match DB record
    const organizerKeyPair = await this.prisma.keyPair.findFirst({
      where: { organizerId: ticket.event.organizerId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (organizerKeyPair) {
      let signatureValid = true;

      if (isLegacyV1) {
        const verification = this.qrcodeService.verifyQRCode(dto.qrContent, organizerKeyPair.publicKey);
        signatureValid = verification.isValid;
      } else {
        // V2: check that the scanned ticket ID and serial actually belong to each other in DB
        signatureValid = (ticket.id === ticketId && ticket.serialNumber === serialNumber);
      }

      if (!signatureValid) {
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: TicketStatus.FRAUDULENT },
        });
        const scanRecord = await this.recordScan(controllerId, ticket.id, ScanResult.FRAUDULENT, dto, ipAddress);
        await this.broadcastScanResult(eventId, ScanResult.FRAUDULENT, ticket, scanRecord.id);
        return {
          result: ScanResult.FRAUDULENT,
          message: 'Fraudulent ticket detected - invalid cryptographic signature',
          scanId: scanRecord.id,
        };
      }
    }

    // Check ticket status
    if (ticket.status === TicketStatus.USED) {
      const scanRecord = await this.recordScan(controllerId, ticket.id, ScanResult.ALREADY_USED, dto, ipAddress);
      await this.broadcastScanResult(eventId, ScanResult.ALREADY_USED, ticket, scanRecord.id);
      return {
        result: ScanResult.ALREADY_USED,
        message: 'Ticket has already been used',
        scanId: scanRecord.id,
        checkedInAt: ticket.checkedInAt,
      };
    }

    if (ticket.status === TicketStatus.CANCELLED) {
      const scanRecord = await this.recordScan(controllerId, ticket.id, ScanResult.INVALID, dto, ipAddress);
      return {
        result: ScanResult.INVALID,
        message: 'Ticket has been cancelled',
        scanId: scanRecord.id,
      };
    }

    if (ticket.status === TicketStatus.FRAUDULENT) {
      const scanRecord = await this.recordScan(controllerId, ticket.id, ScanResult.FRAUDULENT, dto, ipAddress);
      return {
        result: ScanResult.FRAUDULENT,
        message: 'Ticket is marked as fraudulent',
        scanId: scanRecord.id,
      };
    }

    if (ticket.status !== TicketStatus.VALID && ticket.status !== TicketStatus.PENDING) {
      const scanRecord = await this.recordScan(controllerId, ticket.id, ScanResult.INVALID, dto, ipAddress);
      return {
        result: ScanResult.INVALID,
        message: `Ticket status is ${ticket.status}`,
        scanId: scanRecord.id,
      };
    }

    // Check for event expiry
    const now = new Date();
    if (ticket.event.endDate && now > ticket.event.endDate) {
      const scanRecord = await this.recordScan(controllerId, ticket.id, ScanResult.EXPIRED, dto, ipAddress);
      return {
        result: ScanResult.EXPIRED,
        message: 'Event has ended',
        scanId: scanRecord.id,
      };
    }

    // Mark ticket as used
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.USED, checkedInAt: new Date() },
    });

    const scanRecord = await this.recordScan(controllerId, ticket.id, ScanResult.VALID, dto, ipAddress);

    // Emit real-time event
    await this.broadcastScanResult(eventId, ScanResult.VALID, ticket, scanRecord.id);

    this.logger.log(`Ticket ${ticket.serialNumber} scanned valid at event ${eventId}`);

    return {
      result: ScanResult.VALID,
      message: 'Ticket is valid - access granted',
      scanId: scanRecord.id,
      ticket: {
        id: ticket.id,
        serialNumber: ticket.serialNumber,
        holderName: ticket.holderName,
        holderEmail: ticket.holderEmail,
        templateName: ticket.template.name,
        checkedInAt: new Date(),
      },
    };
  }

  async syncOfflineScans(controllerId: string, eventId: string, dto: OfflineScanDto) {
    const results = [];

    // H3: deduplicate — same QR content submitted multiple times in one batch is a replay attempt
    const seen = new Set<string>();
    const uniqueScans = dto.scans.filter((scan) => {
      if (seen.has(scan.qrContent)) return false;
      seen.add(scan.qrContent);
      return true;
    });

    const MAX_OFFLINE_AGE_MS = 24 * 60 * 60 * 1000; // client timestamps clamped to 24h ago max
    const now = Date.now();

    for (const scan of uniqueScans) {
      try {
        const result = await this.scanTicket(
          controllerId,
          eventId,
          { qrContent: scan.qrContent, deviceId: scan.deviceId, location: scan.location },
          undefined,
        );

        if (result.scanId) {
          // H3: clamp offline timestamp — reject timestamps in the future or >24h in the past
          let offlineTs: Date | null = null;
          if (scan.offlineScannedAt) {
            const parsed = new Date(scan.offlineScannedAt).getTime();
            if (!isNaN(parsed) && parsed <= now && parsed >= now - MAX_OFFLINE_AGE_MS) {
              offlineTs = new Date(parsed);
            }
          }
          await this.prisma.scanValidation.update({
            where: { id: result.scanId },
            data: { isSynced: true, offlineScannedAt: offlineTs },
          });
        }

        results.push({ ...result, offlineScannedAt: scan.offlineScannedAt });
      } catch (err) {
        results.push({ error: err.message, qrContent: scan.qrContent.substring(0, 50) });
      }
    }

    const skipped = dto.scans.length - uniqueScans.length;
    return {
      message: `Synced ${results.filter((r) => !r.error).length} of ${uniqueScans.length} scans${skipped > 0 ? ` (${skipped} duplicates rejected)` : ''}`,
      results,
    };
  }

  async getScanHistory(eventId: string, organizerId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [scans, total] = await Promise.all([
      this.prisma.scanValidation.findMany({
        where: { ticket: { eventId } },
        skip,
        take: limit,
        include: {
          ticket: { select: { serialNumber: true, holderName: true, status: true } },
          controller: { select: { name: true, email: true } },
        },
        orderBy: { scannedAt: 'desc' },
      }),
      this.prisma.scanValidation.count({ where: { ticket: { eventId } } }),
    ]);

    return {
      data: scans,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async recordScan(
    controllerId: string,
    ticketId: string | null,
    result: ScanResult,
    dto: ScanTicketDto,
    ipAddress?: string,
  ) {
    // H4: ticketId is nullable — do not store 'unknown' which breaks FK integrity
    return this.prisma.scanValidation.create({
      data: {
        ...(ticketId ? { ticketId } : {}),
        controllerId,
        result,
        deviceId: dto.deviceId,
        location: dto.location,
        ipAddress,
        notes: dto.notes,
        isSynced: true,
      },
    });
  }

  private async broadcastScanResult(
    eventId: string,
    result: ScanResult,
    ticket: any,
    scanId: string,
  ) {
    try {
      this.realtimeGateway.emitToEvent(eventId, 'ticket:scanned', {
        result,
        scanId,
        ticketSerial: ticket.serialNumber,
        holderName: ticket.holderName,
        templateName: ticket.template?.name,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn('Failed to broadcast scan result via WebSocket', err);
    }
  }
}
