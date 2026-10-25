import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Read by the app when the notification is tapped (screen to open) */
  data?: Record<string, string>;
}

/**
 * Push notifications to the organizer app through Firebase Cloud Messaging (HTTP v1 API).
 * The Firebase service account comes from FIREBASE_SERVICE_ACCOUNT_BASE64 (the JSON key,
 * base64-encoded); without it nothing is sent. Phones whose token Firebase no longer knows
 * (app removed) are forgotten.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly account: ServiceAccount | null = null;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = config.get<string>('FIREBASE_SERVICE_ACCOUNT_BASE64');
    if (raw) {
      try {
        this.account = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      } catch {
        this.logger.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not a base64 JSON key — push disabled');
      }
    }
  }

  get enabled() {
    return !!this.account;
  }

  async registerDevice(userId: string, token: string, platform: string) {
    // A phone passed to another account keeps one token: it now belongs to the new account
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
      select: { id: true, platform: true, createdAt: true },
    });
  }

  async forgetDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { removed: true };
  }

  /** Sends to every phone of the user; never throws (a failed push must not break a sale) */
  async send(userId: string, message: PushMessage) {
    if (!this.account) return;
    try {
      const devices = await this.prisma.deviceToken.findMany({ where: { userId }, select: { token: true } });
      if (!devices.length) return;
      const bearer = await this.oauthToken();
      for (const { token } of devices) {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.data ?? {},
              android: { priority: 'high', notification: { channel_id: 'zaya_alerts' } },
              apns: { payload: { aps: { sound: 'default' } } },
            },
          }),
        });
        if (res.ok) continue;
        const err = await res.json().catch(() => ({}));
        const code = err?.error?.details?.find((d: any) => d.errorCode)?.errorCode ?? err?.error?.status;
        if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' || res.status === 404) {
          await this.prisma.deviceToken.deleteMany({ where: { token } });
        } else {
          this.logger.warn(`Push to a device of ${userId} failed: ${res.status} ${code ?? ''}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Push to ${userId} failed: ${(err as Error).message}`);
    }
  }

  /** OAuth access token of the service account, kept until 5 minutes before it expires */
  private async oauthToken() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 5 * 60 * 1000) return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: this.account!.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(this.account!.private_key).toString('base64url');
    const assertion = `${unsigned}.${signature}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const body = await res.json();
    if (!res.ok || !body.access_token) throw new Error(`Google OAuth refused the service account (${res.status})`);
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.accessToken.value;
  }
}
