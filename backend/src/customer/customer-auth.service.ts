import {
  BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SmsService } from '../common/sms/sms.service';
import { toInternationalPhone } from '../common/phone';

/** Code sent by SMS: 6 digits, valid 5 minutes */
export const CODE_TTL = 5 * 60;
/** Three wrong codes in a row block the number for 15 minutes (sending and checking) */
export const CODE_FAILURES = 3;
export const LOCK_TTL = 15 * 60;
/** A new code at most every minute, 5 an hour per number, 20 an hour per visitor */
const RESEND_AFTER = 60;
const SENDS_PER_NUMBER = 5;
const SENDS_PER_IP = 20;
/** A phone stays signed in 90 days without use (the wallet must work for months offline) */
const SESSION_DAYS = 90;

export type CustomerDevice = { platform?: string; userAgent?: string };

/**
 * Sign-in of the ZAYA app: a number, a code by SMS, and a session for that phone. Signing in
 * on a new phone ends the other sessions, so a ticket's QR shows on one device at a time.
 */
@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sms: SmsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** "243812345678" from any way of typing a number; Congolese numbers without their code */
  static phoneKey(raw: string): string {
    const phone = toInternationalPhone(raw);
    if (!phone) throw new BadRequestException('Numéro de téléphone invalide (exemple : 081 234 5678)');
    return phone.slice(1);
  }

  async requestCode(rawPhone: string, ip?: string) {
    const phone = CustomerAuthService.phoneKey(rawPhone);
    await this.assertNotLocked(phone);
    if (await this.redis.exists(`cust:otp:wait:${phone}`)) {
      throw new HttpException('Un code vient d’être envoyé : patientez une minute avant d’en demander un autre.', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.count(`cust:otp:sent:${phone}`, SENDS_PER_NUMBER, 3600, 'Trop de codes demandés pour ce numéro : réessayez dans une heure.');
    if (ip) await this.count(`cust:otp:ip:${ip}`, SENDS_PER_IP, 3600, 'Trop de codes demandés : réessayez dans une heure.');

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(`cust:otp:${phone}`, this.hash(`${phone}:${code}`), CODE_TTL);
    await this.redis.set(`cust:otp:wait:${phone}`, '1', RESEND_AFTER);

    const text = `${code} est votre code ZAYA. Il expire dans 5 minutes. Ne le donnez à personne, même à ZAYA.`;
    if (this.sms.enabled) {
      try {
        await this.sms.send(`+${phone}`, text);
      } catch (err) {
        await this.redis.del(`cust:otp:${phone}`);
        await this.redis.del(`cust:otp:wait:${phone}`);
        this.logger.error(`Code SMS non envoyé : ${(err as Error).message}`);
        throw new ServiceUnavailableException('Le SMS n’a pas pu partir. Réessayez dans un instant.');
      }
    } else if (this.config.get('nodeEnv') !== 'production') {
      this.logger.warn(`SMS désactivés (développement) : code ${code} pour +${phone}`);
    } else {
      throw new ServiceUnavailableException('La connexion par SMS est momentanément indisponible.');
    }
    return { phone: `+${phone}`, expiresIn: CODE_TTL, resendIn: RESEND_AFTER };
  }

  /** Checks the code and opens a session on this phone; `isNew` asks the app for a name */
  async verifyCode(rawPhone: string, code: string, device: CustomerDevice = {}) {
    const phone = CustomerAuthService.phoneKey(rawPhone);
    await this.assertNotLocked(phone);
    const expected = await this.redis.get(`cust:otp:${phone}`);
    const given = this.hash(`${phone}:${(code ?? '').trim()}`);
    if (!expected || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      if (!expected) throw new UnauthorizedException('Ce code a expiré : demandez-en un nouveau.');
      const failures = await this.redis.incr(`cust:otp:fail:${phone}`);
      if (failures === 1) await this.redis.expire(`cust:otp:fail:${phone}`, LOCK_TTL);
      if (failures >= CODE_FAILURES) {
        await this.redis.set(`cust:otp:lock:${phone}`, '1', LOCK_TTL);
        await this.redis.del(`cust:otp:${phone}`);
        await this.redis.del(`cust:otp:fail:${phone}`);
        throw new HttpException('Trois codes faux : réessayez dans 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
      }
      const left = CODE_FAILURES - failures;
      throw new UnauthorizedException(`Code incorrect. Encore ${left} essai${left > 1 ? 's' : ''}.`);
    }
    await this.redis.del(`cust:otp:${phone}`);
    await this.redis.del(`cust:otp:fail:${phone}`);

    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    const customer = existing
      ? await this.prisma.customer.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } })
      : await this.prisma.customer.create({ data: { phone, lastLoginAt: new Date() } });
    // One phone at a time: the previous one stops showing the tickets' QR
    await this.prisma.customerSession.deleteMany({ where: { customerId: customer.id } });
    const session = await this.prisma.customerSession.create({
      data: {
        customerId: customer.id,
        tokenHash: '',
        platform: device.platform === 'ios' ? 'ios' : 'android',
        userAgent: device.userAgent?.slice(0, 300) || null,
        expiresAt: new Date(),
      },
    });
    return { ...(await this.rotate(session.id, customer.id)), isNew: !existing || !existing.firstName, customer };
  }

  /** New tokens for the session of a refresh token; the token used stops working */
  async refresh(refreshToken: string) {
    const [sid] = (refreshToken ?? '').split('.');
    const session = sid ? await this.prisma.customerSession.findUnique({ where: { id: sid } }) : null;
    const given = Buffer.from(this.hash(refreshToken ?? ''));
    const stored = Buffer.from(session?.tokenHash ?? '');
    if (!session || session.expiresAt < new Date() || stored.length !== given.length || !crypto.timingSafeEqual(given, stored)) {
      throw new UnauthorizedException('Session expirée : reconnectez-vous.');
    }
    return this.rotate(session.id, session.customerId);
  }

  async logout(sid: string) {
    await this.prisma.customerSession.deleteMany({ where: { id: sid } });
  }

  /** Customer and session of an access token, or null (expired, other phone signed in…) */
  async authenticate(accessToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(accessToken, { secret: this.config.get<string>('jwt.secret') });
    } catch {
      return null;
    }
    if (payload?.type !== 'customer' || !payload.sid) return null;
    const session = await this.prisma.customerSession.findUnique({ where: { id: payload.sid }, include: { customer: true } });
    if (!session || session.customerId !== payload.sub || session.expiresAt < new Date()) return null;
    return { customer: session.customer, sid: session.id };
  }

  private async rotate(sid: string, customerId: string) {
    const refreshToken = `${sid}.${crypto.randomBytes(32).toString('base64url')}`;
    await this.prisma.customerSession.update({
      where: { id: sid },
      data: { tokenHash: this.hash(refreshToken), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: customerId, sid, type: 'customer' },
      { secret: this.config.get<string>('jwt.secret'), expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.expiresIn') },
    );
    return { accessToken, refreshToken };
  }

  /** Keyed: a code has only a million values, its hash alone would give it away */
  private hash(value: string) {
    return crypto.createHmac('sha256', this.config.get<string>('jwt.secret') ?? '').update(value).digest('hex');
  }

  private async assertNotLocked(phone: string) {
    if (await this.redis.exists(`cust:otp:lock:${phone}`)) {
      throw new HttpException('Trois codes faux : réessayez dans 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async count(key: string, limit: number, ttl: number, message: string) {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, ttl);
    if (n > limit) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
