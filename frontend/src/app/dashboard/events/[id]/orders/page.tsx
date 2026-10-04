'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Receipt, Search, X } from 'lucide-react';
import { formatDrcPhone } from '@/lib/phone';
import toast from 'react-hot-toast';
import { billingApi, eventsApi, type EventOrder } from '@/lib/api';
import { PageHeader } from '@/components/common/PageHeader';
import { dayFr, money } from '@/components/billing/payout-format';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Payée', cls: 'bg-black text-white dark:bg-white dark:text-black' },
  PROCESSING: { label: 'En cours', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  REQUESTED: { label: 'Remboursement en cours', cls: 'bg-[#FFDD00] text-black' },
  PAID: { label: 'Remboursée', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
};
const statusOf = (o: EventOrder) => STATUS[o.refund ? o.refund.status : o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-600' };

/** Online orders of an event, and their refunds */
export default function EventOrdersPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [toRefund, setToRefund] = useState<EventOrder | 'ALL' | null>(null);
  const [reason, setReason] = useState('');

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await eventsApi.get(eventId);
      return (res.data as any)?.data ?? res.data;
    },
  });
  const { data: orders, isLoading } = useQuery({ queryKey: ['event-orders', eventId], queryFn: () => billingApi.orders(eventId) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['event-orders', eventId] });
    qc.invalidateQueries({ queryKey: ['payouts'] });
    qc.invalidateQueries({ queryKey: ['tickets', eventId] });
  };
  const refund = useMutation({
    mutationFn: () => (toRefund === 'ALL' ? billingApi.refundAll(eventId, reason) : billingApi.refund(eventId, (toRefund as EventOrder).id, reason)),
    onSuccess: (res: any) => {
      toast.success(toRefund === 'ALL' ? `${res.refunded} commande(s) remboursée(s)` : 'Commande remboursée : l’acheteur est prévenu par e-mail');
      setToRefund(null);
      setReason('');
      refresh();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Remboursement impossible'),
  });

  const list = (orders ?? []).filter(o => {
    const q = search.trim().toLowerCase();
    return !q || [o.holderName, o.holderEmail, o.reference, o.holderPhone ?? '', o.holderPhone ? formatDrcPhone(o.holderPhone) : ''].some(v => v.toLowerCase().includes(q));
  });
  const paid = (orders ?? []).filter(o => o.status === 'COMPLETED');
  const currency = orders?.[0]?.currency ?? event?.currency ?? 'USD';
  const total = (orders ?? []).reduce((s, o) => s + o.amount, 0);
  const refunded = (orders ?? []).filter(o => o.refund).reduce((s, o) => s + o.amount, 0);
  const net = (orders ?? []).reduce((s, o) => s + (o.refund ? -o.fee : o.net), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventes en ligne"
        description={event?.name ? `Commandes payées sur la billetterie · ${event.name}` : 'Commandes payées sur la billetterie'}
        actions={event?.status === 'CANCELLED' && paid.length > 0 ? (
          <button type="button" onClick={() => setToRefund('ALL')} className="btn-primary gap-2">
            Rembourser toutes les commandes
          </button>
        ) : undefined}
      />

      {(orders ?? []).length > 0 && (
        <div className="grid grid-cols-2 gap-6 border-y border-gray-200 py-5 sm:grid-cols-4 dark:border-gray-800">
          {[
            ['Commandes', String((orders ?? []).length)],
            ['Encaissé', money(total, currency)],
            ['Remboursé', money(refunded, currency)],
            ['Net pour vous', money(net, currency)],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-xs uppercase tracking-[0.1em] text-gray-400">{l}</p>
              <p className="mt-1 text-xl font-black text-black dark:text-white">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Nom, e-mail, téléphone ou référence"
          className="h-11 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm text-black focus:border-black focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border-y border-gray-200 py-14 text-center dark:border-gray-800">
          <Receipt className="h-10 w-10 text-gray-300" strokeWidth={1.4} />
          <p className="text-sm text-gray-500">{search ? 'Aucune commande ne correspond.' : 'Aucune commande en ligne pour l’instant.'}</p>
        </div>
      ) : (
        <div>
          <div className="hidden grid-cols-[110px_minmax(0,1fr)_120px_120px_170px_110px] gap-4 border-b border-gray-200 px-1 pb-2 text-xs text-gray-400 lg:grid dark:border-gray-800">
            <span>Date</span><span>Acheteur</span><span>Contenu</span><span className="text-right">Payé</span><span>Statut</span><span />
          </div>
          {list.map(o => {
            const st = statusOf(o);
            return (
              <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-gray-200 px-1 py-3.5 text-sm lg:grid-cols-[110px_minmax(0,1fr)_120px_120px_170px_110px] lg:items-center dark:border-gray-800">
                <span className="text-gray-500 lg:text-black lg:dark:text-white">{dayFr(o.date)}</span>
                <span className="order-first min-w-0 lg:order-none">
                  <span className="block truncate font-semibold text-black dark:text-white">{o.holderName}</span>
                  <span className="block truncate text-xs text-gray-500">{o.holderEmail}{o.holderPhone ? ` · ${formatDrcPhone(o.holderPhone)}` : ''}</span>
                </span>
                <span className="text-gray-500">
                  {o.tickets > 0 && `${o.tickets} billet${o.tickets > 1 ? 's' : ''}`}
                  {o.tickets > 0 && o.items > 0 && ' · '}
                  {o.items > 0 && `${o.items} article${o.items > 1 ? 's' : ''}`}
                </span>
                <span className="text-right font-semibold text-black dark:text-white">{money(o.amount, o.currency)}</span>
                <span><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', st.cls)}>{st.label}</span></span>
                <span className="text-right">
                  {o.status === 'COMPLETED' && (
                    <button type="button" onClick={() => setToRefund(o)} className="inline-flex h-8 items-center rounded-full border border-gray-200 px-3 text-xs font-medium text-black transition-colors hover:border-black dark:border-gray-700 dark:text-white">
                      Rembourser
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {toRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !refund.isPending && setToRefund(null)} />
          <form
            onSubmit={e => { e.preventDefault(); refund.mutate(); }}
            className="relative w-full max-w-md rounded-[18px] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          >
            <button type="button" onClick={() => setToRefund(null)} aria-label="Fermer" className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="h-4 w-4" />
            </button>
            <h3 className="pr-8 text-lg font-bold text-black dark:text-white">
              {toRefund === 'ALL' ? `Rembourser les ${paid.length} commandes` : `Rembourser ${toRefund.holderName}`}
            </h3>
            <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <p>
                {toRefund === 'ALL'
                  ? `Chaque acheteur récupère la totalité de ce qu’il a payé (${money(paid.reduce((s, o) => s + o.amount, 0), currency)} au total).`
                  : `L’acheteur récupère la totalité de ce qu’il a payé : ${money(toRefund.amount, toRefund.currency)}.`}{' '}
                Les billets non utilisés sont annulés tout de suite, les articles non retirés remis en stock, et l’acheteur est prévenu par e-mail.
              </p>
              <p>
                Le virement est fait par l’équipe ZAYA sous 14 jours ouvrés, sur vos ventes. Les frais ZAYA de 9 % sur
                {toRefund === 'ALL' ? ' ces commandes' : ' cette commande'} restent dus (CGV).
              </p>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Motif (facultatif), ex. : événement annulé"
              className="mt-4 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black focus:border-black focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <button type="submit" disabled={refund.isPending} className="btn-primary mt-4 h-11 w-full gap-2">
              {refund.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer le remboursement
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
