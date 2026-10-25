import { button, details, emailLayout, emailText, esc, p } from '../common/email/layout';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ScanResult } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationPrefs, notificationPrefs } from './notification-prefs';
import { PushService } from './push.service';
import { NotificationsService } from './notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const QUARTER_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const timeFr = (d: Date) =>
  d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
const dayFr = (d: Date) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Kinshasa' });

const SCAN_LABELS: Record<ScanResult, string> = {
  VALID: 'Entrées validées',
  ALREADY_USED: 'Billets déjà utilisés',
  INVALID: 'Billets invalides',
  FRAUDULENT: 'Billets frauduleux',
  EXPIRED: 'Billets hors date',
};

/**
 * E-mail alerts the organizer chose in Paramètres → Notifications: scan summaries, fraud,
 * sold-out events and the Monday report. Only the event's organizer receives them.
 */
@Injectable()
export class OrganizerAlertsService {
  private readonly logger = new Logger(OrganizerAlertsService.name);
  private readonly mailer: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly push: PushService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
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

  private get app() {
    return this.config.get<string>('frontend.url') || 'https://app.zaya.live';
  }

  private wants(user: { notificationPrefs: unknown }, key: keyof NotificationPrefs) {
    return notificationPrefs(user.notificationPrefs)[key];
  }

