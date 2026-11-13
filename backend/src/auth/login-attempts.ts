import { UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

type Counter = { key: string; limit: number; ttl: number };

export const TOO_MANY_ATTEMPTS = 'Too many failed attempts — please try again in 15 minutes';

/**
 * Wrong passwords, counted per account and visitor (10 in 15 min), and per account from
 * anywhere (50 in an hour). A stranger can no longer lock someone out with ten tries, and
 * guessing from many addresses still stops.
 */
export function passwordCounters(scope: 'user' | 'controller', email: string, ip?: string | null): Counter[] {
  const who = (email ?? '').trim().toLowerCase();
  return [
    { key: `login:fail:${scope}:${who}:${ip ?? 'unknown'}`, limit: 10, ttl: 15 * 60 },
    { key: `login:fail:${scope}:${who}`, limit: 50, ttl: 60 * 60 },
  ];
}

/** Wrong two-factor codes for an account whose password was right: 5 in 15 minutes */
export const totpCounters = (userId: string): Counter[] => [{ key: `totp:fail:${userId}`, limit: 5, ttl: 15 * 60 }];

export async function assertNotLocked(redis: RedisService, counters: Counter[]) {
  for (const c of counters) {
    if (parseInt((await redis.get(c.key)) ?? '0', 10) >= c.limit) throw new UnauthorizedException(TOO_MANY_ATTEMPTS);
  }
}

export async function recordFailure(redis: RedisService, counters: Counter[]) {
  for (const c of counters) {
    // INCR is atomic: parallel wrong guesses are all counted
    if ((await redis.incr(c.key)) === 1) await redis.expire(c.key, c.ttl);
  }
}

/** After a success: only this visitor's counter, so a right password never erases a wider attack */
export async function clearFailures(redis: RedisService, counters: Counter[]) {
  await redis.del(counters[0].key);
}
