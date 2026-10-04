'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingApi, type AdminRefund } from '@/lib/api';
import { dayFr, money } from './payout-format';
import { cn } from '@/lib/utils';

/** Refunds to transfer to buyers, for the ZAYA team */
export function AdminRefunds() {
  const qc = useQueryClient();
  const [showPaid, setShowPaid] = useState(false);
  const [marking, setMarking] = useState<AdminRefund | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-refunds'], queryFn: billingApi.adminRefunds });

  const mark = useMutation({
    mutationFn: () => billingApi.markRefundPaid(marking!.id, { reference, note }),
    onSuccess: () => {
      toast.success('Remboursement enregistré');
      setMarking(null);
      qc.invalidateQueries({ queryKey: ['admin-refunds'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Enregistrement impossible'),
  });

  const rows = (data ?? []).filter(r => (showPaid ? r.status === 'PAID' : r.status === 'REQUESTED'));
  const toDo = (data ?? []).filter(r => r.status === 'REQUESTED').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[{ paid: false, label: 'À rembourser', n: toDo }, { paid: true, label: 'Remboursés', n: (data ?? []).length - toDo }].map(f => (
          <button
            key={f.label}
            type="button"
            onClick={() => setShowPaid(f.paid)}
            className={cn('rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              showPaid === f.paid ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black' : 'border-gray-200 text-gray-600 hover:border-black dark:border-gray-700 dark:text-gray-300')}
          >
            {f.label} <span className="opacity-60">{f.n}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      ) : rows.length === 0 ? (
        <p className="border-y border-gray-200 py-8 text-sm text-gray-500 dark:border-gray-800">Rien dans cette liste.</p>
      ) : (
        <div className="border-t border-gray-200 dark:border-gray-800">
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-1 gap-3 border-b border-gray-200 py-4 sm:grid-cols-[minmax(0,1fr)_170px_150px] sm:items-center dark:border-gray-800">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-black dark:text-white">{r.buyer.name} <span className="font-normal text-gray-500">· {r.eventName}</span></p>
                <p className="text-gray-500">{r.buyer.email}{r.buyer.phone ? ` · ${r.buyer.phone}` : ''}</p>
                <p className="text-xs text-gray-500">
                  Payé le {dayFr(r.order.date)} par {r.order.paymentMethod === 'card' ? 'carte' : 'Mobile Money'}
                  {r.order.orderNumber ? ` · FlexPay ${r.order.orderNumber}` : ''} · Réf. {r.order.reference}
                </p>
                {r.reason && <p className="text-xs text-gray-500">Motif : {r.reason}</p>}
              </div>
              <div className="sm:text-right">
                <p className="text-lg font-bold text-black dark:text-white">{money(r.amount, r.currency)}</p>
                <p className="text-xs text-gray-500">
                  {r.status === 'PAID' ? `remboursé le ${dayFr(r.paidAt!)}${r.reference ? ` · ${r.reference}` : ''}` : `demandé le ${dayFr(r.requestedAt)}`}
                </p>
              </div>
              <div className="sm:text-right">
                {r.status === 'REQUESTED' && (
                  <button type="button" onClick={() => { setMarking(r); setReference(''); setNote(''); }} className="btn-primary h-9 px-4 text-sm">
                    Marquer remboursé
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {marking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMarking(null)} />
          <form onSubmit={e => { e.preventDefault(); mark.mutate(); }} className="relative w-full max-w-md rounded-[18px] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <button type="button" onClick={() => setMarking(null)} aria-label="Fermer" className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button>
            <h3 className="pr-8 text-lg font-bold text-black dark:text-white">Enregistrer le remboursement</h3>
            <p className="mt-1 text-sm text-gray-500">{marking.buyer.name} · <span className="font-semibold text-black dark:text-white">{money(marking.amount, marking.currency)}</span></p>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Référence du virement" className="mt-5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black focus:border-black focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note (facultatif)" className="mt-3 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black focus:border-black focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            <button type="submit" disabled={mark.isPending} className="btn-primary mt-5 h-11 w-full gap-2">
              {mark.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
