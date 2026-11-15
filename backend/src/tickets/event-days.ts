import { BadRequestException } from '@nestjs/common';
import { DEFAULT_TIME_ZONE, zoneOffsetMs } from '../common/time-zone';

/**
 * Days of an event and validity days of its tariffs. Days are 'YYYY-MM-DD' strings in the
 * event's time zone (its city's), the local time of the people at the door.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day of an instant in a zone */
export function eventDay(d: Date, tz: string = DEFAULT_TIME_ZONE): string {
  return new Date(d.getTime() + zoneOffsetMs(d, tz)).toISOString().slice(0, 10);
}

/** [start, end) of a day in a zone, as UTC instants */
export function dayBounds(day: string, tz: string = DEFAULT_TIME_ZONE): { start: Date; end: Date } {
  const midnight = (d: string) => {
    const asUtc = new Date(`${d}T00:00:00Z`).getTime();
    return new Date(asUtc - zoneOffsetMs(new Date(asUtc - zoneOffsetMs(new Date(asUtc), tz)), tz));
  };
  const next = new Date(new Date(`${day}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
  return { start: midnight(day), end: midnight(next) };
}

/** Every day from the event start to its end, inclusive */
export function eventDays(startDate: Date, endDate: Date | null | undefined, tz: string = DEFAULT_TIME_ZONE): string[] {
  const first = eventDay(startDate, tz);
  const last = eventDay(endDate ?? startDate, tz);
  const days: string[] = [];
  for (let t = new Date(`${first}T00:00:00Z`).getTime(); ; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    days.push(day);
    if (day >= last || days.length > 366) break;
  }
  return days;
}

/** Cleaned validity days (sorted, unique), all within the event: refused otherwise */
export function normalizeValidDays(days: string[] | undefined | null, allowed: string[]): string[] {
  if (!days || days.length === 0) return [];
  const clean = [...new Set(days.map((d) => String(d).slice(0, 10)))].sort();
  const outside = clean.filter((d) => !allowed.includes(d));
  if (outside.length > 0) {
    throw new BadRequestException(`Jour(s) hors de l'événement : ${outside.map(formatDayFr).join(', ')}`);
  }
  // Kept even when every day is ticked: a pass enters once a day, while a tariff without
  // days keeps the single entry it always had
  return clean;
}

/** "samedi 10 oct." */
export function formatDayFr(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "le samedi 10 oct." / "les samedi 10 oct. et dimanche 11 oct." */
export function formatDaysFr(days: string[]): string {
  const labels = days.map(formatDayFr);
  if (labels.length === 1) return `le ${labels[0]}`;
  return `les ${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`;
}

/**
 * Seats are counted per day: for each day of the event, the tariffs valid that day
 * (a tariff without days counts every day) must fit in the capacity.
 */
export function assertCapacityPerDay(
  tariffs: { quantity: number; validDays: string[] }[],
  days: string[],
  capacity: number,
) {
  for (const day of days) {
    const total = tariffs
      .filter((t) => t.validDays.length === 0 || t.validDays.includes(day))
      .reduce((sum, t) => sum + t.quantity, 0);
    if (total > capacity) {
      const when = days.length > 1 ? ` le ${formatDayFr(day)}` : '';
      throw new BadRequestException(
        `Les tarifs totalisent ${total} places${when}, au-delà de la capacité de l'événement (${capacity}).`,
      );
    }
  }
}

/** Tariff name with its days, printed on tickets: "Standard · sam. 10 oct., dim. 11 oct." */
export function tariffLabel(name: string, days: string[] | null | undefined): string {
  if (!days || days.length === 0) return name;
  const short = days.map((d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
  );
  return `${name} · ${short.join(', ')}`;
}