  /** Called on every fraudulent scan; one e-mail per ticket and per hour */
  async fraudDetected(ticketId: string, controllerName?: string) {
    try {
      const throttle = `alert:fraud:${ticketId}`;
      if (await this.redis.get(throttle)) return;
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          serialNumber: true, holderName: true,
          event: { select: { id: true, name: true, organizer: { select: { id: true, email: true, firstName: true, notificationPrefs: true } } } },
        },
      });
      if (!ticket) return;
      const org = ticket.event.organizer;
      const byMail = this.wants(org, 'emailOnFraud');
      const byPush = this.wants(org, 'pushOnFraud');
      if (!byMail && !byPush) return;
      await this.redis.set(throttle, '1', 60 * 60);
      if (byPush) {
        await this.push.send(org.id, {
          title: `Billet frauduleux — ${ticket.event.name}`,
          body: `Le billet ${ticket.serialNumber} a été refusé à l’entrée${controllerName ? ` (${controllerName})` : ''}.`,
          data: { kind: 'fraud', eventId: ticket.event.id },
        });
      }
      if (!byMail) return;
      const subject = `Billet frauduleux présenté — ${ticket.event.name}`;
      await this.send(ticket.event.organizer.email, subject, {
        eyebrow: 'Alerte fraude',
        intro: [
          `Bonjour ${ticket.event.organizer.firstName ?? ''},`,
          'Un billet frauduleux vient d’être présenté à l’entrée. L’accès a été refusé.',
        ],
        rows: [
          ['Événement', ticket.event.name],
          ['Billet', ticket.serialNumber],
          ['Au nom de', ticket.holderName || '—'],
          ['Contrôleur', controllerName || '—'],
          ['Heure', timeFr(new Date())],
        ],
        outro: 'Prévenez votre équipe à l’entrée : la personne peut se représenter avec un autre billet.',
        cta: ['Voir les scans', `${this.app}/dashboard/events/${ticket.event.id}`],
      });
    } catch (err) {
      this.logger.warn(`Fraud alert for ticket ${ticketId} failed: ${(err as Error).message}`);
    }
  }

  /**
   * A paid order was confirmed: the organizer's dashboards update live (event room and their
   * notifications) and their phones get a push if they chose to.
   */
  async saleCompleted(paymentId: string) {
    try {
      const pay = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true, reference: true, amount: true, currency: true, holderName: true, ticketsData: true, createdAt: true,
          event: { select: { id: true, name: true, organizer: { select: { id: true, notificationPrefs: true } } } },
        },
      });
      if (!pay) return;
      const tickets = Array.isArray(pay.ticketsData) ? pay.ticketsData.length : 0;
      const amount = `${Number(pay.amount).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${pay.currency}`;
      const what = `${tickets} billet${tickets > 1 ? 's' : ''} · ${amount}`;
      try {
        this.realtime.emitToEvent(pay.event.id, 'sale:new', {
          eventId: pay.event.id, paymentId: pay.id, reference: pay.reference, amount: Number(pay.amount),
          currency: pay.currency, tickets, holderName: pay.holderName, timestamp: new Date().toISOString(),
        });
      } catch (err) {
        // Live update only: the notification and the push still go out
        this.logger.warn(`Live sale update for ${pay.event.id} failed: ${(err as Error).message}`);
      }
      await this.notifications.create(pay.event.organizer.id, {
        title: `Nouvelle vente — ${pay.event.name}`,
        message: `${what} (${pay.holderName})`,
        type: 'success',
        link: `/dashboard/events/${pay.event.id}/orders`,
      });
      if (this.wants(pay.event.organizer, 'pushOnSale')) {
        await this.push.send(pay.event.organizer.id, {
          title: `Nouvelle vente — ${pay.event.name}`,
          body: what,
          data: { kind: 'sale', eventId: pay.event.id, paymentId: pay.id },
        });
      }
    } catch (err) {
      this.logger.warn(`Sale alert for payment ${paymentId} failed: ${(err as Error).message}`);
    }
  }

  /** Every quarter of an hour: scan summaries, then sold-out events */
  @Cron('*/15 * * * *')
  async quarterly() {
    try {
      await this.scanSummaries();
    } catch (err) {
      this.logger.error('Scan summaries failed', err as Error);
    }
    try {
      await this.soldOutEvents();
    } catch (err) {
      this.logger.error('Sold-out alerts failed', err as Error);
    }
  }

  /** Scans of the quarter of an hour that just ended, one e-mail per organizer */
  async scanSummaries(now = new Date()) {
    const end = new Date(Math.floor(now.getTime() / QUARTER_MS) * QUARTER_MS);
    const start = new Date(end.getTime() - QUARTER_MS);
    const scans = await this.prisma.scanValidation.findMany({
      where: { scannedAt: { gte: start, lt: end }, ticketId: { not: null } },
      select: { result: true, ticket: { select: { event: { select: { id: true, name: true, organizerId: true } } } } },
    });
    if (!scans.length) return;

    // organizer → event → result → count
    const byOrganizer = new Map<string, Map<string, { name: string; counts: Partial<Record<ScanResult, number>> }>>();
    for (const s of scans) {
      const ev = s.ticket!.event;
      const events = byOrganizer.get(ev.organizerId) ?? new Map();
      const entry = events.get(ev.id) ?? { name: ev.name, counts: {} };
      entry.counts[s.result] = (entry.counts[s.result] ?? 0) + 1;
      events.set(ev.id, entry);
      byOrganizer.set(ev.organizerId, events);
    }

    const organizers = await this.prisma.user.findMany({
      where: { id: { in: [...byOrganizer.keys()] }, isActive: true },
      select: { id: true, email: true, firstName: true, notificationPrefs: true },
    });
    for (const o of organizers) {
      if (!this.wants(o, 'emailOnScan')) continue;
      const events = byOrganizer.get(o.id)!;
      const blocks: string[] = [];
      const text: string[] = [];
      for (const [eventId, { name, counts }] of events) {
        const entered = await this.prisma.scanValidation.count({ where: { result: 'VALID', ticket: { eventId } } });
        const rows: [string, string][] = (Object.keys(SCAN_LABELS) as ScanResult[])
          .filter((r) => counts[r])
          .map((r) => [SCAN_LABELS[r], String(counts[r])]);
        rows.push(['Entrées depuis l’ouverture', String(entered)]);
        blocks.push(p(`<strong>${esc(name)}</strong>`) + details(rows.map(([l, v]) => [esc(l), esc(v)])));
        text.push(name, ...rows.map(([l, v]) => `${l} : ${v}`), '');
      }
      const period = `${timeFr(start)} – ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' })}`;
      const subject = `Scans de ${period}`;
      await this.mail(o.email, subject, {
        preheader: `Résumé des contrôles à l’entrée, ${period}`,
        eyebrow: 'Contrôle d’accès',
        title: subject,
        body: p(`Bonjour ${esc(o.firstName ?? '')}, voici les billets scannés pendant ce quart d’heure.`) + blocks.join('') + button('Suivre en direct', `${this.app}/dashboard`),
      }, text);
    }
  }

  /** Published events whose every tariff is sold out: one e-mail per event */
  async soldOutEvents(now = new Date()) {
    const events = await this.prisma.event.findMany({
      where: { status: 'PUBLISHED', endDate: { gt: now }, ticketTemplates: { some: { quantity: { gt: 0 } } } },
      select: {
        id: true, name: true, startDate: true,
        ticketTemplates: { select: { quantity: true, availableCount: true } },
        organizer: { select: { id: true, email: true, firstName: true, isActive: true, notificationPrefs: true } },
      },
    });
    for (const ev of events) {
      const tariffs = ev.ticketTemplates.filter((t) => t.quantity > 0);
      if (!tariffs.every((t) => t.availableCount <= 0)) continue;
      const byMail = this.wants(ev.organizer, 'emailOnEventFull');
      const byPush = this.wants(ev.organizer, 'pushOnEventFull');
      if (!ev.organizer.isActive || (!byMail && !byPush)) continue;
      const sent = await this.prisma.auditLog.count({ where: { action: 'event.sold_out_alert', entity: 'event', entityId: ev.id } });
      if (sent) continue;
      const total = tariffs.reduce((n, t) => n + t.quantity, 0);
      if (byPush) {
        await this.push.send(ev.organizer.id, {
          title: `${ev.name} est complet`,
          body: `Les ${total} billets sont vendus.`,
          data: { kind: 'sold_out', eventId: ev.id },
        });
      }
      if (byMail) await this.send(ev.organizer.email, `${ev.name} est complet`, {
        eyebrow: 'Événement complet',
        intro: [
          `Bonjour ${ev.organizer.firstName ?? ''},`,
          `Tous les billets de ${ev.name} sont vendus : la billetterie en ligne n’en propose plus.`,
        ],
        rows: [
          ['Événement', ev.name],
          ['Date', dayFr(ev.startDate)],
          ['Billets', `${total} sur ${total}`],
        ],
        outro: 'Pour vendre davantage, augmentez la quantité d’un tarif ou ajoutez-en un nouveau.',
        cta: ['Gérer les tarifs', `${this.app}/dashboard/events/${ev.id}`],
      });
      await this.prisma.auditLog.create({ data: { action: 'event.sold_out_alert', entity: 'event', entityId: ev.id } });
      this.logger.log(`Sold-out alert sent for event ${ev.id}`);
    }
  }

  /** Every Monday at 8:00 in Kinshasa: the past 7 days and the coming events */
  @Cron('0 7 * * 1')
  async weekly() {
    try {
      await this.weeklyReports();
    } catch (err) {
      this.logger.error('Weekly reports failed', err as Error);
    }
  }

  async weeklyReports(now = new Date()) {
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const organizers = await this.prisma.user.findMany({
      where: { role: 'ORGANIZER', isActive: true, isEmailVerified: true },
      select: { id: true, email: true, firstName: true, notificationPrefs: true },
    });
    for (const o of organizers) {
      const byMail = this.wants(o, 'emailWeeklyReport');
      const byPush = this.wants(o, 'pushWeeklyReport');
      if (!byMail && !byPush) continue;
      const mine = { event: { organizerId: o.id } };
      const [payments, issued, entries, upcoming] = await Promise.all([
        this.prisma.payment.findMany({ where: { ...mine, status: 'COMPLETED', createdAt: { gte: since } }, select: { amount: true, currency: true } }),
        this.prisma.ticket.groupBy({ by: ['source'], where: { ...mine, createdAt: { gte: since } }, _count: true }),
        this.prisma.scanValidation.count({ where: { result: 'VALID', scannedAt: { gte: since }, ticket: mine } }),
        this.prisma.event.findMany({
          where: { organizerId: o.id, status: 'PUBLISHED', startDate: { gt: now } },
          orderBy: { startDate: 'asc' },
          take: 5,
          select: { name: true, startDate: true, ticketTemplates: { select: { quantity: true, availableCount: true } } },
        }),
      ]);
      const sold = issued.find((g) => g.source === 'ONLINE')?._count ?? 0;
      const other = issued.filter((g) => g.source !== 'ONLINE').reduce((n, g) => n + g._count, 0);
      if (!payments.length && !sold && !other && !entries && !upcoming.length) continue;

      const revenue = new Map<string, number>();
      for (const pay of payments) revenue.set(pay.currency, (revenue.get(pay.currency) ?? 0) + Number(pay.amount));
      const revenueText = revenue.size
        ? [...revenue].map(([cur, n]) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${cur}`).join(' + ')
        : '0';
      const rows: [string, string][] = [
        ['Commandes payées', String(payments.length)],
        ['Encaissé', revenueText],
        ['Billets vendus en ligne', String(sold)],
        ['Autres billets émis', String(other)],
        ['Entrées validées', String(entries)],
      ];
      const coming: [string, string][] = upcoming.map((ev) => {
        const total = ev.ticketTemplates.reduce((n, t) => n + t.quantity, 0);
        const left = ev.ticketTemplates.reduce((n, t) => n + Math.max(t.availableCount, 0), 0);
        return [`${ev.name} — ${dayFr(ev.startDate)}`, total ? `${total - left} / ${total} billets` : '—'];
      });

      const subject = 'Votre semaine sur ZAYA';
      if (byPush) {
        await this.push.send(o.id, {
          title: subject,
          body: `${payments.length} commande(s), ${revenueText} encaissé(s), ${entries} entrée(s) ces 7 derniers jours.`,
          data: { kind: 'weekly' },
        });
      }
      if (byMail) await this.mail(o.email, subject, {
        preheader: `${payments.length} commande(s), ${sold} billet(s) vendu(s), ${entries} entrée(s) ces 7 derniers jours`,
        eyebrow: 'Rapport hebdomadaire',
        title: subject,
        body:
          p(`Bonjour ${esc(o.firstName ?? '')}, voici l’activité de vos événements du ${esc(dayFr(since))} au ${esc(dayFr(now))}.`) +
          details(rows.map(([l, v]) => [esc(l), esc(v)])) +
          (coming.length ? p('<strong>Vos prochains événements</strong>') + details(coming.map(([l, v]) => [esc(l), esc(v)])) : '') +
          button('Ouvrir le tableau de bord', `${this.app}/dashboard`),
      }, [...rows.map(([l, v]) => `${l} : ${v}`), '', ...coming.map(([l, v]) => `${l} : ${v}`)]);
    }
  }

  private async send(
    to: string,
    subject: string,
    o: { eyebrow: string; intro: string[]; rows: [string, string][]; outro: string; cta: [string, string] },
  ) {
    await this.mail(to, subject, {
      preheader: o.intro[1] ?? subject,
      eyebrow: o.eyebrow,
      title: subject,
      body:
        o.intro.map((x) => p(esc(x))).join('') +
        details(o.rows.map(([l, v]) => [esc(l), esc(v)])) +
        p(esc(o.outro)) +
        button(o.cta[0], o.cta[1]),
    }, [...o.intro, ...o.rows.map(([l, v]) => `${l} : ${v}`), o.outro, o.cta[1]]);
  }

  private async mail(to: string, subject: string, layout: { preheader: string; eyebrow: string; title: string; body: string }, text: string[]) {
    if (!this.mailer) return;
    const html = emailLayout({
      ...layout,
      reason: `Vous recevez cet e-mail parce que cette alerte est activée dans vos paramètres ZAYA. <a href="${this.app}/dashboard/settings?tab=notifications" style="color:inherit;">Modifier mes notifications</a>`,
    });
    try {
      await this.mailer.sendMail({ from: this.config.get<string>('email.from'), to, subject, html, text: emailText(subject, text) });
    } catch (err) {
      this.logger.warn(`Organizer alert to ${to} failed: ${(err as Error).message}`);
    }
  }
}
