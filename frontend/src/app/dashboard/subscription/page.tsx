'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { eventsApi, subscriptionApi, type SubscriptionHistoryEntry } from '@/lib/api';
import { AccountNav } from '@/components/account/AccountNav';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { cn } from '@/lib/utils';
import type { SubscriptionPlan } from '@/types';

/** Rows shown before "Voir plus" */
const HISTORY_PREVIEW = 4;

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  CANCELLED: 'Annulé',
  SUSPENDED: 'Suspendu',
};

const day = (d: string | Date) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** 16 → "16 $ / mois", 0 → "Gratuit" (prices are in dollars, as on zaya.live) */
function planPrice(price: number | null | undefined) {
  if (price === null || price === undefined) return '—';
  if (price === 0) return 'Gratuit';
  const n = Number.isInteger(price) ? price.toLocaleString('fr-FR') : price.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
  return `${n} $ / mois`;
}

const count = (n: number, one: string, many: string) =>
  n < 0 ? `${many.charAt(0).toUpperCase()}${many.slice(1)} illimités` : `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

/** What a plan includes, in one line */
function planSummary(p: SubscriptionPlan) {
  return [
    count(p.maxEvents, 'événement', 'événements'),
    `${count(p.maxTickets, 'billet', 'billets')}`,
    count(p.maxBadges, 'badge', 'badges'),
    p.allowCommunication && 'campagnes email et SMS',
    p.allowBulkExport && 'export des données',
    !p.showPoweredBy && 'sans « Powered by ZAYA »',
  ].filter(Boolean).join(' · ');
}

function operation(h: SubscriptionHistoryEntry) {
  const by = h.by === 'admin' ? ' par ZAYA' : '';
  if (h.kind === 'start') return `Souscription${by}`;
  if (h.kind === 'status') return `${STATUS_LABELS[h.status ?? ''] ?? 'Statut modifié'}${by}`;
  return `Changement de plan${by}`;
}

/** Block of the page, title and subtitle as in the account design */
function Block({ id, title, desc, children }: { id?: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[15px] font-bold text-black dark:text-white">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max < 0;
  const pct = !unlimited && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-gray-200 py-3.5 sm:grid-cols-[160px_minmax(0,1fr)_120px] dark:border-gray-800">
      <span className="text-sm font-medium text-black dark:text-white">{label}</span>
      <div className="order-last col-span-2 h-1 overflow-hidden rounded-full bg-gray-100 sm:order-none sm:col-span-1 dark:bg-gray-800">
        {!unlimited && (
          <div
            className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-[#FFDD00]' : 'bg-black dark:bg-white')}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="text-right text-sm text-black dark:text-white">
        {used.toLocaleString('fr-FR')}
        <span className="text-gray-400"> / {unlimited ? 'illimité' : max.toLocaleString('fr-FR')}</span>
      </span>
    </div>
  );
}

const outlineButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 dark:border-gray-700 dark:text-white dark:hover:border-white';

export default function SubscriptionPage() {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [toPlan, setToPlan] = useState<SubscriptionPlan | null>(null);

  const { data: mine, isLoading: loadingSub } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionApi.getMySubscription().then(r => r.data.data),
  });
  const { data: plans, isLoading: loadingPlans } = useQuery({
    queryKey: ['subscription-plans-public'],
    queryFn: () => subscriptionApi.listPlans().then(r => r.data.data),
  });
  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['subscription-history'],
    queryFn: () => subscriptionApi.getMyHistory().then(r => r.data.data),
  });
  // Events created, for the events quota
  const { data: eventCount } = useQuery({
    queryKey: ['events-count'],
    queryFn: () => eventsApi.list({ page: 1, limit: 1 }).then(r => (r.data as any)?.total ?? (r.data as any)?.data?.total ?? 0),
  });

  const subscribe = useMutation({
    mutationFn: (planId: string) => subscriptionApi.subscribePlan(planId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
      qc.invalidateQueries({ queryKey: ['subscription-history'] });
      toast.success('Nouveau plan activé');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Le plan n’a pas pu être activé. Réessayez.'),
  });

  const subscription = mine?.subscription ?? null;
  const limits = mine?.limits;
  const status = subscription?.status ?? 'ACTIVE';
  const rows = history ?? [];
  const visible = showAll ? rows : rows.slice(0, HISTORY_PREVIEW);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:gap-10">
      <AccountNav active="subscription" />

      <div className="min-w-0 flex-1">
        <h1 className="mb-8 text-3xl font-black uppercase tracking-tight text-black sm:text-4xl xl:mb-10 dark:text-white">Abonnement</h1>
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
          {/* Current plan: on top on small screens, on the right on wide ones */}
          <aside className="xl:sticky xl:top-6 xl:order-last">
            <div className="rounded-[18px] bg-[#FFDD00] p-6 text-black">
              <p className="text-sm font-medium">Votre plan</p>
              {loadingSub ? (
                <div className="mt-2 h-8 w-32 animate-pulse rounded bg-black/10" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-black tracking-tight">{subscription?.plan.name ?? 'Gratuit'}</p>
                  <p className="mt-0.5 text-sm font-semibold">{planPrice(subscription?.plan.price ?? 0)}</p>
                  <div className="mt-3 space-y-0.5 text-xs">
                    {status !== 'ACTIVE' && (
                      <p className="mb-1.5 inline-block rounded-full bg-black px-2.5 py-0.5 font-semibold text-[#FFDD00]">
                        {STATUS_LABELS[status] ?? status}
                      </p>
                    )}
                    {subscription && <p>Depuis le {day(subscription.startsAt)}</p>}
                    <p>
                      {subscription?.expiresAt
                        ? `${new Date(subscription.expiresAt) < new Date() ? 'A expiré' : 'Expire'} le ${day(subscription.expiresAt)}`
                        : 'Sans date d’expiration'}
                    </p>
                  </div>
                </>
              )}
              <a
                href="#plans"
                className="mt-5 flex h-10 items-center justify-center rounded-full border border-black/80 text-sm font-semibold transition-colors hover:bg-black hover:text-[#FFDD00]"
              >
                Changer de plan
              </a>
            </div>
          </aside>

          <div className="min-w-0 space-y-12">
            <Block title="Historique" desc="Les souscriptions et changements de plan de votre compte.">
              <div className="hidden grid-cols-[110px_minmax(0,0.8fr)_minmax(0,1.4fr)_110px] gap-4 border-b border-gray-200 px-3 pb-2 text-xs text-gray-400 sm:grid dark:border-gray-800">
                <span>Date</span>
                <span>Plan</span>
                <span>Opération</span>
                <span className="text-right">Montant</span>
              </div>
              {loadingHistory ? (
                <div className="space-y-3 py-4">
                  {[0, 1, 2].map(i => <div key={i} className="h-5 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />)}
                </div>
              ) : rows.length === 0 ? (
                <p className="border-b border-gray-200 px-3 py-6 text-sm text-gray-500 dark:border-gray-800">
                  Aucun changement de plan pour l’instant : vous êtes sur le plan gratuit.
                </p>
              ) : (
                visible.map(h => (
                  <div
                    key={h.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-gray-200 px-3 py-3.5 text-sm transition-shadow hover:rounded-xl hover:border-transparent hover:bg-white hover:shadow-[0_6px_24px_rgba(0,0,0,0.08)] sm:grid-cols-[110px_minmax(0,0.8fr)_minmax(0,1.4fr)_110px] sm:items-center dark:border-gray-800 dark:hover:bg-gray-900"
                  >
                    <span className="text-black dark:text-white">{day(h.date)}</span>
                    <span className="text-right font-semibold text-black sm:text-left dark:text-white">{h.planName}</span>
                    <span className="text-gray-500">
                      {operation(h)}
                      {h.previousPlanName && <span className="block text-xs text-gray-400">depuis {h.previousPlanName}</span>}
                    </span>
                    <span className="text-right text-black dark:text-white">{planPrice(h.price)}</span>
                  </div>
                ))
              )}
              {rows.length > HISTORY_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAll(v => !v)}
                  className="mt-4 text-sm font-semibold text-black underline decoration-[#FFDD00] decoration-2 underline-offset-4 dark:text-white"
                >
                  {showAll ? 'Voir moins' : `Voir plus (${rows.length - HISTORY_PREVIEW})`}
                </button>
              )}
            </Block>

            <Block title="Utilisation" desc="Ce que vous avez consommé sur votre plan actuel.">
              {limits ? (
                <div className="border-t border-gray-200 dark:border-gray-800">
                  <UsageRow label="Billets" used={limits.ticketsUsed} max={limits.maxTickets} />
                  <UsageRow label="Badges" used={limits.badgesUsed} max={limits.maxBadges} />
                  <UsageRow label="Événements" used={eventCount ?? 0} max={limits.maxEvents} />
                </div>
              ) : (
                <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              )}
            </Block>

            <Block id="plans" title="Changer de plan" desc="Le nouveau plan s’applique immédiatement.">
              {loadingPlans || loadingSub ? (
                <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              ) : !plans || plans.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun plan disponible pour l’instant.</p>
              ) : (
                <div className="border-t border-gray-200 dark:border-gray-800">
                  {plans.filter(p => p.isActive !== false).map(plan => {
                    const current = subscription?.planId === plan.id;
                    const pending = subscribe.isPending && subscribe.variables === plan.id;
                    return (
                      <div
                        key={plan.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-b border-gray-200 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_130px_120px] dark:border-gray-800"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-black dark:text-white">{plan.name}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{planSummary(plan)}</p>
                        </div>
                        <span className="hidden text-right text-sm text-black sm:block dark:text-white">{planPrice(plan.price)}</span>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-gray-500 sm:hidden">{planPrice(plan.price)}</span>
                          {current ? (
                            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black px-4 text-sm font-medium text-white dark:bg-white dark:text-black">
                              <Check className="h-3.5 w-3.5" /> Actuel
                            </span>
                          ) : (
                            <button type="button" onClick={() => setToPlan(plan)} disabled={subscribe.isPending} className={outlineButton}>
                              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              Choisir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Block>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!toPlan}
        onClose={() => setToPlan(null)}
        onConfirm={() => { if (toPlan) subscribe.mutate(toPlan.id); setToPlan(null); }}
        title="Changer de plan"
        description={toPlan
          ? `Passer au plan « ${toPlan.name} » (${planPrice(toPlan.price)}) ? Il s’applique tout de suite, et vos compteurs de billets et de badges repartent de zéro.`
          : ''}
        confirmLabel="Changer de plan"
        variant="default"
        isLoading={subscribe.isPending}
      />
    </div>
  );
}
