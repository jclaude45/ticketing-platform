import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * What the verification service said of an address. Only `deliverable` is sent to; `unchecked`
 * means the service could not be reached: the message waits and is tried again later.
 */
export type Verdict = 'deliverable' | 'undeliverable' | 'risky' | 'unknown' | 'unchecked';

const API = 'https://api.mails.so/v1';
/** A verdict is trusted this long, then the address is checked again */
const KEEP_DAYS = 90;
/** Below this, one call per address; above, a batch job */
const SINGLE_MAX = 20;
const POLL_EVERY_MS = 5000;
/** Under the 10 minutes after which a campaign send counts as stalled */
const POLL_FOR_MS = 8 * 60 * 1000;

const VERDICTS = ['deliverable', 'undeliverable', 'risky', 'unknown'];

/**
 * Addresses ZAYA does not know (imported lists, invitation files) are verified with Mails.so
 * before any campaign or invitation reaches them: a made-up list got ZAYA's sending suspended
 * twice in Nov. 2026, and the mail provider asked for lists to be validated before sending,
 * not only cleaned after bounces. Undeliverable addresses join the suppression list for good.
 * Without MAILS_SO_API_KEY the check is off (`enabled` false) and callers send as before.
 */
@Injectable()
export class EmailVerifierService {
  private readonly logger = new Logger(EmailVerifierService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private get key() {
    return this.config.get<string>('email.verifyApiKey') || '';
  }

  get enabled() {
    return !!this.key;
  }

  /** The verdict of each address (lowercase), verifying those not checked in the last 90 days */
  async verify(addresses: string[]): Promise<Map<string, Verdict>> {
    const emails = Array.from(new Set(addresses.map((e) => e.trim().toLowerCase()).filter(Boolean)));
    const verdicts = new Map<string, Verdict>();
    if (!emails.length || !this.enabled) return verdicts;

    const since = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    const known = await this.prisma.emailVerification.findMany({ where: { email: { in: emails }, checkedAt: { gte: since } } });
    known.forEach((k) => verdicts.set(k.email, k.result as Verdict));
    const todo = emails.filter((e) => !verdicts.has(e));
    if (!todo.length) return verdicts;

    let found: { email: string; result: string; reason: string | null }[] = [];
    try {
      found = todo.length <= SINGLE_MAX ? await this.checkEach(todo) : await this.checkBatch(todo);
    } catch (err) {
      this.logger.warn(`Address verification unavailable (${todo.length} address(es) wait): ${(err as Error).message}`);
    }

    const checked = found.filter((f) => VERDICTS.includes(f.result));
    for (const f of checked) {
      await this.prisma.emailVerification.upsert({
        where: { email: f.email },
        create: { email: f.email, result: f.result, reason: f.reason },
        update: { result: f.result, reason: f.reason, checkedAt: new Date() },
      });
      verdicts.set(f.email, f.result as Verdict);
    }
    const bad = checked.filter((f) => f.result === 'undeliverable').map((f) => f.email);
    if (bad.length) {
      await this.prisma.emailSuppression.createMany({ data: bad.map((email) => ({ email, reason: 'validation' })), skipDuplicates: true });
    }
    todo.forEach((e) => { if (!verdicts.has(e)) verdicts.set(e, 'unchecked'); });
    this.logger.log(`Addresses verified: ${checked.length}/${todo.length} (${bad.length} undeliverable)`);
    return verdicts;
  }

  private async call(path: string, init?: RequestInit) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'x-mails-api-key': this.key, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
    return body?.data ?? body;
  }

  private read(r: any) {
    return { email: String(r?.email ?? '').trim().toLowerCase(), result: String(r?.result ?? ''), reason: r?.reason ? String(r.reason) : null };
  }

  private async checkEach(emails: string[]) {
    const out: ReturnType<EmailVerifierService['read']>[] = [];
    const queue = [...emails];
    const worker = async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          const r = this.read(await this.call(`/validate?email=${encodeURIComponent(e)}`));
          out.push({ ...r, email: r.email || e });
        } catch (err) {
          this.logger.warn(`Verification of one address failed: ${(err as Error).message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, emails.length) }, worker));
    return out;
  }

  private async checkBatch(emails: string[]) {
    const job = await this.call('/batch', { method: 'POST', body: JSON.stringify({ emails }) });
    if (!job?.id) throw new Error('no batch id');
    const end = Date.now() + POLL_FOR_MS;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
      const batch = await this.call(`/batch/${job.id}`);
      if (batch?.finished_at) return ((batch.emails ?? []) as any[]).map((r) => this.read(r));
    }
    throw new Error(`batch ${job.id} not finished after ${POLL_FOR_MS / 60000} min`);
  }
}

@Global()
@Module({ providers: [EmailVerifierService], exports: [EmailVerifierService] })
export class EmailVerifierModule {}
