import { button, emailLayout, emailText, esc, p } from '../common/email/layout';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How long before the end of a paid month the organizer is reminded */
const REMIND_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayFr = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Kinshasa' });

/**
 * Paid plans are not renewed automatically: the organizer is told a few days before the end
 * of the paid month, then when the account is back on the free plan. Each message is sent once
 * per end date (recorded in the audit log).
 */
@Injectable()
export class PlanRemindersService {
  private readonly logger = new Logger(PlanRemindersService.name);
  private readonly mailer: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {
    const host = this.config.get<string>('email.host');
    const user = this.config.get<string>('email.user');
    if (host && user) {
      this.mailer = nodemailer.createTransport({
        host,
        port: this.config.get<number>('email.port') ?? 587,
        secure: this.config.get<boolean>('email.secure') ?? false,
        auth: { user, pass: this.config.get<string>('email.password') },
      });
    }
  }

  /** Every day at 9:00 in Kinshasa */
  @Cron('0 8 * * *')
  async run() {
    try {
      await this.remindEnding();
      await this.noticeEnded();
    } catch (err) {
      this.logger.error('Plan reminders failed', err as Error);
    }
  }

  private async alreadySent(action: string, organizerId: string, expiresAt: Date) {
    const n = await this.prisma.auditLog.count({
      where: { action, entity: 'subscription', entityId: organizerId, newValues: { path: ['expiresAt'], equals: expiresAt.toISOString() } },
    });
    return n > 0;
  }

  private async record(action: string, organizerId: string, expiresAt: Date, planName: string) {
    await this.prisma.auditLog.create({
      data: { userId: organizerId, action, entity: 'subscription', entityId: organizerId, newValues: { expiresAt: expiresAt.toISOString(), planName } },
    });
  }

  private async remindEnding() {
    const now = new Date();
    const subs = await this.prisma.organizerSubscription.findMany({
      where: { status: 'ACTIVE', expiresAt: { gt: now, lte: new Date(now.getTime() + REMIND_DAYS * DAY_MS) }, plan: { price: { gt: 0 } } },
      include: { plan: true, organizer: { select: { email: true, firstName: true } } },
    });
    for (const s of subs) {
      if (await this.alreadySent('subscription.reminder', s.organizerId, s.expiresAt!)) continue;
      const end = dayFr(s.expiresAt!);
      await this.notifications.create(s.organizerId, {
        title: `Votre plan ${s.plan.name} se termine le ${end}`,
        message: 'Renouvelez-le pour garder vos quotas : sinon votre compte repassera au plan Gratuit. Votre billetterie en ligne continue dans tous les cas.',
        type: 'warning',
        link: '/dashboard/subscription#plans',
      });
      await this.email(s.organizer.email, `Votre plan ${s.plan.name} se termine le ${end}`, [
        `Bonjour ${s.organizer.firstName ?? ''},`,
        `Votre plan ${s.plan.name} (${s.plan.price} $ par mois) se termine le ${end}. Il n’est pas renouvelé automatiquement.`,
        'Pour le garder, renouvelez-le depuis « Mon abonnement ». Sans renouvellement, votre compte repassera au plan Gratuit : votre billetterie en ligne et vos scans continuent, seuls les quotas de billets et de badges à imprimer changent.',
      ]);
      await this.record('subscription.reminder', s.organizerId, s.expiresAt!, s.plan.name);
      this.logger.log(`Plan end reminder sent to organizer ${s.organizerId}`);
    }
  }

  private async noticeEnded() {
    const now = new Date();
    const subs = await this.prisma.organizerSubscription.findMany({
      where: { expiresAt: { lte: now, gt: new Date(now.getTime() - 7 * DAY_MS) }, plan: { price: { gt: 0 } } },
      include: { plan: true, organizer: { select: { email: true, firstName: true } } },
    });
    for (const s of subs) {
      if (await this.alreadySent('subscription.ended', s.organizerId, s.expiresAt!)) continue;
      await this.notifications.create(s.organizerId, {
        title: `Votre plan ${s.plan.name} est terminé`,
        message: 'Votre compte est repassé au plan Gratuit. Vous pouvez reprendre un plan à tout moment.',
        type: 'info',
        link: '/dashboard/subscription#plans',
      });
      await this.email(s.organizer.email, `Votre plan ${s.plan.name} est terminé`, [
        `Bonjour ${s.organizer.firstName ?? ''},`,
        `Votre plan ${s.plan.name} s’est terminé le ${dayFr(s.expiresAt!)} : votre compte est repassé au plan Gratuit (100 billets à imprimer et 20 badges par événement, 2 contrôleurs).`,
        'Votre billetterie en ligne, vos scans et vos statistiques continuent normalement. Vous pouvez reprendre un plan à tout moment depuis « Mon abonnement ».',
      ]);
      await this.record('subscription.ended', s.organizerId, s.expiresAt!, s.plan.name);
    }
  }

  private async email(to: string, subject: string, paragraphs: string[]) {
    if (!this.mailer) return;
    const app = this.config.get<string>('frontend.url') || 'https://app.zaya.live';
    const url = `${app}/dashboard/subscription#plans`;
    const html = emailLayout({
      preheader: paragraphs[1] ?? subject,
      eyebrow: 'Abonnement',
      title: subject,
      body: paragraphs.map((x) => p(esc(x))).join('') + button('Mon abonnement', url),
      reason: 'Vous recevez cet e-mail parce que vous avez un plan payant sur ZAYA.',
    });
    try {
      await this.mailer.sendMail({ from: this.config.get<string>('email.from'), to, subject, html, text: emailText(subject, [...paragraphs, url]) });
    } catch (err) {
      this.logger.warn(`Plan reminder e-mail to ${to} failed: ${(err as Error).message}`);
    }
  }
}
