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
