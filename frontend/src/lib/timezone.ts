/**
 * Time zones of events: an event takes place in its city's zone (Kinshasa UTC+1, Lubumbashi
 * UTC+2, Paris...). Its times are typed and shown there, whatever the zone of the browser.
 */
export const DEFAULT_TIME_ZONE = 'Africa/Kinshasa';

/** How far the zone is ahead of UTC at that instant, in ms (daylight saving included) */
export function zoneOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** Wall-clock time of a datetime-local field, in a zone → ISO instant ('2026-11-14T09:30' in Kinshasa → 08:30Z) */
export function wallToIso(wall: string, tz: string): string {
  if (!wall) return '';
  const asUtc = new Date(`${wall.slice(0, 16)}:00Z`).getTime();
  if (isNaN(asUtc)) return '';
  let t = asUtc - zoneOffsetMs(new Date(asUtc), tz);
  t = asUtc - zoneOffsetMs(new Date(t), tz);
  return new Date(t).toISOString();
}

/** ISO instant → value of a datetime-local field, as the clock reads in the zone */
export function isoToWall(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + zoneOffsetMs(d, tz)).toISOString().slice(0, 16);
}

/** "UTC+1", "UTC+5:30", "UTC−3" */
export function utcOffsetLabel(tz: string, at: Date = new Date()): string {
  const min = Math.round(zoneOffsetMs(at, tz) / 60000);
  if (min === 0) return 'UTC';
  const abs = Math.abs(min);
  return `UTC${min > 0 ? '+' : '−'}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`;
}

/** "Lubumbashi" from "Africa/Lubumbashi", "Los Angeles" from "America/Los_Angeles" */
export function zoneCity(tz: string): string {
  return tz.split('/').pop()!.replace(/_/g, ' ');
}
