import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel, CampaignStatus, CampaignType, RecipientStatus, Role } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { Twilio } from 'twilio';
import { CreateCampaignDto, UpdateCampaignDto, ScheduleCampaignDto } from './dto/create-campaign.dto';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';
import { DEFAULT_TEMPLATES } from './default-templates';
import { SubscriptionService } from '../subscription/subscription.service';
import { esc } from '../common/email/layout';
import { unsubscribeLinks } from './unsubscribe';
import { createBulkTransport } from '../common/email/bulk-transport';
import { EmailVerifierService } from '../common/email/email-verifier.service';
import { SmsService } from '../common/sms/sms.service';
import { toInternationalPhone } from '../common/phone';
import { StorageService } from '../storage/storage.service';
import { MAX_IMAGE_PIXELS } from '../common/image-limits';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');

/**
 * Free plan: campaigns leave from ZAYA's mail domain, and a free account (made by a bot as
 * easily as by a person) must not turn it into a spam channel that gets it blocklisted.
 */
const FREE_CAMPAIGNS_PER_EVENT = 5;
const FREE_RECIPIENTS_PER_DAY = 300;
/**
 * Refusal meaning the mail provider will take nothing more for now (daily / monthly quota,
 * rate limit), as opposed to one bad address: the send stops instead of burning the list.
 */
const isQuotaError = (err: any) =>
  err?.quota === true || /sending limit|quota|rate limit|too many (messages|emails|requests)|limit exceeded/i.test(String(err?.message ?? err));

/** Imported addresses reachable per 24 hours: to start, and at most */
const IMPORTED_DAILY_START = 200;
const IMPORTED_DAILY_MAX = 5000;

/** Messages sent at the same time (as many SMTP connections in the pool) */
const SEND_CONCURRENCY = 5;

