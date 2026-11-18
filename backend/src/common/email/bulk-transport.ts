import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * SMTP of the "bulk" stream: campaigns and event invitations, the mail the provider treats as
 * marketing. Kept apart from tickets, receipts and login codes, so that a campaign's bounces or
 * complaints never get those suspended (Mailtrap did, for the whole platform, in Nov. 2026).
 *
 * BULK_EMAIL_* when set; otherwise, on Mailtrap, its bulk host with the same credentials
 * (live.smtp.mailtrap.io → bulk.smtp.mailtrap.io); otherwise null: the platform's own SMTP.
 */
export function createBulkTransport(config: ConfigService, maxConnections = 5): nodemailer.Transporter | null {
  const bulk = config.get<{ host?: string; port: number; user?: string; password?: string }>('email.bulk');
  const host = bulk?.host
    || (config.get<string>('email.host') === 'live.smtp.mailtrap.io' ? 'bulk.smtp.mailtrap.io' : '');
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: bulk?.host ? bulk.port : (config.get<number>('email.port') ?? 587),
    secure: false,
    auth: {
      user: bulk?.host ? bulk.user : config.get<string>('email.user'),
      pass: bulk?.host ? bulk.password : config.get<string>('email.password'),
    },
    pool: true,
    maxConnections,
  });
}
