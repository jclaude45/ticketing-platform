/**
 * ZAYA pricing (see the "Tarifs" page): online ticketing is free, ZAYA takes 9 % on paid
 * tickets sold online, and printing beyond the plan quota is paid per unit.
 */

/** ZAYA's share of each paid ticket sold online, payment fees included */
export const SALES_FEE_RATE = 0.09;

/** Per-unit price (USD) of what is printed beyond the plan quota */
export const PRINT_UNIT_PRICES = { TICKETS: 0.02, BADGES: 0.2 } as const;
export type PrintKind = keyof typeof PRINT_UNIT_PRICES;

/** Payouts: 90 % three days after the event ends, the 10 % reserve seven days later */
export const PAYOUT_DELAY_DAYS = 3;
export const RESERVE_RATE = 0.1;
export const RESERVE_DELAY_DAYS = 7;

export type FeePayer = 'ORGANIZER' | 'BUYER';

/** Amounts in Congolese francs have no decimals; others are kept to the cent */
export function roundMoney(amount: number, currency: string): number {
  if (currency === 'CDF') return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

/** Price a buyer sees and pays for one ticket: the fee is added when the buyer pays it */
export function buyerUnitPrice(price: number, feePayer: string | null | undefined, currency: string): number {
  if (price <= 0 || feePayer !== 'BUYER') return price;
  return roundMoney(price * (1 + SALES_FEE_RATE), currency);
}

/**
 * Fee split of the tickets of an order, at their listed prices.
 * BUYER: the buyer pays price + 9 %, the organizer gets the listed price.
 * ORGANIZER: the buyer pays the listed price, the organizer gets 91 % of it.
 */
export function ticketFeeSplit(
  items: { price: number; quantity: number }[],
  feePayer: string | null | undefined,
  currency: string,
) {
  const listed = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (listed <= 0) return { listed: 0, buyerPays: 0, fee: 0, organizerGets: 0 };
  if (feePayer === 'BUYER') {
    const buyerPays = items.reduce((s, i) => s + buyerUnitPrice(i.price, 'BUYER', currency) * i.quantity, 0);
    return { listed, buyerPays: roundMoney(buyerPays, currency), fee: roundMoney(buyerPays - listed, currency), organizerGets: listed };
  }
  const fee = roundMoney(listed * SALES_FEE_RATE, currency);
  return { listed, buyerPays: listed, fee, organizerGets: roundMoney(listed - fee, currency) };
}

/** Value sent to FlexPay: whole francs, cents otherwise */
export function flexPayAmount(amount: number, currency: string): string {
  return currency === 'CDF' ? String(Math.round(amount)) : amount.toFixed(2);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCMonth(r.getUTCMonth() + months);
  // 31 Jan + 1 month: last day of February, not 3 March
  if (r.getUTCDate() !== day) r.setUTCDate(0);
  return r;
}
