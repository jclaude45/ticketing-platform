import * as fs from 'fs';
import * as path from 'path';

/**
 * Time zones of events. An event takes place in its city's zone (Kinshasa UTC+1, Lubumbashi
 * UTC+2, Paris...): its times are typed, shown and counted in days there, whatever the zone of
 * the server (UTC) or of whoever looks at them.
 */
export const DEFAULT_TIME_ZONE = 'Africa/Kinshasa';

/** GeoNames (cities5000): per country, the zone of its largest city and the cities in another one */
let zones: Record<string, { d: string; x?: Record<string, string> }> | null = null;
function geoZones() {
  zones ??= JSON.parse(fs.readFileSync(path.join(__dirname, 'geo-timezones.json'), 'utf8'));
  return zones!;
}

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const COUNTRY_ALIASES: Record<string, string> = {
  rdc: 'CD', drc: 'CD', 'rd congo': 'CD', 'republique democratique du congo': 'CD', 'congo-kinshasa': 'CD',
  'congo kinshasa': 'CD', 'democratic republic of the congo': 'CD', zaire: 'CD',
  congo: 'CG', 'congo-brazzaville': 'CG', 'congo brazzaville': 'CG', 'republique du congo': 'CG',
};
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** ISO code of a stored country ("RD Congo", "RDC", "France", "CD"...), or null */
export function countryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const v = normalize(country);
  if (COUNTRY_ALIASES[v]) return COUNTRY_ALIASES[v];
  const all = geoZones();
  if (/^[a-z]{2}$/.test(v) && all[v.toUpperCase()]) return v.toUpperCase();
  for (const locale of ['fr', 'en']) {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    const code = Object.keys(all).find((c) => normalize(names.of(c) ?? '') === v);
    if (code) return code;
  }
  return null;
}

/** The zone of a city (its country's main zone when the city is not listed), or null */
export function timeZoneOf(country: string | null | undefined, city: string | null | undefined): string | null {
  const code = countryCode(country);
  const entry = code ? geoZones()[code] : null;
  if (!entry) return null;
  const c = normalize(city ?? '');
  const exception = Object.entries(entry.x ?? {}).find(([name]) => normalize(name) === c);
  return exception?.[1] ?? entry.d;
}

/** How far the zone is ahead of UTC at that instant, in ms (daylight saving included) */
export function zoneOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of a wall-clock time in a zone: '2026-11-14T09:30' in Africa/Kinshasa → 08:30Z */
export function zonedToUtc(wall: string, tz: string): Date {
  const asUtc = new Date(`${wall.slice(0, 16)}:00Z`).getTime();
  // Two passes: the offset of the guess, then of the result (right across a DST change)
  let t = asUtc - zoneOffsetMs(new Date(asUtc), tz);
  t = asUtc - zoneOffsetMs(new Date(t), tz);
  return new Date(t);
}
