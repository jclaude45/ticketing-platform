import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from '../billing/payouts.service';

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Durations of the privacy policy (zaya.live/politique-de-confidentialite) */
export const RETENTION = {
  audienceMonths: 13,
  eventDataYears: 3,
  logsYears: 3,
  inactiveAccountYears: 3,
  accountingYears: 10,
};

/**
 * Applies the privacy policy: data is deleted or made anonymous once its retention period
 * is over (audience, scans and logs, participants of old events, inactive accounts), and
 * an organizer can close their own account.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(private readonly prisma: PrismaService, private readonly payouts: PayoutsService) {}

  /** Every night at 3:00 UTC (4:00 in Kinshasa) */
  @Cron('0 3 * * *')
  async nightly() {
    try {
      const report = await this.applyRetention();
      if (Object.values(report).some((n) => n > 0)) this.logger.log(`Retention applied: ${JSON.stringify(report)}`);
    } catch (err) {
      this.logger.error('Retention failed', err as Error);
    }
  }

  async applyRetention(now = new Date()) {
    const before = (ms: number) => new Date(now.getTime() - ms);
    const report = { views: 0, scans: 0, logs: 0, tickets: 0, teamMembers: 0, recipients: 0, merchOrders: 0, payments: 0, accounts: 0 };

    // Audience of the event pages: 13 months
    report.views = (await this.prisma.eventView.deleteMany({ where: { createdAt: { lt: before(RETENTION.audienceMonths * MONTH_MS) } } })).count;

    // Scans and action log: 3 years
    report.scans = (await this.prisma.scanValidation.deleteMany({ where: { scannedAt: { lt: before(RETENTION.logsYears * YEAR_MS) } } })).count;
    report.logs = (await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: before(RETENTION.logsYears * YEAR_MS) } } })).count;

    // Participants, guests, team and shop customers of events ended more than 3 years ago
    const oldEvents = { endDate: { lt: before(RETENTION.eventDataYears * YEAR_MS) } };
    report.tickets = (await this.prisma.ticket.updateMany({
      where: { event: oldEvents, OR: [{ holderName: { not: null } }, { holderEmail: { not: null } }, { qrCode: { not: null } }] },
      data: { holderName: null, holderEmail: null, qrCode: null, metadata: Prisma.DbNull },
    })).count;
    report.teamMembers = (await this.prisma.teamMember.updateMany({
      where: { event: oldEvents, NOT: { name: 'Membre anonymisé' } },
      data: { name: 'Membre anonymisé', email: null, phone: null, photoUrl: null, notes: null },
    })).count;
    report.recipients = (await this.prisma.campaignRecipient.deleteMany({ where: { campaign: { event: oldEvents } } })).count;
    report.merchOrders = (await this.prisma.merchOrder.updateMany({
      where: { event: oldEvents, OR: [{ buyerPhone: { not: null } }, { deliveryAddress: { not: null } }] },
      data: { buyerPhone: null, deliveryAddress: null, deliveryCity: null, deliveryNotes: null },
    })).count;

    // Payments are accounting records: 10 years, then the buyer's details are removed
    report.payments = (await this.prisma.payment.updateMany({
      where: { createdAt: { lt: before(RETENTION.accountingYears * YEAR_MS) }, NOT: { holderName: 'Acheteur anonymisé' } },
      data: { holderName: 'Acheteur anonymisé', holderEmail: '', holderPhone: null },
    })).count;

    // Organizer accounts unused for 3 years, without a recent event
    const inactiveSince = before(RETENTION.inactiveAccountYears * YEAR_MS);
    const inactive = await this.prisma.user.findMany({
      where: {
        role: 'ORGANIZER',
        isActive: true,
        OR: [{ lastLoginAt: { lt: inactiveSince } }, { lastLoginAt: null, createdAt: { lt: inactiveSince } }],
        events: { none: { endDate: { gte: inactiveSince } } },
      },
      select: { id: true },
      take: 200,
    });
    for (const u of inactive) {
      await this.anonymizeAccount(u.id);
      report.accounts += 1;
    }
    return report;
  }

  /** Closing asked by the organizer: password checked, nothing pending */
  async closeAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new NotFoundException('Compte introuvable');
    if (!(await bcrypt.compare(password ?? '', user.password))) throw new UnauthorizedException('Mot de passe incorrect');

    const upcoming = await this.prisma.event.count({ where: { organizerId: userId, status: 'PUBLISHED', endDate: { gte: new Date() } } });
    if (upcoming > 0) {
      throw new BadRequestException(
        `Vous avez ${upcoming} événement${upcoming > 1 ? 's' : ''} publié${upcoming > 1 ? 's' : ''} à venir : annulez-le${upcoming > 1 ? 's' : ''} et remboursez les acheteurs, ou attendez la fin, avant de fermer votre compte.`,
      );
    }
    const pending = (await this.payouts.forOrganizer(userId)).filter((r: any) => r.payouts.some((p: any) => p.status !== 'PAID' && p.amount !== 0));
    if (pending.length > 0) {
      throw new BadRequestException('Des versements de vos ventes sont encore en cours : votre compte pourra être fermé une fois réglés.');
    }
    const refunds = await this.prisma.refund.count({ where: { organizerId: userId, status: 'REQUESTED' } });
    if (refunds > 0) throw new BadRequestException('Des remboursements d’acheteurs sont en cours : votre compte pourra être fermé une fois effectués.');

    await this.anonymizeAccount(userId);
    return { closed: true };
  }

  /**
   * Removes what identifies the person; events, sales and payments stay (accounting, buyers'
   * tickets) but are no longer linked to a name, an e-mail or payout details.
   */
  private async anonymizeAccount(userId: string) {
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `compte-ferme-${userId}@anonyme.zaya.live`,
          firstName: 'Compte',
          lastName: 'fermé',
          password: randomPassword,
          avatar: null,
          payoutInfo: Prisma.DbNull,
          isActive: false,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          refreshToken: null,
          passwordResetToken: null,
          passwordResetExpiry: null,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        },
      }),
      this.prisma.controller.updateMany({ where: { organizerId: userId }, data: { isActive: false } }),
      this.prisma.accountMember.deleteMany({ where: { OR: [{ ownerId: userId }, { userId }] } }),
      this.prisma.organizerSubscription.deleteMany({ where: { organizerId: userId } }),
      this.prisma.eventDraft.deleteMany({ where: { ownerId: userId } }),
    ]);
    this.logger.log(`Account ${userId} anonymized`);
  }
}
