import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as crypto from 'crypto';
import * as geoip from 'geoip-lite';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime/i;
const REVISIT_WINDOW_MS = 30 * 60 * 1000; // a reload within 30 min is not a new visit

interface GeoResult { country: string | null; region: string | null; city: string | null; lat: number | null; lng: number | null }

const round = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10 ** digits) / 10 ** digits;

@Injectable()
export class AudienceService {
  private readonly logger = new Logger(AudienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  // ─── Tracking ─────────────────────────────────────────────────────────────

  /** Records a visit of an event's public page. Never throws: tracking must not break the page. */
  async recordView(eventId: string, ip: string, userAgent: string, referrer?: string, source?: string) {
    try {
      if (!ip || !userAgent || BOT_UA.test(userAgent)) return;
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
      if (event?.status !== 'PUBLISHED') return;

      const day = new Date().toISOString().slice(0, 10);
      const visitorHash = crypto
        .createHash('sha256')
        .update(`${this.salt}|${day}|${ip}|${userAgent}`)
        .digest('hex')
        .slice(0, 32);

      // Atomic: two overlapping requests (reload, double mount) still count as one visit
      const fresh = await this.redis
        .getClient()
        .set(`view:${eventId}:${visitorHash}`, '1', 'PX', REVISIT_WINDOW_MS, 'NX');
      if (fresh !== 'OK') return;

      const geo = await this.locate(ip);
      await this.prisma.eventView.create({
        data: {
          eventId,
          visitorHash,
          ...geo,
          referrer: this.referrerHost(referrer),
          source: source?.trim().slice(0, 50) || null,
          device: /ipad|tablet/i.test(userAgent) ? 'tablet' : /mobi|android|iphone/i.test(userAgent) ? 'mobile' : 'desktop',
        },
      });
    } catch (err) {
      this.logger.warn(`View tracking failed for event ${eventId}: ${(err as Error)?.message}`);
    }
  }

  private get salt(): string {
    return this.config.get<string>('AUDIENCE_SALT') || this.config.get<string>('jwt.secret') || 'zaya-audience';
  }

  private referrerHost(referrer?: string): string | null {
    if (!referrer) return null;
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, '');
      return /(^|\.)zaya\.live$/.test(host) ? null : host.slice(0, 100);
    } catch {
      return null;
    }
  }

  /**
   * City-level location of an IP. Uses ipinfo.io when IPINFO_TOKEN is set (much better coverage
   * in Africa), cached 24h per IP hash; otherwise — or on failure — the offline GeoIP database.
   * Coordinates are rounded to 0.1° (~10 km).
   */
  private async locate(ip: string): Promise<GeoResult> {
    const token = this.config.get<string>('IPINFO_TOKEN');
    if (token) {
      const cacheKey = `geo:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24)}`;
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
        const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${token}`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data: any = await res.json();
          if (!data.bogon) {
            const [lat, lng] = String(data.loc ?? '').split(',').map(Number);
            const geo: GeoResult = {
              country: data.country ?? null,
              region: data.region || null,
              city: data.city || null,
              lat: round(lat),
              lng: round(lng),
            };
            await this.redis.set(cacheKey, JSON.stringify(geo), 24 * 3600);
            return geo;
          }
        }
      } catch (err) {
        this.logger.warn(`ipinfo lookup failed, using offline GeoIP: ${(err as Error)?.message}`);
      }
    }

    const hit = geoip.lookup(ip);
    if (!hit) return { country: null, region: null, city: null, lat: null, lng: null };
    return {
      country: hit.country || null,
      region: hit.region || null,
      city: hit.city || null,
      lat: round(hit.ll?.[0]),
      lng: round(hit.ll?.[1]),
    };
  }

  // ─── Statistics ───────────────────────────────────────────────────────────

  async eventAudience(eventId: string, userId: string, role: Role, days: number) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) throw new NotFoundException('Event not found');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.audience({ eventId }, days);
  }

  async accountAudience(userId: string, days: number) {
    return this.audience({ event: { organizerId: userId } }, days);
  }

  private async audience(where: Prisma.EventViewWhereInput, rawDays: number) {
    const days = Math.min(365, Math.max(1, Number(rawDays) || 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const views = await this.prisma.eventView.findMany({
      where: { ...where, createdAt: { gte: since } },
      select: {
        visitorHash: true, createdAt: true, country: true, city: true, lat: true, lng: true,
        referrer: true, source: true, device: true,
        event: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // "Personnes touchées": distinct daily visitors (the hash changes every day by design)
    const visitors = new Set(views.map((v) => v.visitorHash));

    const byDay = new Map<string, { views: number; visitors: Set<string> }>();
    for (let d = 0; d < days; d++) {
      const key = new Date(since.getTime() + (d + 1) * 24 * 3600 * 1000).toISOString().slice(0, 10);
      byDay.set(key, { views: 0, visitors: new Set() });
    }
    const countries = new Map<string, Set<string>>();
    const places = new Map<string, { city: string | null; country: string | null; lat: number; lng: number; visitors: Set<string> }>();
    const referrers = new Map<string, number>();
    const devices = new Map<string, number>();
    const events = new Map<string, { id: string; name: string; views: number; visitors: Set<string> }>();
    let located = 0;

    for (const v of views) {
      const day = v.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { views: 0, visitors: new Set<string>() };
      bucket.views++;
      bucket.visitors.add(v.visitorHash);
      byDay.set(day, bucket);

      const country = v.country ?? '??';
      if (!countries.has(country)) countries.set(country, new Set());
      countries.get(country)!.add(v.visitorHash);

      if (v.lat !== null && v.lng !== null) {
        located++;
        const key = `${v.lat},${v.lng}`;
        if (!places.has(key)) places.set(key, { city: v.city, country: v.country, lat: v.lat, lng: v.lng, visitors: new Set() });
        places.get(key)!.visitors.add(v.visitorHash);
      }

      const ref = v.source ? `utm:${v.source}` : v.referrer ?? 'Direct';
      referrers.set(ref, (referrers.get(ref) ?? 0) + 1);
      devices.set(v.device ?? 'desktop', (devices.get(v.device ?? 'desktop') ?? 0) + 1);

      if (!events.has(v.event.id)) events.set(v.event.id, { id: v.event.id, name: v.event.name, views: 0, visitors: new Set() });
      const e = events.get(v.event.id)!;
      e.views++;
      e.visitors.add(v.visitorHash);
    }

    const sortDesc = <T>(arr: T[], key: (x: T) => number) => arr.sort((a, b) => key(b) - key(a));

    return {
      days,
      views: views.length,
      uniqueVisitors: visitors.size,
      countriesCount: [...countries.keys()].filter((c) => c !== '??').length,
      locatedShare: views.length ? located / views.length : 0,
      byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([date, b]) => ({ date, views: b.views, visitors: b.visitors.size })),
      countries: sortDesc([...countries.entries()].map(([country, s]) => ({ country: country === '??' ? null : country, visitors: s.size })), (x) => x.visitors),
      places: sortDesc([...places.values()].map((p) => ({ city: p.city, country: p.country, lat: p.lat, lng: p.lng, visitors: p.visitors.size })), (x) => x.visitors).slice(0, 300),
      referrers: sortDesc([...referrers.entries()].map(([name, count]) => ({ name, views: count })), (x) => x.views).slice(0, 8),
      devices: [...devices.entries()].map(([device, count]) => ({ device, views: count })),
      events: sortDesc([...events.values()].map((e) => ({ id: e.id, name: e.name, views: e.views, visitors: e.visitors.size })), (x) => x.visitors),
    };
  }
}
