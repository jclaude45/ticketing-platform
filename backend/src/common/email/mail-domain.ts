import { BadRequestException } from '@nestjs/common';
import { promises as dns } from 'dns';

/** The webmail domains buyers actually use, for typo suggestions (gmall.com → gmail.com) */
export const COMMON_MAIL_DOMAINS = [
  'gmail.com', 'yahoo.fr', 'yahoo.com', 'hotmail.com', 'hotmail.fr', 'outlook.com',
  'outlook.fr', 'live.fr', 'live.com', 'icloud.com', 'me.com', 'ymail.com', 'msn.com',
];

/** "gmail.com" when the domain is one or two letters away from a common one, else null */
export function suggestMailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || COMMON_MAIL_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDist = 3;
  for (const d of COMMON_MAIL_DOMAINS) {
    const dist = distance(domain, d);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best ? `${email.slice(0, at)}@${best}` : null;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

const known = new Map<string, { ok: boolean; at: number }>();
const DAY = 24 * 3600 * 1000;

/** Whether the domain can receive mail: an MX record, or failing that an address (RFC 5321 §5.1) */
async function domainReceivesMail(domain: string): Promise<boolean> {
  const hit = known.get(domain);
  if (hit && Date.now() - hit.at < DAY) return hit.ok;
  const lookup = async (): Promise<boolean> => {
    try {
      const mx = await dns.resolveMx(domain);
      if (mx.some(r => r.exchange && r.exchange !== '.')) return true;
      if (mx.length) return false; // "null MX": the domain says it takes no mail
    } catch (e: any) {
      if (e?.code !== 'ENOTFOUND' && e?.code !== 'ENODATA') throw e;
    }
    try {
      return (await dns.resolve4(domain)).length > 0;
    } catch (e: any) {
      if (e?.code === 'ENOTFOUND' || e?.code === 'ENODATA') return false;
      throw e;
    }
  };
  try {
    const ok = await Promise.race([
      lookup(),
      new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    known.set(domain, { ok, at: Date.now() });
    return ok;
  } catch {
    // DNS unavailable or slow: never block a purchase on our own resolver
    return true;
  }
}

/**
 * Refuses an address whose domain cannot receive mail (gmail.icloud, typos of
 * unregistered domains): the tickets would never arrive and every bounce hurts
 * the sending domain's reputation.
 */
export async function assertMailDomain(email: string): Promise<void> {
  const domain = email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();
  if (await domainReceivesMail(domain)) return;
  const suggestion = suggestMailDomain(email);
  throw new BadRequestException(
    suggestion
      ? `L'adresse ${email} ne peut pas recevoir d'e-mails. Vouliez-vous dire ${suggestion} ?`
      : `L'adresse ${email} ne peut pas recevoir d'e-mails : vérifiez l'orthographe.`,
  );
}
