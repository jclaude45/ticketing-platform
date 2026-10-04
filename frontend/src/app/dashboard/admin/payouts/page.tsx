'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingApi, type PayoutPartRow, type PayoutRow } from '@/lib/api';
import { PART_LABELS, PAYOUT_STATUS, dayFr, money, payoutInfoLine } from '@/components/billing/payout-format';
import { cn } from '@/lib/utils';

type Filter = 'DUE' | 'UPCOMING' | 'PAID' | 'ALL';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'DUE', label: 'À verser' },
  { id: 'UPCOMING', label: 'Prévus' },
  { id: 'PAID', label: 'Versés' },
  { id: 'ALL', label: 'Tous' },
];

/** Payouts to organizers, made by the ZAYA team and recorded here */
export default function AdminPayoutsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('DUE');
  const [marking, setMarking] = useState<{ row: PayoutRow; part: PayoutPartRow } | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const { data: rows, isLoading } = useQuery({ queryKey: ['admin-payouts'], queryFn: billingApi.adminPayouts });

  const mark = useMutation({
    mutationFn: () => billingApi.markPaid({ eventId: marking!.row.eventId, part: marking!.part.part, reference, note }),
    onSuccess: () => {
      toast.success('Versement enregistré');
      setMarking(null);
      qc.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Enregistrement impossible'),
  });

  const items = (rows ?? []).flatMap(r => r.payouts.map(p => ({ row: r, part: p })))
    .filter(x => filter === 'ALL' || x.part.status === filter)
    .sort((a, b) => +new Date(a.part.dueAt) - +new Date(b.part.dueAt));
  const count = (f: Filter) => (rows ?? []).flatMap(r => r.payouts).filter(p => f === 'ALL' || p.status === f).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-black sm:text-4xl dark:text-white">Versements</h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          Ventes en ligne à reverser aux organisateurs : 90 % trois jours après la fin de l’événement, la réserve de 10 % sept jours plus tard. Faites le virement, puis enregistrez-le ici.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn('rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              filter === f.id ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black' : 'border-gray-200 text-gray-600 hover:border-black dark:border-gray-700 dark:text-gray-300')}
          >
            {f.label} <span className="opacity-60">{count(f.id)}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      ) : items.length === 0 ? (
        <p className="border-y border-gray-200 py-8 text-sm text-gray-500 dark:border-gray-800">Rien dans cette liste.</p>
      ) : (
        <div className="border-t border-gray-200 dark:border-gray-800">
          {items.map(({ row, part }) => {
            const o = row.organizer;
            return (
              <div key={`${row.eventId}-${part.part}`} className="grid grid-cols-1 gap-3 border-b border-gray-200 py-4 sm:grid-cols-[minmax(0,1fr)_170px_150px] sm:items-center dark:border-gray-800">
                <div className="min-w-0">
                  <p className="font-semibold text-black dark:text-white">{row.eventName} <span className="font-normal text-gray-500">· {PART_LABELS[part.part]}</span></p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {o ? `${o.firstName} ${o.lastName} · ${o.email}` : '—'}
                  </p>
                  <p className={cn('mt-0.5 text-sm', o?.payoutInfo ? 'text-black dark:text-white' : 'text-red-600')}>
                    {payoutInfoLine(o?.payoutInfo)}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-lg font-bold text-black dark:text-white">{money(part.amount, row.currency)}</p>
                  <p className="text-xs text-gray-500">
                    {part.status === 'PAID' ? `versé le ${dayFr(part.paidAt!)}${part.reference ? ` · ${part.reference}` : ''}` : `dû le ${dayFr(part.dueAt)}`}
                  </p>
                </div>
                <div className="sm:text-right">
                  {part.status === 'PAID' ? (
                    <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', PAYOUT_STATUS.PAID.cls)}>Versé</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setMarking({ row, part }); setReference(''); setNote(''); }}
                      className={part.status === 'DUE' ? 'btn-primary h-9 px-4 text-sm' : 'inline-flex h-9 items-center rounded-full border border-gray-200 px-4 text-sm font-medium text-black hover:border-black dark:border-gray-700 dark:text-white'}
                    >
                      Marquer versé
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {marking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMarking(null)} />
          <form
            onSubmit={e => { e.preventDefault(); mark.mutate(); }}
            className="relative w-full max-w-md rounded-[18px] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          >
            <button type="button" onClick={() => setMarking(null)} aria-label="Fermer" className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-black dark:hover:bg-gray-800">
              <X className="h-4 w-4" />
            </button>
            <h3 className="pr-8 text-lg font-bold text-black dark:text-white">Enregistrer le versement</h3>
            <p className="mt-1 text-sm text-gray-500">
              {marking.row.eventName} · {PART_LABELS[marking.part.part]} · <span className="font-semibold text-black dark:text-white">{money(marking.part.amount, marking.row.currency)}</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">Vers : {payoutInfoLine(marking.row.organizer?.payoutInfo)}</p>
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Référence du virement (transaction Mobile Money, virement…)"
              className="mt-5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black focus:border-black focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Note (facultatif)"
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black focus:border-black focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            {marking.part.status === 'UPCOMING' && (
              <p className="mt-3 text-xs text-gray-500">Ce versement n’est dû que le {dayFr(marking.part.dueAt)} : vous l’enregistrez en avance.</p>
            )}
            <button type="submit" disabled={mark.isPending} className="btn-primary mt-5 h-11 w-full gap-2">
              {mark.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer le versement
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
