'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingApi, type PayoutInfo } from '@/lib/api';
import { PART_LABELS, PAYOUT_STATUS, dayFr, money, payoutInfoLine } from '@/components/billing/payout-format';
import { cn, downloadFile } from '@/lib/utils';

const NETWORKS = ['M-Pesa', 'Orange Money', 'Airtel Money', 'Afrimoney'];

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-gray-700 dark:bg-gray-800 dark:text-white';

/** Where ZAYA sends the sales: mobile money or bank account */
function PayoutInfoForm({ initial, onSaved }: { initial: PayoutInfo | null; onSaved: () => void }) {
  const [info, setInfo] = useState<PayoutInfo>(initial ?? { method: 'mobile_money', network: 'M-Pesa' });
  useEffect(() => { if (initial) setInfo(initial); }, [initial]);
  const set = (k: keyof PayoutInfo, v: string) => setInfo(prev => ({ ...prev, [k]: v }));
  const save = useMutation({
    mutationFn: () => billingApi.setPayoutInfo(info),
    onSuccess: () => { toast.success('Coordonnées de versement enregistrées'); onSaved(); },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Enregistrement impossible'),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
        {(['mobile_money', 'bank'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => set('method', m)}
            className={cn('rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
              info.method === m ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black' : 'border-gray-200 text-gray-700 hover:border-black dark:border-gray-700 dark:text-gray-300')}
          >
            {m === 'bank' ? 'Compte bancaire' : 'Mobile Money'}
          </button>
        ))}
      </div>
      {info.method === 'bank' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className={inputClass} placeholder="Banque" value={info.bankName ?? ''} onChange={e => set('bankName', e.target.value)} />
          <input className={inputClass} placeholder="Numéro de compte (IBAN)" value={info.accountNumber ?? ''} onChange={e => set('accountNumber', e.target.value)} />
          <input className={cn(inputClass, 'sm:col-span-2')} placeholder="Titulaire du compte" value={info.accountName ?? ''} onChange={e => set('accountName', e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select className={inputClass} value={info.network ?? 'M-Pesa'} onChange={e => set('network', e.target.value)}>
            {NETWORKS.map(n => <option key={n}>{n}</option>)}
          </select>
          <input className={inputClass} type="tel" placeholder="Numéro, ex. +243 81 234 5678" value={info.phone ?? ''} onChange={e => set('phone', e.target.value)} />
          <input className={cn(inputClass, 'sm:col-span-2')} placeholder="Nom du titulaire" value={info.accountName ?? ''} onChange={e => set('accountName', e.target.value)} />
        </div>
      )}
      <button type="submit" disabled={save.isPending} className="btn-primary gap-2">
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Enregistrer
      </button>
    </form>
  );
}

export default function PayoutsPage() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({ queryKey: ['payouts'], queryFn: billingApi.payouts });
  const { data: info, isLoading: loadingInfo } = useQuery({ queryKey: ['payout-info'], queryFn: billingApi.getPayoutInfo });

  // Totals per currency: still to come vs already paid out
  const totals = new Map<string, { pending: number; paid: number }>();
  for (const r of rows ?? []) {
    const t = totals.get(r.currency) ?? { pending: 0, paid: 0 };
    for (const p of r.payouts) p.status === 'PAID' ? (t.paid += p.amount) : (t.pending += p.amount);
    totals.set(r.currency, t);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-12">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-black sm:text-4xl dark:text-white">Mes versements</h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          Vos ventes en ligne (billets, boutique et livraison), moins les 9 % de ZAYA (frais de paiement compris). 90 % vous sont versés trois jours après la fin de l’événement, les 10 % restants sept jours plus tard.
        </p>
      </div>

      {totals.size > 0 && (
        <div className="grid grid-cols-1 gap-6 border-y border-gray-200 py-6 sm:grid-cols-2 dark:border-gray-800">
          {Array.from(totals).map(([cur, t]) => (
            <div key={cur} className="flex gap-10">
              <div>
                <p className="text-xs uppercase tracking-[0.1em] text-gray-400">À venir</p>
                <p className="mt-1 text-2xl font-black text-black dark:text-white">{money(t.pending, cur)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.1em] text-gray-400">Déjà versé</p>
                <p className="mt-1 text-2xl font-black text-black dark:text-white">{money(t.paid, cur)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <section>
        <h2 className="text-[15px] font-bold text-black dark:text-white">Par événement</h2>
        <p className="mt-0.5 text-sm text-gray-500">Seuls les événements avec des ventes en ligne apparaissent ici.</p>
        <div className="mt-5">
          {isLoading ? (
            <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ) : (rows ?? []).length === 0 ? (
            <p className="border-y border-gray-200 py-6 text-sm text-gray-500 dark:border-gray-800">Aucune vente en ligne pour l’instant.</p>
          ) : (rows ?? []).map(r => (
            <div key={`${r.eventId}-${r.currency}`} className="border-b border-gray-200 py-5 first:border-t dark:border-gray-800">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="font-semibold text-black dark:text-white">{r.eventName}</p>
                <p className="flex items-center gap-3 text-sm text-gray-500">
                  Fin le {dayFr(r.eventEnd)} · {r.orders} commande{r.orders > 1 ? 's' : ''}
                  <button
                    type="button"
                    onClick={async () => {
                      try { downloadFile(await billingApi.statement(r.eventId), `releve-zaya-${r.eventName}.pdf`); }
                      catch { toast.error('Relevé indisponible'); }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-black hover:border-black dark:border-gray-700 dark:text-white"
                  >
                    <Download className="h-3.5 w-3.5" /> Relevé PDF
                  </button>
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:max-w-2xl sm:grid-cols-4">
                <div><p className="text-xs text-gray-400">Encaissé</p><p className="text-black dark:text-white">{money(r.gross, r.currency)}</p></div>
                <div><p className="text-xs text-gray-400">Remboursé</p><p className="text-black dark:text-white">{r.refunded > 0 ? `- ${money(r.refunded, r.currency)}` : '—'}</p></div>
                <div><p className="text-xs text-gray-400">Frais ZAYA</p><p className="text-black dark:text-white">- {money(r.fees, r.currency)}</p></div>
                <div><p className="text-xs text-gray-400">Pour vous</p><p className="font-semibold text-black dark:text-white">{money(r.net, r.currency)}</p></div>
              </div>
              <div className="mt-4 space-y-2">
                {r.payouts.map(p => (
                  <div key={p.part} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="text-black dark:text-white">{PART_LABELS[p.part]} · {money(p.amount, r.currency)}</span>
                    <span className="flex items-center gap-3 text-gray-500">
                      {p.status === 'PAID' ? `le ${dayFr(p.paidAt!)}` : p.status === 'OWED' ? 'à régler à ZAYA (remboursements)' : `prévu le ${dayFr(p.dueAt)}`}
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', PAYOUT_STATUS[p.status].cls)}>{PAYOUT_STATUS[p.status].label}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-black dark:text-white">Coordonnées de versement</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          {info ? `Actuellement : ${payoutInfoLine(info)}` : 'Indiquez où recevoir vos ventes : sans coordonnées, nous ne pouvons pas vous verser.'}
        </p>
        <div className="mt-5">
          {loadingInfo ? (
            <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ) : (
            <PayoutInfoForm initial={info ?? null} onSaved={() => qc.invalidateQueries({ queryKey: ['payout-info'] })} />
          )}
        </div>
      </section>
    </div>
  );
}
