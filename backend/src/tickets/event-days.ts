import { BadRequestException } from '@nestjs/common';

/**
 * Days of an event and validity days of its tariffs. Days are 'YYYY-MM-DD' strings in
 * Kinshasa time (UTC+1, no daylight saving), the local time of the events.
 */
export const EVENT_TIMEZONE = 'Africa/Kinshasa';
const KINSHASA_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Kinshasa calendar day of an instant */
export function kinshasaDay(d: Date): string {
  return new Date(d.getTime() + KINSHASA_OFFSET_MS).toISOString().slice(0, 10);
}

/** [start, end) of a Kinshasa day, as UTC instants */
export function kinshasaDayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${day}T00:00:00Z`).getTime() - KINSHASA_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Every day from the event start to its end, inclusive */
export function eventDays(startDate: Date, endDate: Date | null | undefined): string[] {
  const first = kinshasaDay(startDate);
  const last = kinshasaDay(endDate ?? startDate);
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
