import { Controller, Post, Param, Body, HttpCode, HttpStatus, NotFoundException, Logger } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Events that make an address unfit for any campaign again */
const SUPPRESS = new Set(['bounce', 'spam', 'reject', 'unsubscribe']);
const RECORD = new Set([...SUPPRESS, 'soft bounce']);

/**
 * Mailtrap's webhook: bounces, rejections, spam complaints and unsubscribes of every e-mail
 * sent. Those addresses are suppressed from all campaigns, and the campaign message they
 * answer is marked, which feeds the organizer's bounce / complaint rate. The URL carries a
 * secret (MAILTRAP_WEBHOOK_SECRET): without it, anyone could suppress any address.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('webhooks/mailtrap')
export class MailtrapWebhookController {
  private readonly logger = new Logger(MailtrapWebhookController.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  @Post(':secret')
  @HttpCode(HttpStatus.OK)
  async receive(@Param('secret') secret: string, @Body() body: { events?: { event?: string; email?: string; timestamp?: number }[] }) {
    const expected = this.config.get<string>('email.webhookSecret') ?? '';
    if (!expected || secret.length !== expected.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
      throw new NotFoundException();
    }
    let kept = 0;
    for (const e of (body?.events ?? []).slice(0, 1000)) {
      const event = String(e?.event ?? '').toLowerCase();
      const email = String(e?.email ?? '').trim().toLowerCase();
      if (!RECORD.has(event) || !email.includes('@') || email.length > 200) continue;
      kept++;
      if (SUPPRESS.has(event)) {
        await this.prisma.emailSuppression.upsert({ where: { email }, create: { email, reason: event }, update: {} });
      }
      // The campaign message it answers: the last one sent to this address within a week
      const at = e.timestamp ? new Date(e.timestamp * 1000) : new Date();
      const recipient = await this.prisma.campaignRecipient.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, status: 'SENT', sentAt: { gte: new Date(at.getTime() - 7 * 24 * 60 * 60 * 1000) } },
        orderBy: { sentAt: 'desc' },
        select: { id: true, feedback: true },
      });
      // A hard event wins over an earlier soft bounce
      if (recipient && (!recipient.feedback || recipient.feedback === 'soft bounce')) {
        await this.prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { feedback: event, feedbackAt: at } });
      }
    }
    if (kept) this.logger.log(`Mailtrap : ${kept} rebond(s) / plainte(s) enregistré(s)`);
    return { received: kept };
  }
}
