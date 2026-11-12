import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile CAPTCHA on the forms that e-mail an address typed by a stranger
 * (sign-up, forgotten password, new confirmation link). Bots solved the proof of work and
 * signed up third parties' addresses, the bounces hurting the sending reputation.
 * Not configured (no TURNSTILE_SECRET_KEY): only the proof of work applies.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(token: string | undefined, ip?: string): Promise<void> {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) return;
    if (!token) throw new BadRequestException('Vérification anti-robot manquante. Rechargez la page et réessayez.');

    let success = false;
    try {
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.set('remoteip', ip);
      const { data } = await axios.post(SITEVERIFY, body, { timeout: 8000 });
      success = data?.success === true;
      if (!success) this.logger.warn(`Turnstile refused a request: ${(data?.['error-codes'] ?? []).join(',')}`);
    } catch (err) {
      // Cloudflare unreachable: refused rather than let robots through while it is down
      this.logger.error(`Turnstile verification unavailable: ${(err as Error).message}`);
    }
    if (!success) throw new BadRequestException('La vérification anti-robot a échoué. Réessayez.');
  }
}
