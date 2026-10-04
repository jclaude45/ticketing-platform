'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, Smartphone, X } from 'lucide-react';
import { billingApi, type PayRequest, type PayStart } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface PayLine {
  label: string;
  value: string;
  muted?: boolean;
}

interface FlexPayDialogProps {
  title: string;
  /** What is bought, line by line */
  lines: PayLine[];
  /** Total in USD */
  amount: number;
  /** Starts the FlexPay payment */
  start: (pay: PayRequest) => Promise<PayStart>;
  onClose: () => void;
  /** Payment confirmed (mobile money): continue what was asked */
  onPaid: () => void;
  /** Note under the total */
  note?: string;
}

export const usd = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} $`;

/** Wait for the mobile money confirmation: up to 5 minutes */
const POLL_MS = 4000;
const POLL_MAX = 75;

/**
 * Payment of the organizer to ZAYA through FlexPay: mobile money (confirmed on the phone,
 * followed here) or card (FlexPay page, then back to the dashboard).
 */
export function FlexPayDialog({ title, lines, amount, start, onClose, onPaid, note }: FlexPayDialogProps) {
  const [method, setMethod] = useState<'mobile_money' | 'card'>('mobile_money');
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<'form' | 'starting' | 'waiting' | 'paid' | 'failed'>('form');
  const [error, setError] = useState<string | null>(null);
  const polls = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const poll = (reference: string) => {
    timer.current = setTimeout(async () => {
      polls.current += 1;
      try {
        const p = await billingApi.payment(reference);
        if (p.status === 'COMPLETED') {
          setPhase('paid');
          setTimeout(onPaid, 900);
          return;
        }
        if (p.status === 'FAILED') {
          setPhase('failed');
          setError('Le paiement a été refusé ou annulé.');
          return;
        }
      } catch {
        // network hiccup: keep waiting
      }
      if (polls.current >= POLL_MAX) {
        setPhase('failed');
        setError("Pas de confirmation reçue. Si vous avez validé sur votre téléphone, le paiement apparaîtra dans « Mon abonnement ».");
        return;
      }
      poll(reference);
    }, POLL_MS);
  };

  const pay = async () => {
    setError(null);
    if (method === 'mobile_money' && phone.replace(/\D/g, '').length < 9) {
      setError('Indiquez le numéro Mobile Money qui va payer.');
      return;
    }
    setPhase('starting');
    try {
      const returnPath = window.location.pathname + window.location.search;
      const res = await start({ paymentMethod: method, phone: method === 'mobile_money' ? phone : undefined, returnPath });
      if (res.status === 'COMPLETED') {
        setPhase('paid');
        setTimeout(onPaid, 600);
        return;
      }
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      if (res.reference) {
        setPhase('waiting');
        polls.current = 0;
        poll(res.reference);
      }
    } catch (err: any) {
      setPhase('form');
      setError(err?.response?.data?.message ?? 'Le paiement n’a pas pu démarrer. Réessayez.');
    }
  };

  const busy = phase === 'starting' || phase === 'waiting';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-[18px] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {!busy && (
          <button type="button" onClick={onClose} aria-label="Fermer" className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-black dark:hover:bg-gray-800 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
        <h3 className="pr-8 text-lg font-bold text-black dark:text-white">{title}</h3>

        <div className="mt-4 border-t border-gray-200 dark:border-gray-800">
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-4 border-b border-gray-200 py-2.5 text-sm dark:border-gray-800">
              <span className={l.muted ? 'text-gray-500' : 'text-black dark:text-white'}>{l.label}</span>
              <span className={cn('text-right', l.muted ? 'text-gray-500' : 'text-black dark:text-white')}>{l.value}</span>
            </div>
          ))}
          <div className="flex justify-between py-3 text-base font-bold text-black dark:text-white">
            <span>À payer</span>
            <span>{usd(amount)}</span>
          </div>
        </div>
        {note && <p className="-mt-1 text-xs text-gray-500">{note}</p>}

        {phase === 'paid' ? (
          <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-black dark:text-white">
            <CheckCircle2 className="h-5 w-5 text-green-600" /> Paiement reçu
          </p>
        ) : phase === 'waiting' ? (
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#FFDD00] p-4 text-sm text-black">
            <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin" />
            <p>Validez le paiement sur votre téléphone (code PIN Mobile Money). Cette fenêtre se met à jour toute seule.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {([
                { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
                { id: 'card', label: 'Carte bancaire', icon: CreditCard },
              ] as const).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
                    method === m.id
                      ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-gray-200 text-gray-700 hover:border-black dark:border-gray-700 dark:text-gray-300',
                  )}
                >
                  <m.icon className="h-4 w-4" />
                  {m.label}
                </button>
              ))}
            </div>
            {method === 'mobile_money' && (
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Numéro Mobile Money, ex. 0812345678"
                className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            )}
            {method === 'card' && (
              <p className="mt-3 text-xs text-gray-500">Vous serez redirigé vers la page sécurisée FlexPay, puis ramené ici.</p>
            )}
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {phase !== 'paid' && phase !== 'waiting' && (
          <button
            type="button"
            onClick={pay}
            disabled={busy}
            className="btn-primary mt-5 h-12 w-full gap-2 text-base"
          >
            {phase === 'starting' ? <><Loader2 className="h-4 w-4 animate-spin" /> Connexion à FlexPay…</> : `Payer ${usd(amount)}`}
          </button>
        )}
        <p className="mt-3 text-center text-[11px] text-gray-400">Paiement sécurisé par FlexPay · Mobile Money et carte</p>
      </div>
    </div>
  );
}
