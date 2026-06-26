'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { analyticsApi, eventsApi } from '@/lib/api';
import { StatsCard } from '@/components/analytics/StatsCard';
import { ScanChart } from '@/components/analytics/ScanChart';
import { OccupancyChart } from '@/components/analytics/OccupancyChart';
import { RealtimeFeed } from '@/components/analytics/RealtimeFeed';
import {
  ArrowLeft, Ticket, Users, Activity, BarChart3,
  RefreshCw, Trophy, Clock, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EventAnalyticsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await eventsApi.get(eventId);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const { data: analytics, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['analytics', 'event', eventId],
    queryFn: async () => {
      const res = await analyticsApi.getEventAnalytics(eventId);
      return (res.data as any)?.data ?? res.data;
    },
    refetchInterval: 30_000,
  });

  const occupancyPct = analytics?.occupancyRate
    ? Math.round(analytics.occupancyRate * 100)
    : 0;

  const remaining = (analytics?.totalTickets ?? 0) - (analytics?.scannedTickets ?? 0);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-1 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {event?.name ?? 'Événement'}
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Analytique de l'événement</h1>
          {event?.startDate && (
            <p className="text-sm text-gray-500 mt-0.5">
              {format(new Date(event.startDate), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
              {event.venue && ` · ${event.venue}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Temps réel
          </span>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50"
          >
            <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
            Actualiser
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatsCard
          title="Billets générés"
          value={analytics?.totalTickets ?? 0}
          icon={<Ticket className="h-5 w-5" />}
          color="indigo"
          isLoading={isLoading}
        />
        <StatsCard
          title="Billets scannés"
          value={analytics?.scannedTickets ?? 0}
          icon={<Activity className="h-5 w-5" />}
          color="emerald"
          suffix={`/ ${analytics?.totalTickets ?? 0}`}
          isLoading={isLoading}
        />
        <StatsCard
          title="Restants"
          value={remaining}
          icon={<TrendingUp className="h-5 w-5" />}
          color="amber"
          isLoading={isLoading}
        />
        <StatsCard
          title="Taux d'occupation"
          value={`${occupancyPct}%`}
          icon={<BarChart3 className="h-5 w-5" />}
          color={occupancyPct > 80 ? 'emerald' : occupancyPct > 50 ? 'amber' : 'violet'}
          isLoading={isLoading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Scan timeline — 2/3 */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Scans par heure</h2>
              <p className="text-xs text-gray-500">Affluence en temps réel</p>
            </div>
            <Clock className="h-5 w-5 text-indigo-400" />
          </div>
          <ScanChart
            data={analytics?.scansByHour ?? []}
            isLoading={isLoading}
            label="Scans"
            color="#6366f1"
          />
        </div>

        {/* Occupancy donut — 1/3 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Occupation</h2>
          </div>
          <OccupancyChart
            scanned={analytics?.scannedTickets ?? 0}
            total={analytics?.totalTickets ?? 0}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Controllers leaderboard */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Classement contrôleurs</h2>
              <p className="text-xs text-gray-500">Scans par agent</p>
            </div>
            <Trophy className="h-5 w-5 text-amber-500" />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 rounded bg-gray-200 w-1/2" />
                    <div className="h-2 rounded bg-gray-100 w-full" />
                  </div>
                  <div className="h-4 w-10 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : !analytics?.scansByController?.length ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              <Users className="h-8 w-8 text-gray-200 mr-2" /> Aucun scan encore enregistré
            </div>
          ) : (
            <ol className="space-y-3">
              {analytics.scansByController
                .sort((a: any, b: any) => b.count - a.count)
                .slice(0, 6)
                .map((ctrl: any, i: number) => {
                  const maxCount = analytics.scansByController[0]?.count ?? 1;
                  const pct = Math.round((ctrl.count / maxCount) * 100);
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <li key={ctrl.controllerId} className="flex items-center gap-3">
                      <span className="text-base w-6 text-center flex-shrink-0">
                        {medals[i] ?? <span className="text-xs text-gray-400 font-bold">#{i + 1}</span>}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate">{ctrl.name}</span>
                          <span className="text-xs font-semibold text-gray-600 ml-2 flex-shrink-0">
                            {ctrl.count.toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100">
                          <div
                            className={cn(
                              'h-1.5 rounded-full transition-all duration-700',
                              i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-gray-400' : 'bg-orange-400',
                              i > 2 && 'bg-indigo-400',
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ol>
          )}
        </div>

        {/* Real-time feed */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Flux en direct</h2>
              <p className="text-xs text-gray-500">Validations en temps réel</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <RealtimeFeed eventId={eventId} />
        </div>
      </div>
    </div>
  );
}
