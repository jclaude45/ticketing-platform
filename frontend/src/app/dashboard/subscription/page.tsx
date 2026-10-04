'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingApi, subscriptionApi, type BillingPaymentRow, type SubscriptionHistoryEntry } from '@/lib/api';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FlexPayDialog, usd } from '@/components/billing/FlexPayDialog';
import { cn } from '@/lib/utils';
import type { SubscriptionPlan } from '@/types';

/** Rows shown before "Voir plus" */
const PREVIEW = 4;

const day = (d: string | Date) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const n = (x: number) => x.toLocaleString('fr-FR');
const limit = (x: number, word: string) => (x < 0 ? `${word} illimités` : `${n(x)} ${word}`);

/** "19 $ / mois", "0 $ pour toujours" */
function planPrice(price: number | null | undefined) {
  if (price === null || price === undefined) return '—';
  return price <= 0 ? '0 $ pour toujours' : `${usd(price)} / mois`;
}

/** What a plan includes, as on the pricing page */
function planSummary(p: SubscriptionPlan) {
  const scope = p.period === 'EVENT' ? 'par événement' : 'par mois';
  const ctl = (p.maxControllers ?? -1) < 0 ? 'contrôleurs illimités' : `${n(p.maxControllers!)} contrôleur${p.maxControllers! > 1 ? 's' : ''}`;
  const perTicket = p.price > 0 && p.maxTickets > 0 ? ` · soit ${(p.price / p.maxTickets).toFixed(3).replace('.', ',')} $ le billet` : '';
  return `${limit(p.maxTickets, 'billets')} à imprimer et ${limit(p.maxBadges, 'badges')} ${scope} · ${ctl} · billetterie en ligne illimitée${perTicket}`;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Payé', cls: 'text-black dark:text-white' },
  PENDING: { label: 'En attente', cls: 'text-gray-500' },
  FAILED: { label: 'Échoué', cls: 'text-red-600' },
};

function operation(h: SubscriptionHistoryEntry) {
  const by = h.by === 'admin' ? ' par ZAYA' : '';
  if (h.kind === 'start') return `Souscription${by}`;
  if (h.kind === 'renew') return 'Renouvellement (+1 mois)';
  if (h.kind === 'status') return `Statut modifié${by}`;
  return `Changement de plan${by}`;
}

