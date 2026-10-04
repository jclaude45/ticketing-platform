import type { PayoutInfo, PayoutPartRow } from '@/lib/api';

/** Amount in the currency of the event: "1 234,50 $", "25 000 FC" */
export function money(amount: number, currency: string) {
  const symbol: Record<string, string> = { USD: '$', EUR: '€', CDF: 'FC', XAF: 'FCFA', GBP: '£' };
  const value = amount.toLocaleString('fr-FR', { minimumFractionDigits: currency === 'CDF' || Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: currency === 'CDF' ? 0 : 2 });
  return `${value} ${symbol[currency] ?? currency}`;
}

export const dayFr = (d: string | Date) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export const PART_LABELS: Record<PayoutPartRow['part'], string> = {
  MAIN: 'Versement (90 %)',
  RESERVE: 'Réserve (10 %)',
};

export const PAYOUT_STATUS: Record<PayoutPartRow['status'], { label: string; cls: string }> = {
  PAID: { label: 'Versé', cls: 'bg-black text-white dark:bg-white dark:text-black' },
  DUE: { label: 'À verser', cls: 'bg-[#FFDD00] text-black' },
  UPCOMING: { label: 'Prévu', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
};

/** "M-Pesa · +243 81… · Jean Dupont" */
export function payoutInfoLine(info: PayoutInfo | null | undefined) {
  if (!info) return 'Coordonnées non renseignées';
  return info.method === 'bank'
    ? [info.bankName, info.accountNumber, info.accountName].filter(Boolean).join(' · ')
    : [info.network, info.phone, info.accountName].filter(Boolean).join(' · ');
}
