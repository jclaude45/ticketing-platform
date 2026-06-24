'use client';

import React from 'react';
import { useGlobalAnalytics } from '@/hooks/useAnalytics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '@/lib/api';
import { StatsCard } from '@/components/analytics/StatsCard';
import { ScanChart } from '@/components/analytics/ScanChart';
import { OccupancyChart } from '@/components/analytics/OccupancyChart';
import { RealtimeFeed } from '@/components/analytics/RealtimeFeed';
import {
  Calendar, Ticket, BarChart3, TrendingUp,
  Activity, RefreshCw, ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function AnalyticsPage() {
  const { data: analytics, isLoading, refetch, isRefetching } = useGlobalAnalytics();
  const { data: eventsData } = useQuery<any[]>({
    queryKey: ['events', 'published', 10],
    queryFn: async () => {
      const res = await eventsApi.list({ status: 'PUBLISHED' as any, limit: 10 });
      // TransformInterceptor wraps as { data: { data: Event[], meta: {...} } }
      const payload = (res.data as any)?.data as { data: any[] } | undefined;
      return payload?.data ?? [];
    },
    staleTime: 0,
  });
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const handleRefresh = async () => {
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    setLastRefresh(new Date());
  };

  const stats: Array<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: 'indigo' | 'violet' | 'emerald' | 'amber';
    suffix: string;
  }> = [
    {
      title: 'Événements actifs',
      value: analytics?.activeEvents ?? 0,
      icon: <Calendar className="h-5 w-5" />,
      color: 'indigo',
      suffix: `/ ${analytics?.totalEvents ?? 0} total`,
    },
    {
      title: 'Billets générés',
      value: analytics?.totalTickets ?? 0,
      icon: <Ticket className="h-5 w-5" />,
      color: 'violet',
      suffix: 'billets',
    },
    {
      title: 'Scans effectués',
      value: analytics?.totalScans ?? 0,
      icon: <Activity className="h-5 w-5" />,
      color: 'emerald',
      suffix: 'validations',
    },
    {
      title: 'Taux d\'occupation moyen',
      value: analytics?.averageOccupancy
        ? `${Math.round(analytics.averageOccupancy)}%`
        : '—',
      icon: <BarChart3 className="h-5 w-5" />,
      color: 'amber',
      suffix: 'occupation',
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics globales</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vue d'ensemble de toute votre activité billetterie
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            Mis à jour : {format(lastRefresh, 'HH:mm:ss', { locale: fr })}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2',
              'text-sm text-gray-600 shadow-sm hover:bg-gray-50 transition-all',
            )}
          >
            <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
            Actualiser
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <StatsCard key={s.title} {...s} isLoading={isLoading} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Évolution temporelle — 2/3 */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Événements par mois</h2>
              <p className="text-xs text-gray-500">Création d'événements sur 12 mois</p>
            </div>
            <TrendingUp className="h-5 w-5 text-indigo-500" />
          </div>
          <ScanChart
            data={analytics?.eventsByMonth?.map((m) => ({
              hour: m.month,
              count: m.count,
            })) ?? []}
            isLoading={isLoading}
            label="Événements"
            color="#6366f1"
          />
        </div>

        {/* Top events par billets — 1/3 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Top événements</h2>
              <p className="text-xs text-gray-500">Par nombre de billets</p>
            </div>
            <BarChart3 className="h-5 w-5 text-violet-500" />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gray-200" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 rounded bg-gray-200 w-3/4" />
                    <div className="h-2 rounded bg-gray-100 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !analytics?.ticketsByEvent?.length ? (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              Aucune donnée disponible
            </div>
          ) : (
            <ol className="space-y-3">
              {analytics.ticketsByEvent.slice(0, 6).map((ev, i) => {
                const max = analytics.ticketsByEvent[0]?.count ?? 1;
                const pct = Math.round((ev.count / max) * 100);
                return (
                  <li key={ev.eventId} className="group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-400 w-4">#{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                        {ev.name}
                      </span>
                      <span className="text-xs font-semibold text-gray-600">
                        {ev.count.toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {/* Bottom row: occupation + real-time feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Taux d'occupation</h2>
              <p className="text-xs text-gray-500">Événements publiés</p>
            </div>
          </div>
          <OccupancyChart
            scanned={analytics?.totalScans ?? 0}
            total={analytics?.totalTickets ?? 0}
            isLoading={isLoading}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Flux en temps réel</h2>
              <p className="text-xs text-gray-500">Derniers scans sur tous les événements</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <RealtimeFeed eventId="global" />
        </div>
      </div>

      {/* Events table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Événements actifs</h2>
          <a
            href="/dashboard/events"
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Voir tout <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Événement', 'Date', 'Billets générés', 'Capacité', 'Remplissage', 'Statut'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-gray-200" style={{ width: j === 0 ? 160 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !eventsData?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    Aucun événement publié
                  </td>
                </tr>
              ) : (
                eventsData.map((ev: any) => {
                  const tickets = ev._count?.tickets ?? 0;
                  const taux = ev.totalCapacity > 0
                    ? Math.min(100, Math.round((tickets / ev.totalCapacity) * 100))
                    : 0;
                  return (
                    <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{ev.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {ev.startDate ? format(new Date(ev.startDate), 'dd MMM yyyy', { locale: fr }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{tickets.toLocaleString('fr-FR')}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{ev.totalCapacity?.toLocaleString('fr-FR') ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-gray-100">
                            <div
                              className={cn('h-1.5 rounded-full', taux > 80 ? 'bg-emerald-500' : taux > 50 ? 'bg-amber-500' : 'bg-red-400')}
                              style={{ width: `${taux}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600">{taux}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                          ev.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' :
                          ev.status === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                        )}>
                          {ev.status === 'PUBLISHED' ? 'Publié' : ev.status === 'CANCELLED' ? 'Annulé' : ev.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
