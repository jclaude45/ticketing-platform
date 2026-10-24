import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { RedisService } from '../redis/redis.service';

/** Leading zero bits asked for: about 130 000 hashes, a few seconds on a phone, done while the form is filled */
const DIFFICULTY = 17;
const TTL_S = 15 * 60;

/**
 * Proof of work for the forms that send e-mails to an address typed by a stranger (sign-up,
 * forgotten password, new confirmation link). The browser looks for a nonce such that
 * SHA-256(salt + nonce) starts with DIFFICULTY zero bits: invisible for a person, costly for a
 * robot sending thousands of them. Challenges are signed (nothing stored until used) and single-use.
 */
@Injectable()
export class ProofOfWorkService {
  private readonly key: Buffer;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.key = crypto.createHash('sha256').update(`pow:${config.get<string>('jwt.secret') ?? ''}`).digest();
  }

  private sign(salt: string, difficulty: number, expires: number) {
    return crypto.createHmac('sha256', this.key).update(`${salt}.${difficulty}.${expires}`).digest('hex');
  }

  challenge() {
    const salt = crypto.randomBytes(16).toString('hex');
    const expires = Date.now() + TTL_S * 1000;
    return { salt, difficulty: DIFFICULTY, expires, signature: this.sign(salt, DIFFICULTY, expires) };
  }

  /** Proof sent by the form: "salt.difficulty.expires.signature.nonce" */
  async verify(proof: string | undefined) {
    const refuse = () => {
      throw new BadRequestException('Vérification anti-robot échouée. Rechargez la page et réessayez.');
    };
    const parts = (proof ?? '').split('.');
    if (parts.length !== 5) refuse();
    const [salt, d, e, signature, nonce] = parts;
    const difficulty = Number(d);
    const expires = Number(e);
    if (!/^[0-9a-f]{32}$/.test(salt) || !/^\d{1,12}$/.test(nonce) || difficulty < DIFFICULTY) refuse();
    if (!Number.isFinite(expires) || expires < Date.now()) refuse();
    const expected = Buffer.from(this.sign(salt, difficulty, expires), 'hex');
    const given = Buffer.from(/^[0-9a-f]{64}$/.test(signature) ? signature : '', 'hex');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) refuse();
    if (leadingZeroBits(crypto.createHash('sha256').update(salt + nonce).digest()) < difficulty) refuse();
    // Single use: a solved challenge cannot be replayed for a second e-mail
    const used = `pow:used:${salt}`;
    if (await this.redis.get(used)) refuse();
    await this.redis.set(used, '1', TTL_S);
  }
}

export function leadingZeroBits(hash: Buffer) {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}