const OLD_UNSUBSCRIBE_LINE = 'Pour ne plus en recevoir, répondez à ce message.';
/** Footer of the predefined templates: "Envoyé avec ZAYA" already signs them */
const ZAYA_SIGNED = /Envoyé avec\s*<strong[^>]*>ZAYA<\/strong>/;
const UNSUBSCRIBE_LINE = '<a href="{{unsubscribeUrl}}" style="color:#6b6b6b;text-decoration:underline;">Se désinscrire</a>';

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);
  private mailerTransport: nodemailer.Transporter;
  private twilioClient: Twilio | null = null;
  private readonly twilioFrom: string;
  private readonly twilioWhatsAppFrom: string;
  private readonly emailFrom: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionService,
    private readonly storage: StorageService,
    private readonly verifier: EmailVerifierService,
    private readonly sms: SmsService,
  ) {
    this.mailerTransport = nodemailer.createTransport({
      host: config.get('email.host'),
      port: config.get('email.port'),
      secure: false,
      auth: {
        user: config.get('email.user'),
        pass: config.get('email.password'),
      },
      // Connections kept open and shared: campaigns send several messages at once
      pool: true,
      maxConnections: SEND_CONCURRENCY,
    });
    // Campaigns go through the bulk stream: their bounces or spam complaints never get the
    // tickets' and login codes' stream suspended
    const bulk = createBulkTransport(config, SEND_CONCURRENCY);
    if (bulk) {
      this.mailerTransport = bulk;
      this.logger.log('Campagnes : flux d’envoi groupé (bulk)');
    } else {
      this.logger.warn('Campagnes : pas de flux groupé configuré, envoi par le SMTP des e-mails de la plateforme');
    }
    this.emailFrom = config.get('email.from') || 'noreply@ticketing.com';

    const sid = config.get<string>('twilio.accountSid');
    const token = config.get<string>('twilio.authToken');
    if (sid && token) {
      this.twilioClient = new Twilio(sid, token);
      this.twilioFrom = config.get<string>('twilio.phoneNumber') || '';
      this.twilioWhatsAppFrom = config.get<string>('twilio.whatsappFrom') || 'whatsapp:+14155238886';
    }
  }

  getChannelStatus() {
    return {
      email: true,
      sms: this.sms.enabled || (!!this.twilioClient && !!this.twilioFrom),
      whatsapp: !!this.twilioClient && !!this.twilioWhatsAppFrom,
    };
  }

  // ─── Access helpers ───────────────────────────────────────────

  private async assertEventAccess(eventId: string, userId: string, role: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }
  }

  private async assertCampaignAccess(campaignId: string, userId: string, role: Role) {
    const c = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: { event: { select: { organizerId: true } } },
    });
    if (!c) throw new NotFoundException('Campagne introuvable');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && c.event.organizerId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }
  }

  // ─── IMAGES ───────────────────────────────────────────────────

  /**
   * Picture put in a campaign or template: stored once, then linked by URL from every e-mail.
   * Resized to 1200 px wide (twice the 600 px of the e-mail, sharp on phones) and re-encoded:
   * a 5 MB photo sent to every guest would weigh on their data and on deliverability.
   * WebP becomes JPEG or PNG, which Outlook and older mail apps do not show otherwise.
   */
  async uploadImage(userId: string, file: { buffer: Buffer }) {
    const ext = this.storage.imageExtension(file.buffer);
    let buffer = file.buffer;
    let type = 'image/gif';
    let out: string = ext;
    // GIFs keep their animation, as long as they stay light
    if (ext === '.gif') {
      if (buffer.length > 2 * 1024 * 1024) throw new BadRequestException('GIF trop lourd : 2 Mo au maximum');
    } else {
      const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
      const meta = await image.metadata().catch(() => null);
      if (!meta?.width || !meta?.height) throw new BadRequestException('Image illisible');
      const resized = image.resize({ width: 1200, withoutEnlargement: true });
      if (meta.hasAlpha) {
        buffer = await resized.png({ compressionLevel: 9 }).toBuffer();
        type = 'image/png'; out = '.png';
      } else {
        buffer = await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        type = 'image/jpeg'; out = '.jpg';
      }
    }
    const { url } = await this.storage.uploadBuffer(buffer, `${randomUUID()}${out}`, type, `campaigns/${userId}`);
    return { url };
  }

  // ─── TEMPLATES ────────────────────────────────────────────────

  async getTemplates(organizerId: string) {
    return this.prisma.notificationTemplate.findMany({
      where: { organizerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(organizerId: string, dto: CreateTemplateDto) {
    return this.prisma.notificationTemplate.create({
      data: { ...dto, organizerId },
    });
  }

  async updateTemplate(templateId: string, organizerId: string, dto: UpdateTemplateDto) {
    await this.findTemplateOrFail(templateId, organizerId);
    return this.prisma.notificationTemplate.update({
      where: { id: templateId },
      data: dto,
    });
  }

  async deleteTemplate(templateId: string, organizerId: string) {
    await this.findTemplateOrFail(templateId, organizerId);
    await this.prisma.notificationTemplate.delete({ where: { id: templateId } });
  }

  async initDefaultTemplates(organizerId: string) {
    // Only create templates that don't already exist (idempotent)
    const existing = await this.prisma.notificationTemplate.findMany({
      where: { organizerId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map(t => t.name));

    const toCreate = DEFAULT_TEMPLATES.filter(t => !existingNames.has(t.name));
    if (toCreate.length === 0) {
      return { created: 0, message: 'Tous les modèles sont déjà présents' };
    }

    await this.prisma.notificationTemplate.createMany({
      data: toCreate.map(t => ({
        name: t.name,
        channel: t.channel as NotificationChannel,
        subject: t.subject,
        body: t.body,
        isDefault: t.isDefault,
        organizerId,
      })),
    });

    return {
      created: toCreate.length,
      message: `${toCreate.length} modèle(s) créé(s) avec succès`,
    };
  }

  private async findTemplateOrFail(templateId: string, organizerId: string) {
    const tpl = await this.prisma.notificationTemplate.findFirst({
      where: { id: templateId, organizerId },
    });
    if (!tpl) throw new NotFoundException('Template introuvable');
    return tpl;
  }

  // ─── CAMPAIGNS ────────────────────────────────────────────────

  async getCampaigns(eventId: string, userId: string, role: Role) {
    await this.assertEventAccess(eventId, userId, role);
    return this.prisma.notificationCampaign.findMany({
      where: { eventId },
      include: {
        _count: { select: { recipients: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        list: { select: { id: true, name: true, _count: { select: { members: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaign(campaignId: string, userId: string, role: Role) {
    await this.assertCampaignAccess(campaignId, userId, role);
    const c = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: { orderBy: { createdAt: 'desc' }, take: 100 },
        createdBy: { select: { firstName: true, lastName: true } },
        event: { select: { name: true, startDate: true, timeZone: true, venue: true, city: true, bannerUrl: true } },
      },
    });
    if (!c) throw new NotFoundException('Campagne introuvable');
    return c;
  }

  async createCampaign(eventId: string, userId: string, role: Role, dto: CreateCampaignDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }
    if (dto.listId) {
      const list = await this.prisma.mailingList.findFirst({ where: { id: dto.listId, organizerId: event.organizerId }, select: { id: true } });
      if (!list) throw new BadRequestException('Liste de diffusion introuvable');
    }

    return this.prisma.notificationCampaign.create({
      data: {
        name: dto.name,
        eventId,
        listId: dto.listId || null,
        channel: dto.channel,
        type: dto.type || CampaignType.CUSTOM,
        subject: dto.subject,
        body: dto.body,
        templateId: dto.templateId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
        createdById: userId,
      },
    });
  }

  async updateCampaign(campaignId: string, userId: string, role: Role, dto: UpdateCampaignDto) {
    await this.assertCampaignAccess(campaignId, userId, role);
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException('Campagne introuvable');
    if (c.status === CampaignStatus.SENT || c.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Impossible de modifier une campagne déjà envoyée');
    }
    return this.prisma.notificationCampaign.update({ where: { id: campaignId }, data: dto });
  }

  async deleteCampaign(campaignId: string, userId: string, role: Role) {
    await this.assertCampaignAccess(campaignId, userId, role);
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException('Campagne introuvable');
    await this.prisma.notificationCampaign.delete({ where: { id: campaignId } });
  }

  async scheduleCampaign(campaignId: string, userId: string, role: Role, dto: ScheduleCampaignDto) {
    await this.assertCampaignAccess(campaignId, userId, role);
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException('Campagne introuvable');
    return this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { scheduledAt: new Date(dto.scheduledAt), status: CampaignStatus.SCHEDULED },
    });
  }

  async sendCampaign(campaignId: string, userId: string, role: Role) {
    await this.assertCampaignAccess(campaignId, userId, role);
    return this._sendCampaignInternal(campaignId);
  }

  private async _sendCampaignInternal(campaignId: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      include: { event: true },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Envoi déjà en cours');
    }
    if (campaign.status === CampaignStatus.SENT) {
      throw new BadRequestException('Cette campagne a déjà été envoyée à tous ses destinataires');
    }

    const recipients = await this.buildRecipients(campaign);
    if (recipients.length === 0) {
      const sms = campaign.channel === NotificationChannel.SMS;
      throw new BadRequestException(
        campaign.listId ? (sms ? 'Aucun membre de la liste n’a de numéro de téléphone valide.' : 'La liste de diffusion est vide.')
          : sms ? 'Aucun participant avec un numéro de téléphone valide pour cet événement.'
          : 'Aucun participant avec une adresse e-mail pour cet événement.',
      );
    }
    await this.assertSendAllowed(campaign, recipients);

    await this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.SENDING },
    });

    this.dispatchCampaign(campaign, recipients).catch(err =>
      this.logger.error(`Erreur envoi campagne ${campaignId}: ${err.message}`)
    );

    // A resumed send only goes to those not reached yet; imported addresses beyond today's
    // allowance wait for a later "Reprendre"
    const pending = recipients.filter(r => r.status !== RecipientStatus.SENT);
    const allowance = await this.importedAllowance(campaign.event.organizerId);
    const importedPending = pending.filter(r => r.imported).length;
    const held = Math.max(0, importedPending - allowance);
    return { message: 'Envoi lancé', recipientCount: pending.length - held, held, importedAllowance: allowance };
  }

  async getCampaignStats(campaignId: string, userId: string, role: Role) {
    await this.assertCampaignAccess(campaignId, userId, role);
    const c = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      include: {
        _count: { select: { recipients: true } },
      },
    });
    if (!c) throw new NotFoundException('Campagne introuvable');

    const stats = await this.prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { status: true },
    });

    const result: Record<string, number> = { PENDING: 0, SENT: 0, FAILED: 0 };
    stats.forEach(s => { result[s.status] = s._count.status; });

    return {
      total: c._count.recipients,
      sent: result.SENT,
      failed: result.FAILED,
      pending: result.PENDING,
      successRate: c._count.recipients > 0
        ? Math.round((result.SENT / c._count.recipients) * 100)
        : 0,
      campaign: { id: c.id, name: c.name, status: c.status, sentAt: c.sentAt },
    };
  }

  // ─── TEST E-MAIL ──────────────────────────────────────────────

  /**
   * A design as a guest will get it, sent to the organizer before the real send. The variables
   * are filled with the event's details and the organizer's own name. It goes to their account
   * address unless they give another one (a colleague, another mail app to check the rendering).
   */
  async sendTest(userId: string, role: Role, dto: { eventId: string; subject?: string; body: string; to?: string }) {
    await this.assertEventAccess(dto.eventId, userId, role);
    const [event, user] = await Promise.all([
      this.prisma.event.findUniqueOrThrow({
        where: { id: dto.eventId },
        select: { name: true, startDate: true, timeZone: true, venue: true, city: true, bannerUrl: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, lastName: true } }),
    ]);
    const to = dto.to?.trim() || user.email;
    const { body, subject } = this.render(
      { channel: NotificationChannel.EMAIL, subject: dto.subject, body: dto.body, event },
      { firstName: user.firstName, lastName: user.lastName, ticketId: 'TEST-0000' },
    );
    try {
      await this.sendEmail(to, `[TEST] ${subject || event.name}`, body);
    } catch (err) {
      this.logger.warn(`Échec du mail test : ${err.message}`);
      throw new BadRequestException('Le mail test n’a pas pu partir. Réessayez dans un instant.');
    }
    return { to };
  }

  // ─── EVENT OVERVIEW ───────────────────────────────────────────

  async getEventStats(eventId: string, userId: string, role: Role) {
    await this.assertEventAccess(eventId, userId, role);
    const campaigns = await this.prisma.notificationCampaign.findMany({
      where: { eventId },
      select: { channel: true, totalSent: true, totalFailed: true, status: true },
    });

    const totals = { emailSent: 0, smsSent: 0, whatsappSent: 0, totalFailed: 0 };
    campaigns.forEach(c => {
      if (c.channel === NotificationChannel.EMAIL) totals.emailSent += c.totalSent;
      if (c.channel === NotificationChannel.SMS) totals.smsSent += c.totalSent;
      if (c.channel === NotificationChannel.WHATSAPP) totals.whatsappSent += c.totalSent;
      totals.totalFailed += c.totalFailed;
    });

    return { ...totals, campaignCount: campaigns.length };
  }

  // ─── AUTO-REMINDERS ───────────────────────────────────────────

  async setupAutoReminders(eventId: string, userId: string, role: Role) {
    await this.assertEventAccess(eventId, userId, role);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Événement introuvable');

    const existing = await this.prisma.notificationCampaign.findMany({
      where: {
        eventId,
        type: { in: [CampaignType.REMINDER_7D, CampaignType.REMINDER_1D] },
      },
    });

    const created: string[] = [];

    if (!existing.find(c => c.type === CampaignType.REMINDER_7D)) {
      const send7 = new Date(event.startDate);
      send7.setDate(send7.getDate() - 7);
      send7.setHours(8, 0, 0, 0);
      const tpl7 = DEFAULT_TEMPLATES.find(t => t.name === 'Rappel J-7');
      await this.prisma.notificationCampaign.create({
        data: {
          name: `Rappel J-7 — ${event.name}`,
          eventId,
          channel: NotificationChannel.EMAIL,
          type: CampaignType.REMINDER_7D,
          subject: tpl7?.subject ?? `{{eventName}} — Dans 7 jours, votre billet vous attend`,
          body: tpl7?.body ?? '',
          scheduledAt: send7,
          status: CampaignStatus.SCHEDULED,
          createdById: userId,
        },
      });
      created.push('REMINDER_7D');
    }

    if (!existing.find(c => c.type === CampaignType.REMINDER_1D)) {
      const send1 = new Date(event.startDate);
      send1.setDate(send1.getDate() - 1);
      send1.setHours(8, 0, 0, 0);
      const tpl1 = DEFAULT_TEMPLATES.find(t => t.name === 'Rappel J-1');
      await this.prisma.notificationCampaign.create({
        data: {
          name: `Rappel J-1 — ${event.name}`,
          eventId,
          channel: NotificationChannel.EMAIL,
          type: CampaignType.REMINDER_1D,
          subject: tpl1?.subject ?? `{{eventName}} — Votre billet pour demain`,
          body: tpl1?.body ?? '',
          scheduledAt: send1,
          status: CampaignStatus.SCHEDULED,
          createdById: userId,
        },
      });
      created.push('REMINDER_1D');
    }

    return { created, message: created.length ? `${created.length} rappel(s) programmé(s)` : 'Rappels déjà configurés' };
  }

  // ─── CRON: every 5 minutes ────────────────────────────────────

  /** Campaigns leave at the time chosen (within 5 minutes), not the next morning at 8 */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processScheduledCampaigns() {
    const now = new Date();

    const due = await this.prisma.notificationCampaign.findMany({
      where: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      include: { event: true },
    });

    if (due.length) this.logger.log(`${due.length} campagne(s) à envoyer`);

    for (const campaign of due) {
      // Taken by this run only (another instance, or a manual send, may have started it)
      const { count } = await this.prisma.notificationCampaign.updateMany({
        where: { id: campaign.id, status: CampaignStatus.SCHEDULED },
        data: { status: CampaignStatus.SENDING },
      });
      if (count === 0) continue;
      try {
        const recipients = await this.buildRecipients(campaign);
        await this.assertSendAllowed(campaign, recipients);
        await this.dispatchCampaign(campaign, recipients);
      } catch (err) {
        this.logger.error(`Échec campagne ${campaign.id}: ${err.message}`);
        await this.prisma.notificationCampaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.FAILED },
        });
      }
    }
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────

  /** Plan limits of a send: communication allowed, and the free plan's caps */
  private async assertSendAllowed(campaign: { id: string; eventId: string; channel: NotificationChannel; event: { organizerId: string } }, recipients: { status: RecipientStatus; imported: boolean }[]) {
    const organizerId = campaign.event.organizerId;
    const { plan } = await this.subscriptions.getEffectivePlan(organizerId);
    if (!plan.allowCommunication) throw new ForbiddenException('Votre forfait ne comprend pas les campagnes.');
    // Every SMS is paid from ZAYA's SMS credits
    if (campaign.channel === NotificationChannel.SMS && plan.code === 'FREE') {
      throw new ForbiddenException('Les campagnes SMS sont réservées aux forfaits payants.');
    }
    const problem = await this.reputationProblem(organizerId);
    if (problem) throw new ForbiddenException(problem);
    if (plan.code !== 'FREE') return;

    const SENT_STATUSES = [CampaignStatus.SENDING, CampaignStatus.SENT, CampaignStatus.PARTIALLY_SENT];
    const sentForEvent = await this.prisma.notificationCampaign.count({
      where: { eventId: campaign.eventId, id: { not: campaign.id }, status: { in: SENT_STATUSES } },
    });
    if (sentForEvent >= FREE_CAMPAIGNS_PER_EVENT) {
      throw new ForbiddenException(`Le forfait gratuit permet ${FREE_CAMPAIGNS_PER_EVENT} campagnes par événement. Passez à un forfait payant pour en envoyer davantage.`);
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentToday = await this.prisma.campaignRecipient.count({
      where: { status: RecipientStatus.SENT, sentAt: { gte: since }, campaign: { event: { organizerId } } },
    });
    // What actually leaves now: imported addresses beyond today's allowance wait
    const pending = recipients.filter((r) => r.status !== RecipientStatus.SENT);
    const imported = pending.filter((r) => r.imported).length;
    const toSend = pending.length - imported + Math.min(imported, await this.importedAllowance(organizerId));
    if (sentToday + toSend > FREE_RECIPIENTS_PER_DAY) {
      throw new ForbiddenException(`Le forfait gratuit permet ${FREE_RECIPIENTS_PER_DAY} envois par 24 heures (déjà ${sentToday}, cette campagne : ${toSend}). Réessayez plus tard ou passez à un forfait payant.`);
    }
  }


  /** Those of these addresses that no campaign may reach (bounced, rejected, reported spam) */
  private async suppressedAmong(emails: string[]): Promise<Set<string>> {
    const lower = Array.from(new Set(emails.map(e => e.trim().toLowerCase())));
    const found = new Set<string>();
    for (let i = 0; i < lower.length; i += 5000) {
      (await this.prisma.emailSuppression.findMany({ where: { email: { in: lower.slice(i, i + 5000) } }, select: { email: true } }))
        .forEach(r => found.add(r.email));
    }
    return found;
  }

  /** The campaign's list, or every ticket holder of its event; fixed at the first send */
  private async buildRecipients(campaign: { id: string; eventId: string; listId: string | null; channel: NotificationChannel; event: { organizerId: string } }) {
    const campaignId = campaign.id;
    const eventId = campaign.eventId;
    // Check if recipients already created
    const existing = await this.prisma.campaignRecipient.count({ where: { campaignId } });
    if (existing > 0) {
      return this.prisma.campaignRecipient.findMany({ where: { campaignId } });
    }
    // Those who used the unsubscribe link of one of this organizer's campaigns
    const gone = new Set((await this.prisma.emailUnsubscribe.findMany({
      where: { organizerId: campaign.event.organizerId }, select: { email: true },
    })).map(u => u.email));
    // and addresses that bounced or reported spam, whoever sent to them
    const suppressed = await this.suppressedAmong(campaign.listId
      ? (await this.prisma.mailingListMember.findMany({ where: { listId: campaign.listId }, select: { email: true } })).map(m => m.email)
      : (await this.prisma.ticket.findMany({ where: { eventId, holderEmail: { not: null } }, select: { holderEmail: true } })).map(t => t.holderEmail!));
    const wanted = (email: string | null) => !!email && !gone.has(email.trim().toLowerCase()) && !suppressed.has(email.trim().toLowerCase());
    // SMS: whoever has a number, once per number (an e-mail bounce says nothing of a phone);
    // those who unsubscribed from the organizer's campaigns stay out
    const sms = campaign.channel === NotificationChannel.SMS;
    const numbers = new Set<string>();
    const reachable = (email: string | null, phone: string | null) => {
      if (!sms) return wanted(email);
      const number = toInternationalPhone(phone);
      if (!number || numbers.has(number) || (email && gone.has(email.trim().toLowerCase()))) return false;
      numbers.add(number);
      return true;
    };

    if (campaign.listId) {
      const members = (await this.prisma.mailingListMember.findMany({ where: { listId: campaign.listId } })).filter(m => reachable(m.email, m.phone));
      if (members.length === 0) return [];
      await this.prisma.campaignRecipient.createMany({
        data: members.map(m => ({ campaignId, email: m.email, phone: m.phone, firstName: m.firstName, lastName: m.lastName, imported: m.imported })),
      });
      return this.prisma.campaignRecipient.findMany({ where: { campaignId } });
    }

    const tickets = (await this.prisma.ticket.findMany({
      where: {
        eventId,
        status: { in: ['VALID', 'PENDING'] },
        ...(sms ? { holderPhone: { not: null } } : { holderEmail: { not: null } }),
      },
      include: { template: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })).filter(t => reachable(t.holderEmail, t.holderPhone));

    if (tickets.length === 0) return [];

    await this.prisma.campaignRecipient.createMany({
      data: tickets.map(t => ({
        campaignId,
        email: t.holderEmail,
        phone: t.holderPhone,
        firstName: (t.holderName || 'Participant').split(' ')[0],
        lastName: (t.holderName || '').split(' ').slice(1).join(' ') || '',
        ticketId: t.id,
      })),
    });

    return this.prisma.campaignRecipient.findMany({ where: { campaignId } });
  }

  /**
   * Sends to everyone not reached yet, a few at a time (one by one, 500 e-mails took 9 minutes).
   * The totals are saved as it goes: the dashboard shows the progress, and a send cut short
   * (restart, deploy) is picked up again by the cron from where it stopped.
   */
  private async dispatchCampaign(campaign: any, recipients: any[]) {
    const organizerId: string = campaign.event.organizerId;
    let queue = recipients.filter(r => r.status !== RecipientStatus.SENT);

    const email = campaign.channel === NotificationChannel.EMAIL;
    // Bounced or reported since the list was built (a resumed send): left out for good
    const suppressed = email ? await this.suppressedAmong(queue.filter(r => r.email).map(r => r.email)) : new Set<string>();
    const excluded = queue.filter(r => r.email && suppressed.has(r.email.trim().toLowerCase()));
    if (excluded.length) {
      await this.prisma.campaignRecipient.updateMany({
        where: { id: { in: excluded.map(r => r.id) } },
        data: { status: RecipientStatus.FAILED, error: 'Adresse exclue : rebond ou signalement de spam' },
      });
      queue = queue.filter(r => !excluded.includes(r));
    }

    // Imported addresses: today's allowance first, ticket holders always
    const allowance = await this.importedAllowance(organizerId);
    const imported = queue.filter(r => r.imported);
    let todayImported = imported.slice(0, allowance);

    // Those are verified before anything is sent: only deliverable ones are written to. The
    // ones the service could not reach stay pending, for "Reprendre"
    if (email && this.verifier.enabled && todayImported.length) {
      // Visible progress: the stalled-send cron leaves a campaign that moved alone
      await this.prisma.notificationCampaign.update({ where: { id: campaign.id }, data: { updatedAt: new Date() } });
      const verdicts = await this.verifier.verify(todayImported.map(r => r.email));
      const verdictOf = (r: any) => verdicts.get(String(r.email).trim().toLowerCase());
      for (const [verdict, error] of [
        ['undeliverable', 'Adresse invalide selon la vérification : non envoyée'],
        ['risky', 'Adresse non confirmée par la vérification (le serveur accepte toute adresse) : non envoyée'],
        ['unknown', 'Adresse impossible à vérifier : non envoyée'],
      ] as const) {
        const ids = todayImported.filter(r => verdictOf(r) === verdict).map(r => r.id);
        if (ids.length) await this.prisma.campaignRecipient.updateMany({ where: { id: { in: ids } }, data: { status: RecipientStatus.FAILED, error } });
      }
      todayImported = todayImported.filter(r => verdictOf(r) === 'deliverable');
    }
    queue = [...queue.filter(r => !r.imported), ...todayImported];

    let done = 0;
    // The mail provider's quota is reached, or too many bounces and complaints come back:
    // every next message would be refused too, or hurt the sender's standing
    let quota: string | null = null;
    const worker = async () => {
      for (let r = queue.shift(); r && !quota; r = queue.shift()) {
        quota = await this.sendToRecipient(campaign, r);
        if (++done % 20 === 0) {
          await this.saveProgress(campaign.id);
          quota ??= await this.reputationProblem(organizerId);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, queue.length) }, worker));

    const { sent, failed, pending } = await this.saveProgress(campaign.id);
    if (quota) this.logger.error(`Campagne ${campaign.id} arrêtée, limite d'envoi atteinte : ${quota}`);
    // Those not reached stay pending: "Reprendre l'envoi" sends to them later
    const finalStatus =
      failed === 0 && pending === 0 ? CampaignStatus.SENT :
      sent === 0 ? CampaignStatus.FAILED :
      CampaignStatus.PARTIALLY_SENT;

    await this.prisma.notificationCampaign.update({
      where: { id: campaign.id },
      data: { status: finalStatus, sentAt: new Date() },
    });

    this.logger.log(`Campagne ${campaign.id}: ${sent} envoyés, ${failed} échoués`);
  }

  /** Sends one message; returns the provider's refusal when its sending quota is reached */
  private async sendToRecipient(campaign: any, recipient: any): Promise<string | null> {
    const unsubscribe = recipient.email ? this.unsubscribeLinks(campaign.event.organizerId, recipient.email) : null;
    const { body, subject } = this.render(campaign, recipient, unsubscribe?.page);
    const send = async () => {
      if (campaign.channel === NotificationChannel.EMAIL && recipient.email) {
        await this.sendEmail(recipient.email, subject || campaign.name, body, unsubscribe?.oneClick);
      } else if (campaign.channel === NotificationChannel.SMS && recipient.phone) {
        await this.sendSms(recipient.phone, body);
      } else if (campaign.channel === NotificationChannel.WHATSAPP && recipient.phone) {
        await this.sendWhatsApp(recipient.phone, body);
      } else {
        return false;
      }
      return true;
    };

    try {
      // One more try after a pause: a mail server asking to slow down answers with a temporary error
      const reached = await send().catch(async (err) => {
        if (isQuotaError(err)) throw err;
        await new Promise(r => setTimeout(r, 3000));
        return send();
      });
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: reached
          ? { status: RecipientStatus.SENT, sentAt: new Date(), error: null }
          : { status: RecipientStatus.FAILED, error: 'Coordonnées manquantes' },
      });
    } catch (err) {
      // Quota: not this person's fault, they stay pending for the next attempt
      if (isQuotaError(err)) return String(err.message);
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: RecipientStatus.FAILED, error: String(err.message).slice(0, 500) },
      });
      this.logger.warn(`Échec envoi campagne ${campaign.id}: ${err.message}`);
    }
    return null;
  }

  /**
   * Imported addresses an organizer may reach in the next send: 200 a day to start, plus as
   * many as their imported addresses reached in the last 30 days without bounce or complaint
   * (a list that proves real opens the way for more). A bought or made-up list cannot get far.
   */
  private async importedAllowance(organizerId: string): Promise<number> {
    const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const base = { imported: true, status: RecipientStatus.SENT, campaign: { event: { organizerId } } };
    const [today, proven] = await Promise.all([
      this.prisma.campaignRecipient.count({ where: { ...base, sentAt: { gte: day } } }),
      this.prisma.campaignRecipient.count({ where: { ...base, sentAt: { gte: month, lt: day }, feedback: null } }),
    ]);
    return Math.max(0, Math.min(IMPORTED_DAILY_MAX, IMPORTED_DAILY_START + proven) - today);
  }

  /**
   * Bounces and spam reports on the organizer's last 24 hours of campaigns: past 5 % (with at
   * least 10), their campaigns stop until it falls back. That is what got ZAYA's sending
   * suspended once, for every organizer's tickets.
   */
  private async reputationProblem(organizerId: string): Promise<string | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const scope = { sentAt: { gte: since }, campaign: { event: { organizerId } } };
    const [sent, bad] = await Promise.all([
      this.prisma.campaignRecipient.count({ where: { ...scope, status: RecipientStatus.SENT } }),
      this.prisma.campaignRecipient.count({ where: { ...scope, feedback: { in: ['bounce', 'spam', 'reject'] } } }),
    ]);
    if (bad < 10 || bad < sent * 0.05) return null;
    return `Trop d’adresses en erreur ou de signalements de spam sur vos envois des dernières 24 heures (${bad} sur ${sent}). Vos campagnes sont suspendues en attendant : retirez les adresses douteuses de vos listes.`;
  }

  /** Counts from the recipients themselves (a resumed send adds to the first one) */
  private async saveProgress(campaignId: string) {
    const counts = await this.prisma.campaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: { status: true } });
    const n = (st: RecipientStatus) => counts.find(c => c.status === st)?._count.status ?? 0;
    const sent = n(RecipientStatus.SENT);
    const failed = n(RecipientStatus.FAILED);
    await this.prisma.notificationCampaign.update({ where: { id: campaignId }, data: { totalSent: sent, totalFailed: failed } });
    return { sent, failed, pending: n(RecipientStatus.PENDING) };
  }

  /** Sends cut short by a restart: no progress saved for 10 minutes, taken up again once */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async resumeStalledCampaigns() {
    const stalled = await this.prisma.notificationCampaign.findMany({
      where: { status: CampaignStatus.SENDING, updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      include: { event: true },
    });
    for (const campaign of stalled) {
      // Taken by this run only: its updatedAt moves, another instance's claim then matches nothing
      const { count } = await this.prisma.notificationCampaign.updateMany({
        where: { id: campaign.id, status: CampaignStatus.SENDING, updatedAt: campaign.updatedAt },
        data: { updatedAt: new Date() },
      });
      if (count === 0) continue;
      this.logger.warn(`Reprise de la campagne ${campaign.id}, interrompue`);
      const recipients = await this.buildRecipients(campaign);
      await this.dispatchCampaign(campaign, recipients).catch(err => this.logger.error(`Reprise campagne ${campaign.id}: ${err.message}`));
    }
  }

  /** The message one recipient gets: variables filled in, the poster row dropped when there is none */
  private render(
    campaign: { channel: NotificationChannel; subject?: string | null; body: string; event: { name: string; startDate: Date; timeZone: string; venue: string; city: string; bannerUrl: string | null } },
    recipient: { firstName?: string | null; lastName?: string | null; ticketId?: string | null },
    unsubscribeUrl?: string,
  ) {
    const startDate = new Date(campaign.event.startDate);
    const appBase = this.config.get<string>('APP_BASE_URL') ||
      `http://localhost:${this.config.get('port') || 3001}`;
    const rawBanner: string = campaign.event.bannerUrl || '';
    const resolvedBanner = rawBanner
      ? rawBanner.replace(/^https?:\/\/localhost:\d+/, appBase)
      : '';
    const vars = {
      firstName: recipient.firstName || 'Participant',
      lastName: recipient.lastName || '',
      eventName: campaign.event.name,
      eventDate: startDate.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: campaign.event.timeZone }),
      eventTime: startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: campaign.event.timeZone }),
      eventVenue: campaign.event.venue,
      eventCity: campaign.event.city,
      ticketSerial: recipient.ticketId || '',
      bannerUrl: resolvedBanner,
      unsubscribeUrl: unsubscribeUrl || '#',
    };

    // Designs copied from the predefined templates before the link existed: their footer
    // still asked to reply to unsubscribe; it now carries the link itself
    const design = campaign.body.replace(OLD_UNSUBSCRIBE_LINE, UNSUBSCRIBE_LINE);
    // No poster: drop its row rather than show a broken image
    const source = vars.bannerUrl ? design : design.replace(/<tr>\s*<td[^>]*>\s*<img src="\{\{bannerUrl\}\}"[\s\S]*?<\/td>\s*<\/tr>/g, '');
    // Values typed by buyers and organizers go into HTML: escaped, never markup
    const body = this.renderTemplate(source, campaign.channel === NotificationChannel.EMAIL
      ? Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(String(v ?? ''))]))
      : vars);
    const subject = campaign.subject ? this.renderTemplate(campaign.subject, vars) : undefined;
    // Every e-mail carries the way out (unless the design already places {{unsubscribeUrl}})
    // and ZAYA's signature (unless the design is a predefined template, which has its own)
    const withFooter = campaign.channel !== NotificationChannel.EMAIL
      ? body
      : this.addFooter(body, design.includes('{{unsubscribeUrl}}') ? null : vars.unsubscribeUrl, !ZAYA_SIGNED.test(design));
    return { body: withFooter, subject };
  }

  /** Page of the unsubscribe link (zaya.live) and its one-click address (mail apps' button) */
  private unsubscribeLinks(organizerId: string, email: string) {
    return unsubscribeLinks(this.config, organizerId, email);
  }

  private addFooter(html: string, unsubscribeUrl: string | null, signature: boolean) {
    const lines = [
      unsubscribeUrl && `Vous ne souhaitez plus recevoir ces e-mails ? <a href="${esc(unsubscribeUrl)}" style="color:#888888;text-decoration:underline;">Se désinscrire</a>`,
      signature && `Powered by <a href="https://zaya.live" style="color:#111111;font-weight:bold;text-decoration:none;">ZAYA</a>`,
    ].filter(Boolean);
    if (!lines.length) return html;
    const footer = `<div style="max-width:600px;margin:24px auto 8px;padding:0 16px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#888888;">${lines.join('<br/>')}</div>`;
    return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : `${html}${footer}`;
  }

  private async sendEmail(to: string, subject: string, html: string, oneClickUnsubscribe?: string) {
    await this.mailerTransport.sendMail({
      from: this.emailFrom,
      to,
      subject,
      html,
      // Mail apps show a "Se désinscrire" button: one click unsubscribes (RFC 8058)
      headers: oneClickUnsubscribe
        ? {
            'List-Unsubscribe': `<${oneClickUnsubscribe}>, <mailto:contact@zaya.live?subject=${encodeURIComponent(`Désinscription ${to}`)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : { 'List-Unsubscribe': `<mailto:contact@zaya.live?subject=${encodeURIComponent(`Désinscription ${to}`)}>` },
    });
  }

  /** Campaign SMS: through Elongo when its key is set, Twilio otherwise */
  private async sendSms(to: string, body: string) {
    if (this.sms.enabled) return this.sms.send(to, body, { marketing: true });
    if (!this.twilioClient) throw new BadRequestException('SMS non configurés');
    await this.twilioClient.messages.create({
      body,
      from: this.twilioFrom,
      to,
    });
  }

  private async sendWhatsApp(to: string, body: string) {
    if (!this.twilioClient) throw new BadRequestException('Twilio non configuré');
    await this.twilioClient.messages.create({
      body,
      from: this.twilioWhatsAppFrom,
      to: `whatsapp:${to}`,
    });
  }

  private renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

}
