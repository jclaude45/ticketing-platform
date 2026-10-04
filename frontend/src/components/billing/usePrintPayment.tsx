'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { billingApi, type PrintQuote } from '@/lib/api';
import { FlexPayDialog, usd } from './FlexPayDialog';

const NOUN = { TICKETS: ['billet', 'billets'], BADGES: ['badge', 'badges'] } as const;
const plural = (n: number, kind: PrintQuote['kind']) => `${n.toLocaleString('fr-FR')} ${NOUN[kind][n > 1 ? 1 : 0]}`;

/** Lines of a print beyond the plan: quota used, credits used, what is paid */
export function printLines(q: PrintQuote) {
  const scope = q.period === 'EVENT' ? 'pour cet événement' : 'ce mois-ci';
  return [
    { label: `${plural(q.count, q.kind)} à imprimer`, value: '' },
    ...(q.included >= 0 ? [{ label: `Inclus dans votre plan ${scope}`, value: plural(q.fromQuota, q.kind), muted: true }] : []),
    ...(q.fromCredits > 0 ? [{ label: 'Pris sur vos crédits', value: plural(q.fromCredits, q.kind), muted: true }] : []),
    { label: `Au-delà : ${plural(q.missing, q.kind)} × ${usd(q.unitPrice)}`, value: usd(q.amount) },
  ];
}

/** The price carried by a 402 answer (also when the request expected a file) */
export function isPrintPaymentError(err: any): PrintQuote | null {
  if (err?.response?.status !== 402) return null;
  let body = err.response.data;
  if (body instanceof ArrayBuffer) {
    try { body = JSON.parse(new TextDecoder().decode(body)); } catch { return null; }
  }
  return body?.code === 'PRINT_CREDITS_REQUIRED' ? (body.quote as PrintQuote) : null;
}

/**
 * Print beyond the plan quota: runs an action, and when the server answers that credits are
 * missing (402), shows the price, lets the organizer pay, then runs the action again.
 */
export function usePrintPayment() {
  const qc = useQueryClient();
  const [quote, setQuote] = useState<PrintQuote | null>(null);
  const retry = useRef<(() => unknown) | null>(null);

  /** Asks for the payment of a known quote, then runs `then` */
  const ask = useCallback((q: PrintQuote, then: () => unknown) => {
    retry.current = then;
    setQuote(q);
  }, []);

  /** Runs the action; on a 402 asks for the payment and retries once paid. Other errors are rethrown */
  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await action();
    } catch (err) {
      const q = isPrintPaymentError(err);
      if (!q) throw err;
      ask(q, action);
      return undefined;
    }
  }, [ask]);

  const dialog = quote ? (
    <FlexPayDialog
      title={quote.kind === 'TICKETS' ? 'Billets au-delà de votre plan' : 'Badges au-delà de votre plan'}
      lines={printLines(quote)}
      amount={quote.amount}
      note="La billetterie en ligne reste gratuite : seuls les billets et badges à imprimer sont facturés."
      start={pay => billingApi.buyCredits(quote.kind, quote.missing, pay)}
      onClose={() => { setQuote(null); retry.current = null; }}
      onPaid={() => {
        setQuote(null);
        qc.invalidateQueries({ queryKey: ['my-subscription'] });
        qc.invalidateQueries({ queryKey: ['billing-payments'] });
        const again = retry.current;
        retry.current = null;
        again?.();
      }}
    />
  ) : null;

  return { guard, ask, dialog };
}