function Block({ id, title, desc, children }: { id?: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[15px] font-bold text-black dark:text-white">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Bar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      {max > 0 && (
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-[#FFDD00]' : 'bg-black dark:bg-white')}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-gray-200 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)_120px] dark:border-gray-800">
      <span className="text-sm font-medium text-black dark:text-white">{label}</span>
      <div className="order-last col-span-2 sm:order-none sm:col-span-1">{max >= 0 && <Bar used={used} max={max} />}</div>
      <span className="text-right text-sm text-black dark:text-white">
        {n(used)}<span className="text-gray-400"> / {max < 0 ? 'illimité' : n(max)}</span>
      </span>
    </div>
  );
}

const outlineButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 dark:border-gray-700 dark:text-white dark:hover:border-white';

export default function SubscriptionPage() {
  const qc = useQueryClient();
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [payPlan, setPayPlan] = useState<SubscriptionPlan | null>(null);
  const [freeConfirm, setFreeConfirm] = useState<SubscriptionPlan | null>(null);
  const [switching, setSwitching] = useState(false);

  const { data: mine, isLoading: loadingSub } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionApi.getMySubscription().then(r => r.data.data),
  });
  const { data: plans, isLoading: loadingPlans } = useQuery({
    queryKey: ['subscription-plans-public'],
    queryFn: () => subscriptionApi.listPlans().then(r => r.data.data),
  });
  const { data: payments } = useQuery({ queryKey: ['billing-payments'], queryFn: billingApi.payments });
  const { data: history } = useQuery({
    queryKey: ['subscription-history'],
    queryFn: () => subscriptionApi.getMyHistory().then(r => r.data.data),
  });

  const limits = mine?.limits;
  const subscription = mine?.subscription ?? null;
  const plan = limits?.plan;
  const perEvent = plan?.period === 'EVENT';
  const paidPlan = !!plan && plan.price > 0;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['my-subscription'] });
    qc.invalidateQueries({ queryKey: ['my-subscription-limits'] });
    qc.invalidateQueries({ queryKey: ['billing-payments'] });
    qc.invalidateQueries({ queryKey: ['subscription-history'] });
  };

  const switchToFree = async (p: SubscriptionPlan) => {
    setSwitching(true);
    try {
      await billingApi.buyPlan(p.id, { paymentMethod: 'card' });
      toast.success('Vous êtes passé au plan gratuit');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Le changement de plan a échoué');
    } finally {
      setSwitching(false);
      setFreeConfirm(null);
    }
  };

  const payRows = (payments ?? []) as BillingPaymentRow[];
  const visiblePayments = showAllPayments ? payRows : payRows.slice(0, PREVIEW);
  const activePlans = (plans ?? []).filter((p: SubscriptionPlan) => p.isActive !== false);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-8 text-3xl font-black uppercase tracking-tight text-black sm:text-4xl xl:mb-10 dark:text-white">Abonnement</h1>
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
        {/* Current plan: on top on small screens, on the right on wide ones */}
        <aside className="xl:sticky xl:top-6 xl:order-last">
          <div className="rounded-[18px] bg-[#FFDD00] p-6 text-black">
            <p className="text-sm font-medium">Votre plan</p>
            {loadingSub || !limits ? (
              <div className="mt-2 h-8 w-32 animate-pulse rounded bg-black/10" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-black tracking-tight">{plan!.name}</p>
                <p className="mt-0.5 text-sm font-semibold">{planPrice(plan!.price)}</p>
                <div className="mt-3 space-y-0.5 text-xs">
                  {paidPlan && limits.periodStart && limits.periodEnd && (
                    <p>Mois en cours : {day(limits.periodStart)} → {day(limits.periodEnd)}</p>
                  )}
                  {paidPlan && subscription?.expiresAt && <p>Payé jusqu’au {day(subscription.expiresAt)}</p>}
                  {!paidPlan && <p>Billetterie en ligne illimitée, sans limite de durée</p>}
                  {(limits.credits.tickets > 0 || limits.credits.badges > 0) && (
                    <p className="pt-1 font-semibold">
                      Crédits : {n(limits.credits.tickets)} billet{limits.credits.tickets > 1 ? 's' : ''} · {n(limits.credits.badges)} badge{limits.credits.badges > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </>
            )}
            <a
              href="#plans"
              className="mt-5 flex h-10 items-center justify-center rounded-full border border-black/80 text-sm font-semibold transition-colors hover:bg-black hover:text-[#FFDD00]"
            >
              {paidPlan ? 'Renouveler ou changer' : 'Changer de plan'}
            </a>
          </div>
          <p className="mt-4 px-1 text-xs leading-relaxed text-gray-500">
            Sur les ventes en ligne (billets et boutique), ZAYA prélève 9 %, frais de paiement compris. Vos ventes vous sont versées 3 jours après l’événement.{' '}
            <Link href="/dashboard/payouts" className="font-semibold text-black underline decoration-[#FFDD00] decoration-2 underline-offset-2 dark:text-white">Mes versements</Link>
          </p>
        </aside>

        <div className="min-w-0 space-y-12">
          <Block
            title="Utilisation"
            desc={perEvent
              ? 'Billets et badges à imprimer, par événement. Les billets vendus ou réservés en ligne ne comptent jamais.'
              : 'Billets et badges à imprimer ce mois-ci. Les billets vendus ou réservés en ligne ne comptent jamais.'}
          >
            {!limits ? (
              <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ) : perEvent ? (
              <>
                <div className="hidden grid-cols-[minmax(0,1fr)_150px_150px] gap-4 border-b border-gray-200 px-1 pb-2 text-xs text-gray-400 sm:grid dark:border-gray-800">
                  <span>Événement</span><span className="text-right">Billets à imprimer</span><span className="text-right">Badges</span>
                </div>
                {limits.perEvent.length === 0 ? (
                  <p className="border-b border-gray-200 px-1 py-5 text-sm text-gray-500 dark:border-gray-800">Aucun événement pour l’instant.</p>
                ) : limits.perEvent.map(e => (
                  <div key={e.eventId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-gray-200 px-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_150px_150px] sm:items-center dark:border-gray-800">
                    <span className="col-span-2 truncate font-medium text-black sm:col-span-1 dark:text-white">{e.name}</span>
                    <span className="text-black sm:text-right dark:text-white">
                      <span className="text-gray-400 sm:hidden">Billets </span>{n(e.tickets)}<span className="text-gray-400"> / {n(limits.maxTickets)}</span>
                    </span>
                    <span className="text-right text-black dark:text-white">
                      <span className="text-gray-400 sm:hidden">Badges </span>{n(e.badges)}<span className="text-gray-400"> / {n(limits.maxBadges)}</span>
                    </span>
                  </div>
                ))}
                <UsageRow label="Contrôleurs" used={limits.controllersUsed} max={limits.maxControllers} />
              </>
            ) : (
              <div className="border-t border-gray-200 dark:border-gray-800">
                <UsageRow label="Billets à imprimer" used={limits.ticketsUsed} max={limits.maxTickets} />
                <UsageRow label="Badges" used={limits.badgesUsed} max={limits.maxBadges} />
                <UsageRow label="Contrôleurs" used={limits.controllersUsed} max={limits.maxControllers} />
              </div>
            )}
            {limits && (
              <p className="mt-3 text-xs text-gray-500">
                Au-delà, rien ne se bloque : {usd(limits.unitPrices.TICKETS)} le billet et {usd(limits.unitPrices.BADGES)} le badge, affichés et payés avant la génération.
              </p>
            )}
          </Block>

          <Block id="plans" title="Plans" desc="Sans engagement : vous changez de plan ou revenez au gratuit à tout moment.">
            {loadingPlans || loadingSub ? (
              <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ) : activePlans.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun plan disponible pour l’instant.</p>
            ) : (
              <div className="border-t border-gray-200 dark:border-gray-800">
                {activePlans.map((p: SubscriptionPlan) => {
                  const current = plan?.id === p.id || (plan?.code === 'FREE' && p.code === 'FREE');
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-b border-gray-200 px-1 py-4 sm:grid-cols-[minmax(0,1fr)_140px_130px] dark:border-gray-800"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-black dark:text-white">{p.name}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{planSummary(p)}</p>
                      </div>
                      <span className="hidden text-right text-sm text-black sm:block dark:text-white">{planPrice(p.price)}</span>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-gray-500 sm:hidden">{planPrice(p.price)}</span>
                        {current && p.price <= 0 ? (
                          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black px-4 text-sm font-medium text-white dark:bg-white dark:text-black">
                            <Check className="h-3.5 w-3.5" /> Actuel
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => (p.price <= 0 ? setFreeConfirm(p) : setPayPlan(p))}
                            disabled={switching}
                            className={current ? 'btn-primary h-9 px-4 text-sm' : outlineButton}
                          >
                            {current ? 'Renouveler' : p.price <= 0 ? 'Revenir' : 'Choisir'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Block>

          <Block title="Paiements" desc="Ce que vous avez réglé à ZAYA : plans et billets ou badges au-delà de votre plan.">
            <div className="hidden grid-cols-[110px_minmax(0,1fr)_120px_100px_90px] gap-4 border-b border-gray-200 px-3 pb-2 text-xs text-gray-400 sm:grid dark:border-gray-800">
              <span>Date</span><span>Achat</span><span>Moyen</span><span className="text-right">Montant</span><span className="text-right">Statut</span>
            </div>
            {payRows.length === 0 ? (
              <p className="border-b border-gray-200 px-3 py-6 text-sm text-gray-500 dark:border-gray-800">Aucun paiement pour l’instant.</p>
            ) : visiblePayments.map(p => (
              <div
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-gray-200 px-3 py-3.5 text-sm sm:grid-cols-[110px_minmax(0,1fr)_120px_100px_90px] sm:items-center dark:border-gray-800"
              >
                <span className="text-black dark:text-white">{day(p.date)}</span>
                <span className="text-right font-semibold text-black sm:text-left dark:text-white">{p.label}</span>
                <span className="text-gray-500">{p.paymentMethod === 'card' ? 'Carte' : 'Mobile Money'}</span>
                <span className="text-right text-black dark:text-white">{usd(p.amount)}</span>
                <span className={cn('col-span-2 text-right text-xs sm:col-span-1 sm:text-sm', STATUS[p.status]?.cls)}>{STATUS[p.status]?.label ?? p.status}</span>
              </div>
            ))}
            {payRows.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllPayments(v => !v)}
                className="mt-4 text-sm font-semibold text-black underline decoration-[#FFDD00] decoration-2 underline-offset-4 dark:text-white"
              >
                {showAllPayments ? 'Voir moins' : `Voir plus (${payRows.length - PREVIEW})`}
              </button>
            )}
          </Block>

          {(history ?? []).length > 0 && (
            <Block title="Changements de plan" desc="Souscriptions, renouvellements et changements de plan de votre compte.">
              {(history ?? []).slice(0, 8).map(h => (
                <div key={h.id} className="grid grid-cols-[110px_minmax(0,1fr)_auto] gap-4 border-b border-gray-200 px-3 py-3 text-sm dark:border-gray-800">
                  <span className="text-black dark:text-white">{day(h.date)}</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-black dark:text-white">{h.planName}</span> · {operation(h)}
                    {h.previousPlanName && <span className="text-gray-400"> · depuis {h.previousPlanName}</span>}
                  </span>
                  <span className="text-right text-black dark:text-white">{h.price ? `${usd(h.price)}` : 'Gratuit'}</span>
                </div>
              ))}
            </Block>
          )}
        </div>
      </div>

      {payPlan && (
        <FlexPayDialog
          title={`Plan ${payPlan.name}`}
          lines={[
            { label: `${payPlan.name} · 1 mois`, value: usd(payPlan.price) },
            { label: planSummary(payPlan), value: '', muted: true },
          ]}
          amount={payPlan.price}
          note={plan?.id === payPlan.id
            ? 'Le mois payé s’ajoute à la suite de votre mois en cours.'
            : 'Le plan s’applique dès la confirmation du paiement, pour un mois. Sans engagement.'}
          start={pay => billingApi.buyPlan(payPlan.id, pay)}
          onClose={() => setPayPlan(null)}
          onPaid={() => {
            setPayPlan(null);
            toast.success(`Plan ${payPlan.name} activé`);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!freeConfirm}
        onClose={() => setFreeConfirm(null)}
        onConfirm={() => freeConfirm && switchToFree(freeConfirm)}
        title="Revenir au plan gratuit"
        description="Le plan gratuit s’applique tout de suite : 100 billets à imprimer et 20 badges par événement, 2 contrôleurs. Le mois déjà payé n’est pas remboursé."
        confirmLabel="Revenir au gratuit"
        variant="default"
        isLoading={switching}
      />
    </div>
  );
}
