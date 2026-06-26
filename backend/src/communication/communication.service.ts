import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel, CampaignStatus, CampaignType, RecipientStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { Twilio } from 'twilio';
import { CreateCampaignDto, UpdateCampaignDto, ScheduleCampaignDto } from './dto/create-campaign.dto';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';
import { DEFAULT_TEMPLATES } from './default-templates';

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
  ) {
    this.mailerTransport = nodemailer.createTransport({
      host: config.get('email.host'),
      port: config.get('email.port'),
      secure: false,
      auth: {
        user: config.get('email.user'),
        pass: config.get('email.password'),
      },
    });
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
      sms: !!this.twilioClient && !!this.twilioFrom,
      whatsapp: !!this.twilioClient && !!this.twilioWhatsAppFrom,
    };
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

  async getCampaigns(eventId: string) {
    return this.prisma.notificationCampaign.findMany({
      where: { eventId },
      include: {
        _count: { select: { recipients: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaign(campaignId: string) {
    const c = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: { orderBy: { createdAt: 'desc' }, take: 100 },
        createdBy: { select: { firstName: true, lastName: true } },
        event: { select: { name: true, startDate: true, venue: true, city: true, bannerUrl: true } },
      },
    });
    if (!c) throw new NotFoundException('Campagne introuvable');
    return c;
  }

  async createCampaign(eventId: string, userId: string, dto: CreateCampaignDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Événement introuvable');

    return this.prisma.notificationCampaign.create({
      data: {
        name: dto.name,
        eventId,
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

  async updateCampaign(campaignId: string, dto: UpdateCampaignDto) {
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException('Campagne introuvable');
    if (c.status === CampaignStatus.SENT || c.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Impossible de modifier une campagne déjà envoyée');
    }
    return this.prisma.notificationCampaign.update({ where: { id: campaignId }, data: dto });
  }

  async deleteCampaign(campaignId: string) {
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException('Campagne introuvable');
    await this.prisma.notificationCampaign.delete({ where: { id: campaignId } });
  }

  async scheduleCampaign(campaignId: string, dto: ScheduleCampaignDto) {
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException('Campagne introuvable');
    return this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { scheduledAt: new Date(dto.scheduledAt), status: CampaignStatus.SCHEDULED },
    });
  }

  async sendCampaign(campaignId: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      include: { event: true },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Envoi déjà en cours');
    }

    await this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.SENDING },
    });

    // Build recipients from ticket holders
    const recipients = await this.buildRecipients(campaign.eventId, campaignId);

    this.dispatchCampaign(campaign, recipients).catch(err =>
      this.logger.error(`Erreur envoi campagne ${campaignId}: ${err.message}`)
    );

    return { message: 'Envoi lancé', recipientCount: recipients.length };
  }

  async getCampaignStats(campaignId: string) {
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

  // ─── EVENT OVERVIEW ───────────────────────────────────────────

  async getEventStats(eventId: string) {
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

  async setupAutoReminders(eventId: string, userId: string) {
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

  // ─── CRON: daily at 08:00 ─────────────────────────────────────

  @Cron('0 8 * * *')
  async processScheduledCampaigns() {
    this.logger.log('Traitement des campagnes planifiées...');
    const now = new Date();

    const due = await this.prisma.notificationCampaign.findMany({
      where: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      include: { event: true },
    });

    this.logger.log(`${due.length} campagne(s) à envoyer`);

    for (const campaign of due) {
      try {
        const recipients = await this.buildRecipients(campaign.eventId, campaign.id);
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

  private async buildRecipients(eventId: string, campaignId: string) {
    // Check if recipients already created
    const existing = await this.prisma.campaignRecipient.count({ where: { campaignId } });
    if (existing > 0) {
      return this.prisma.campaignRecipient.findMany({ where: { campaignId } });
    }

    const tickets = await this.prisma.ticket.findMany({
      where: {
        eventId,
        status: { in: ['VALID', 'PENDING'] },
        holderEmail: { not: null },
      },
      include: { template: { select: { name: true } } },
    });

    if (tickets.length === 0) return [];

    await this.prisma.campaignRecipient.createMany({
      data: tickets.map(t => ({
        campaignId,
        email: t.holderEmail!,
        firstName: (t.holderName || 'Participant').split(' ')[0],
        lastName: (t.holderName || '').split(' ').slice(1).join(' ') || '',
        ticketId: t.id,
      })),
    });

    return this.prisma.campaignRecipient.findMany({ where: { campaignId } });
  }

  private async dispatchCampaign(campaign: any, recipients: any[]) {
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (recipient.status === RecipientStatus.SENT) continue;

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
        eventDate: startDate.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        eventTime: startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        eventVenue: campaign.event.venue,
        eventCity: campaign.event.city,
        ticketSerial: recipient.ticketId || '',
        bannerUrl: resolvedBanner,
      };

      const body = this.renderTemplate(campaign.body, vars);
      const subject = campaign.subject ? this.renderTemplate(campaign.subject, vars) : undefined;

      try {
        if (campaign.channel === NotificationChannel.EMAIL && recipient.email) {
          await this.sendEmail(recipient.email, subject || campaign.name, body);
        } else if (campaign.channel === NotificationChannel.SMS && recipient.phone) {
          await this.sendSms(recipient.phone, body);
        } else if (campaign.channel === NotificationChannel.WHATSAPP && recipient.phone) {
          await this.sendWhatsApp(recipient.phone, body);
        } else {
          // No contact info for this channel
          await this.prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: RecipientStatus.FAILED, error: 'Coordonnées manquantes' },
          });
          failed++;
          continue;
        }

        await this.prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: RecipientStatus.SENT, sentAt: new Date() },
        });
        sent++;
      } catch (err) {
        await this.prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: RecipientStatus.FAILED, error: err.message },
        });
        failed++;
        this.logger.warn(`Échec envoi à ${recipient.email || recipient.phone}: ${err.message}`);
      }
    }

    const finalStatus =
      failed === 0 ? CampaignStatus.SENT :
      sent === 0 ? CampaignStatus.FAILED :
      CampaignStatus.PARTIALLY_SENT;

    await this.prisma.notificationCampaign.update({
      where: { id: campaign.id },
      data: { status: finalStatus, sentAt: new Date(), totalSent: sent, totalFailed: failed },
    });

    this.logger.log(`Campagne ${campaign.id}: ${sent} envoyés, ${failed} échoués`);
  }

  private async sendEmail(to: string, subject: string, html: string) {
    await this.mailerTransport.sendMail({
      from: this.emailFrom,
      to,
      subject,
      html,
    });
  }

  private async sendSms(to: string, body: string) {
    if (!this.twilioClient) throw new BadRequestException('Twilio non configuré');
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
