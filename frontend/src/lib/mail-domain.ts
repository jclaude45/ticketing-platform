/** The webmail domains buyers actually use (same list as the backend's common/email/mail-domain.ts) */
const COMMON_MAIL_DOMAINS = [
  'gmail.com', 'yahoo.fr', 'yahoo.com', 'hotmail.com', 'hotmail.fr', 'outlook.com',
  'outlook.fr', 'live.fr', 'live.com', 'icloud.com', 'me.com', 'ymail.com', 'msn.com',
];

/** "nom@gmail.com" for "nom@gmall.com": the domain is one or two letters away from a common one */
export function suggestMailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain.includes('.') || COMMON_MAIL_DOMAINS.includes(domain)) return null;
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
