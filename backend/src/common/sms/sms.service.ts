import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toInternationalPhone } from '../phone';

/** Longest text the gateway takes (it splits it into several SMS past 160 characters) */
export const SMS_MAX_LENGTH = 1000;

/**
 * The gateway takes nothing more for now (credits used up, too many requests): a campaign
 * stops and its recipients stay pending for "Reprendre", instead of all failing one by one.
 */
export class SmsUnavailableError extends Error {
  readonly quota = true;
}

/**
 * SMS through Elongo SMS (sms.elongocrea.com). The application key of the client area is
 * exchanged for a token (valid until revoked), kept in memory and renewed on a 401.
 * Without ELONGO_SMS_KEY it is off (`enabled` false).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private token: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get key() {
    return this.config.get<string>('sms.key') || '';
  }

  private get base() {
    return (this.config.get<string>('sms.url') || 'https://sms.elongocrea.com').replace(/\/+$/, '');
  }

  get enabled() {
    return !!this.key;
  }

  /**
   * Sends one SMS. `marketing`: campaigns, the gateway leaves out numbers that unsubscribed
   * there; tickets and codes are transactional and always go. Throws SmsUnavailableError when
   * the gateway refuses everything for now, an Error (French, shown to the organizer) otherwise.
   */
  async send(to: string, message: string, opts: { marketing?: boolean } = {}): Promise<void> {
    const phone = toInternationalPhone(to);
    if (!phone) throw new Error('Numéro de téléphone invalide (format attendu : +243 81 234 5678)');
    const text = message.trim();
    if (!text) throw new Error('Message vide');
    if (text.length > SMS_MAX_LENGTH) throw new Error(`Message trop long pour un SMS (${text.length} caractères, ${SMS_MAX_LENGTH} au plus)`);

    const sender = this.config.get<string>('sms.sender');
    const body = {
      phone_number: phone,
      message: text,
      ...(sender ? { sender_name: sender } : {}),
      usage: opts.marketing ? 'marketing' : 'transactionnel_otp',
    };
    let res = await this.post('/api/sms-transactions/send', body, await this.login());
    if (res.status === 401) {
      this.token = null;
      res = await this.post('/api/sms-transactions/send', body, await this.login());
    }
    if (res.ok && res.body?.success !== false) return;

    const type = res.body?.type;
    if (res.status === 429 || type === 'account' || type === 'provider') {
      this.logger.error(`SMS refusés par Elongo (${res.status}${type ? ` ${type}` : ''}) : ${res.body?.message ?? ''}`);
      throw new SmsUnavailableError(
        res.status === 429 ? 'Trop d’envois SMS en même temps : réessayez dans quelques minutes'
          : 'Crédits SMS épuisés : l’envoi reprendra après la recharge du compte SMS',
      );
    }
    if (type === 'opt_out') throw new Error('Ce numéro s’est désinscrit des SMS marketing');
    const detail = res.body?.errors ? Object.values(res.body.errors).flat().join(' ') : res.body?.message;
    throw new Error(`SMS refusé (${res.status})${detail ? ` : ${String(detail).slice(0, 300)}` : ''}`);
  }

  /** The access token, logging in once for every caller waiting on it */
  private login(): Promise<string> {
    this.token ??= (async () => {
      const res = await this.post('/api/applications/login', { key: this.key });
      const token = res.body?.data?.access_token;
      if (!res.ok || !token) {
        const reason = `connexion à Elongo refusée (${res.status}) : ${res.body?.message ?? 'pas de jeton'}`;
        // 5 logins a minute per IP: a wrong key must not hammer it
        if (res.status === 404 || res.status === 422) this.logger.error(`ELONGO_SMS_KEY invalide, ${reason}`);
        throw res.status === 429 ? new SmsUnavailableError(reason) : new Error(`SMS impossible : ${reason}`);
      }
      return token as string;
    })().catch((err) => {
      this.token = null;
      throw err;
    });
    return this.token;
  }

  private async post(path: string, body: unknown, token?: string) {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json: any = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body: json };
  }
}

@Global()
@Module({ providers: [SmsService], exports: [SmsService] })
export class SmsModule {}
