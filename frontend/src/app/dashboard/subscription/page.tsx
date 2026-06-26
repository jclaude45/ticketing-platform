'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Crown,
  Check,
  X,
  Zap,
  Ticket,
  Calendar,
  Infinity as LucideInfinity,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  AlertCircle,
  Mail,
} from 'lucide-react';
import { subscriptionApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { SubscriptionPlan } from '@/types';

function QuotaBar({
  label,
  used,
  max,
  icon,
}: {
  label: string;
  used: number;
  max: number;
  icon: React.ReactNode;
}) {
  if (max === -1) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        {icon}
        <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <div className="ml-auto flex items-center gap-1 text-indigo-500">
          <LucideInfinity size={16} />
          <span className="text-xs">Illimité</span>
        </div>
      </div>
    );
  }

  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <span className="ml-auto text-xs text-gray-500">
          {used} / {max}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={cn('h-1.5 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 animate-pulse space-y-3">
      <div className="h-5 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-4 w-1/3 bg-gray-100 dark:bg-gray-800 rounded" />
      <div className="space-y-2 mt-4">
        <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="h-3 w-4/5 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-800 rounded" />
      </div>
      <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded-xl mt-4" />
    </div>
  );
}

export default function SubscriptionPage() {
  const qc = useQueryClient();
  const [successPlanId, setSuccessPlanId] = useState<string | null>(null);

  const { data: mySubData, isLoading: loadingSub } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionApi.getMySubscription().then(r => r.data.data),
  });

  const { data: plans, isLoading: loadingPlans } = useQuery({
    queryKey: ['subscription-plans-public'],
    queryFn: () => subscriptionApi.listPlans().then(r => r.data.data),
  });

  const subscribePlanMut = useMutation({
    mutationFn: (planId: string) => subscriptionApi.subscribePlan(planId),
    onSuccess: (_data, planId) => {
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
      qc.invalidateQueries({ queryKey: ['subscription-plans-public'] });
      setSuccessPlanId(planId);
      setTimeout(() => setSuccessPlanId(null), 4000);
    },
  });

  const subscription = mySubData?.subscription ?? null;
  const limits = mySubData?.limits;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    EXPIRED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    SUSPENDED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 px-4">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors"
        >
          <ArrowLeft size={16} />
          Tableau de bord
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Crown size={24} className="text-amber-400" />
          Mon Abonnement
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gérez votre plan et consultez vos quotas d&apos;utilisation.
        </p>
      </div>

      {/* Current plan card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">
              Plan actuel
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {subscription?.plan.name ?? 'Gratuit'}
            </h2>
            {subscription && (
              <span
                className={cn(
                  'inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full',
                  statusColors[subscription.status] ?? statusColors.CANCELLED
                )}
              >
                {subscription.status}
              </span>
            )}
          </div>
          <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full">
            Plan actuel
          </span>
        </div>

        {limits && (
          <div className="space-y-3 pt-2">
            <QuotaBar
              label="Billets"
              used={limits.ticketsUsed}
              max={limits.maxTickets}
              icon={<Ticket size={15} className="text-gray-400 flex-shrink-0" />}
            />
            <QuotaBar
              label="Badges"
              used={limits.badgesUsed}
              max={limits.maxBadges}
              icon={<BadgeCheck size={15} className="text-gray-400 flex-shrink-0" />}
            />
            <QuotaBar
              label="Événements"
              used={0}
              max={limits.maxEvents}
              icon={<Calendar size={15} className="text-gray-400 flex-shrink-0" />}
            />
          </div>
        )}

        {limits && (
          <div className="flex flex-wrap gap-2 pt-1">
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium',
                limits.allowBulkExport
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {limits.allowBulkExport ? <Check size={12} /> : <X size={12} />}
              Export en lot
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium',
                limits.allowCommunication
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {limits.allowCommunication ? <Check size={12} /> : <X size={12} />}
              <Mail size={11} />
              Communication & Marketing
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium',
                !limits.showPoweredBy
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              <Zap size={12} />
              {limits.showPoweredBy ? '"Powered by" activé' : '"Powered by" masqué'}
            </span>
          </div>
        )}
      </div>

      {/* Available plans */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Plans disponibles
        </h3>

        {loadingPlans || loadingSub ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : !plans || plans.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun plan disponible.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {plans.map((plan: SubscriptionPlan) => {
              const isCurrent = subscription?.planId === plan.id;
              const isPending =
                subscribePlanMut.isPending && subscribePlanMut.variables === plan.id;
              const isSuccess = successPlanId === plan.id;
              const isError =
                subscribePlanMut.isError && subscribePlanMut.variables === plan.id;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'bg-white dark:bg-gray-900 rounded-2xl border p-5 flex flex-col gap-4 transition-shadow hover:shadow-md',
                    isCurrent
                      ? 'border-indigo-300 dark:border-indigo-700'
                      : 'border-gray-100 dark:border-gray-800'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-gray-900 dark:text-white">{plan.name}</h4>
                    <span className="flex-shrink-0 text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                      {plan.price === 0 ? 'Gratuit' : `€${plan.price}/mois`}
                    </span>
                  </div>

                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400 flex-1">
                    <li className="flex items-center gap-2">
                      <Ticket size={14} className="text-gray-400 flex-shrink-0" />
                      {plan.maxTickets === -1 ? 'Billets illimités' : `${plan.maxTickets} billets`}
                    </li>
                    <li className="flex items-center gap-2">
                      <BadgeCheck size={14} className="text-gray-400 flex-shrink-0" />
                      {plan.maxBadges === -1 ? 'Badges illimités' : `${plan.maxBadges} badges`}
                    </li>
                    <li className="flex items-center gap-2">
                      <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                      {plan.maxEvents === -1 ? 'Événements illimités' : `${plan.maxEvents} événements`}
                    </li>
                    <li className="flex items-center gap-2">
                      <span
                        className={cn(
                          plan.allowBulkExport ? 'text-green-500' : 'text-red-400'
                        )}
                      >
                        {plan.allowBulkExport ? <Check size={14} /> : <X size={14} />}
                      </span>
                      Export en lot {plan.allowBulkExport ? '✓' : '✗'}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className={cn(plan.allowCommunication ? 'text-green-500' : 'text-red-400')}>
                        {plan.allowCommunication ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <Mail size={13} className="text-gray-400 flex-shrink-0" />
                      Communication & Marketing
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap size={14} className="text-gray-400 flex-shrink-0" />
                      Powered by {plan.showPoweredBy ? 'activé' : 'désactivé'}
                    </li>
                  </ul>

                  {isSuccess && (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 size={14} />
                      Plan activé avec succès !
                    </div>
                  )}

                  {isError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                      <AlertCircle size={14} />
                      Une erreur est survenue. Réessayez.
                    </div>
                  )}

                  {isCurrent ? (
                    <div className="mt-auto">
                      <div className="w-full text-center rounded-xl py-2.5 text-sm font-semibold border border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-400">
                        Plan actuel
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto">
                      <button
                        disabled={isPending}
                        onClick={() => subscribePlanMut.mutate(plan.id)}
                        className={cn(
                          'w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2',
                          isPending
                            ? 'bg-indigo-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        )}
                      >
                        {isPending ? (
                          <>
                            <svg
                              className="animate-spin h-4 w-4 text-white"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v8H4z"
                              />
                            </svg>
                            Activation…
                          </>
                        ) : (
                          'Activer ce plan'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
