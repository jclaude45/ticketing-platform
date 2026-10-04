/** Formatting shared by the public ticketing pages */

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', CDF: 'FC', XAF: 'FCFA', XOF: 'FCFA' };

/** 15 → "15 $", 12.5 → "12,50 $" */
export function formatPrice(amount: number, currency = 'USD') {
  const n = Number(amount);
  const value = Number.isInteger(n)
    ? n.toLocaleString('fr-FR')
    : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value} ${SYMBOLS[currency] ?? currency}`;
}

/** "jeudi 26 déc. 2023" */
export function formatEventDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "jeudi 26 déc., 22:00" */
export function formatEventDayTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "À partir de 15 $", "Gratuit", "Complet" */
export function fromPriceLabel(e: { minPrice: number | null; soldOut: boolean; ticketTemplates: { currency: string }[] }) {
  // No ticket type yet also counts as "sold out" in the API
  if (e.minPrice === null) return 'Billets bientôt disponibles';
  if (e.soldOut) return 'Complet';
  if (e.minPrice === 0) return 'Gratuit';
  return `À partir de ${formatPrice(e.minPrice, e.ticketTemplates[0]?.currency)}`;
}

/** "sam. 10 oct." for a 'YYYY-MM-DD' day */
export function shortDay(day: string) {
  const label = new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Days of a tariff for display: "sam. 10 oct." / "Pass · sam. 10 oct., dim. 11 oct." / null (whole event) */
export function tariffDaysLabel(days?: string[] | null): string | null {
  if (!days || days.length === 0) return null;
  const list = days.map(shortDay).join(', ');
  return days.length > 1 ? `Pass · ${list}` : list;
}

/** Every day of an event, 'YYYY-MM-DD', from its start to its end (local time) */
export function daysBetween(start?: string, end?: string): string[] {
  if (!start) return [];
  const first = new Date(`${start.slice(0, 10)}T12:00:00`);
  const last = new Date(`${(end || start).slice(0, 10)}T12:00:00`);
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 60; d = new Date(d.getTime() + 86_400_000)) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}
