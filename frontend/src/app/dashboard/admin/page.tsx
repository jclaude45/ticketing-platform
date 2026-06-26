'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, subscriptionApi } from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Users, Ticket, Calendar, ScanLine, Search, Shield,
  CheckCircle2, XCircle, CreditCard, Zap, AlertTriangle,
  ChevronRight, BarChart3, Activity, TrendingUp,
  UserCheck, UserX, RefreshCw, Eye, Award,
  Clock, MapPin, Hash,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ─── utils ───────────────────────────────────────────────────────────────────

const N = (n: number) => n?.toLocaleString('fr-FR') ?? '0';

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n ?? 0);
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PUBLISHED: { label: 'Publié',   color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  DRAFT:     { label: 'Brouillon', color: 'bg-amber-100  text-amber-700  ring-amber-200'  },
  CANCELLED: { label: 'Annulé',   color: 'bg-red-100    text-red-600    ring-red-200'    },
  COMPLETED: { label: 'Terminé',  color: 'bg-gray-100   text-gray-600   ring-gray-200'   },
};

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4 shadow-sm">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{typeof value === 'number' ? fmt(value) : value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Organizer card (left panel) ─────────────────────────────────────────────

function OrgCard({ org, selected, onClick }: { org: any; selected: boolean; onClick: () => void }) {
  const initials = `${org.firstName?.[0] ?? ''}${org.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-800',
        selected
          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
      )}
    >
      <div className={cn(
        'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
        org.isActive ? 'bg-gradient-to-br from-indigo-400 to-purple-500' : 'bg-gray-400',
      )}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate', selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white')}>
          {org.firstName} {org.lastName}
        </p>
        <p className="text-xs text-gray-400 truncate">{org.email}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-xs font-medium text-gray-500">{N(org.eventsCount)} év.</span>
        {!org.isActive && <span className="text-xs text-red-500">Suspendu</span>}
      </div>
    </button>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: any }) {
  const s = STATUS_LABELS[ev.status] ?? STATUS_LABELS.DRAFT;
  const fill = ev._count?.tickets ?? 0;
  const capacity = ev.totalCapacity ?? 0;
  const pct = capacity > 0 ? Math.min(100, Math.round((fill / capacity) * 100)) : 0;

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
      {/* Date block */}
      <div className="flex-shrink-0 w-12 text-center">
        <p className="text-xs text-gray-400 uppercase">{format(new Date(ev.startDate), 'MMM', { locale: fr })}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{format(new Date(ev.startDate), 'd')}</p>
        <p className="text-xs text-gray-400">{format(new Date(ev.startDate), 'yyyy')}</p>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.name}</p>
          <span className={cn('text-xs px-2 py-0.5 rounded-full ring-1', s.color)}>{s.label}</span>
        </div>
        {ev.city && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <MapPin className="h-3 w-3" />{ev.city}
          </p>
        )}
        {/* Jauge de remplissage */}
        {capacity > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{N(fill)} / {N(capacity)}</span>
          </div>
        )}
      </div>

      {/* Right stats */}
      <div className="flex-shrink-0 text-right space-y-1">
        <div className="flex items-center gap-1 justify-end text-xs text-gray-500">
          <Ticket className="h-3 w-3" />{N(fill)} billets
        </div>
        {ev._count?.teamMembers != null && (
          <div className="flex items-center gap-1 justify-end text-xs text-gray-500">
            <Users className="h-3 w-3" />{N(ev._count.teamMembers)} équipe
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Organizer detail panel ───────────────────────────────────────────────────

function OrganizerDetail({ org, plans }: { org: any; plans: any[] }) {
  const qc = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin-org-detail', org.id],
    queryFn: () => adminApi.getOrganizerDetail(org.id).then(r => r.data.data),
  });

  const toggleActive = useMutation({
    mutationFn: () => org.isActive
      ? adminApi.deactivateOrganizer(org.id)
      : adminApi.activateOrganizer(org.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-organizers'] });
      qc.invalidateQueries({ queryKey: ['admin-org-detail', org.id] });
    },
  });

  const assignPlan = useMutation({
    mutationFn: (planId: string) => subscriptionApi.assignPlan(org.id, { planId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-organizers'] });
      qc.invalidateQueries({ queryKey: ['admin-org-detail', org.id] });
    },
  });

  const resetQuota = useMutation({
    mutationFn: () => subscriptionApi.resetQuota(org.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-org-detail', org.id] }),
  });

  const d = detail ?? org;
  const sub = d.subscription;
  const limits = sub
    ? { maxTickets: sub.plan.maxTickets, maxBadges: sub.plan.maxBadges, ticketsUsed: sub.ticketsUsed, badgesUsed: sub.badgesUsed }
    : { maxTickets: 200, maxBadges: 50, ticketsUsed: 0, badgesUsed: 0 };
  const initials = `${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header organisateur */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start gap-4">
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0',
            d.isActive ? 'bg-gradient-to-br from-indigo-400 to-purple-500' : 'bg-gray-400',
          )}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{d.firstName} {d.lastName}</h2>
            <p className="text-sm text-gray-500 truncate">{d.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={cn(
                'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ring-1',
                d.isActive
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-red-50 text-red-600 ring-red-200',
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', d.isActive ? 'bg-emerald-500' : 'bg-red-500')} />
                {d.isActive ? 'Actif' : 'Suspendu'}
              </span>
              {d.isEmailVerified
                ? <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">Email vérifié</span>
                : <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">Email non vérifié</span>
              }
            </div>
          </div>
          <button
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50',
              d.isActive
                ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20',
            )}
          >
            {d.isActive ? <><UserX className="h-3.5 w-3.5" />Suspendre</> : <><UserCheck className="h-3.5 w-3.5" />Réactiver</>}
          </button>
        </div>

        {/* Infos rapides */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            Inscrit {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true, locale: fr })}
          </div>
          {d.lastLoginAt && (
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-gray-400" />
              Connecté {formatDistanceToNow(new Date(d.lastLoginAt), { addSuffix: true, locale: fr })}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
        {[
          { label: 'Événements', value: d.eventsCount ?? d._count?.events ?? 0, icon: <Calendar className="h-4 w-4 text-indigo-500" />, bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
          { label: 'Billets',    value: d.ticketsCount ?? d.ticketCount ?? 0,   icon: <Ticket   className="h-4 w-4 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/20' },
          { label: 'Scans',      value: d.scansCount  ?? d.scanCount  ?? 0,    icon: <ScanLine className="h-4 w-4 text-emerald-500"/>, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl p-3 text-center', s.bg)}>
            <div className="flex justify-center mb-1">{s.icon}</div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{N(s.value)}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Abonnement */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-indigo-500" />Abonnement
          </p>
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full">
            {sub?.plan?.name ?? 'Plan Gratuit'}
          </span>
        </div>

        {/* Changer le plan */}
        <div className="flex gap-2 mb-3">
          <select
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            defaultValue={sub?.planId ?? ''}
            onChange={e => e.target.value && assignPlan.mutate(e.target.value)}
          >
            <option value="">-- Changer le plan --</option>
            {plans.filter(p => p.isActive).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => resetQuota.mutate()}
            disabled={resetQuota.isPending}
            title="Réinitialiser les compteurs"
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Barres de quota */}
        <div className="space-y-2">
          {[
            { label: 'Billets', used: limits.ticketsUsed, max: limits.maxTickets, color: 'bg-indigo-500' },
            { label: 'Badges',  used: limits.badgesUsed,  max: limits.maxBadges,  color: 'bg-purple-500' },
          ].map(q => {
            const pct = q.max > 0 ? Math.min(100, (q.used / q.max) * 100) : 0;
            return (
              <div key={q.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{q.label} utilisés</span>
                  <span>{N(q.used)} / {q.max === -1 ? '∞' : N(q.max)}</span>
                </div>
                {q.max !== -1 && (
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', q.color, pct > 90 ? '!bg-red-500' : pct > 70 ? '!bg-amber-400' : '')}
                      style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Liste des événements */}
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Événements
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({d.eventsCount ?? d._count?.events ?? d.events?.length ?? 0})
            </span>
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
          </div>
        ) : !d.events?.length ? (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucun événement créé</p>
          </div>
        ) : (
          <div className="space-y-3">
            {d.events.map((ev: any) => <EventRow key={ev.id} ev={ev} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Platform overview
  const { data: overview, isLoading: ovLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => adminApi.getOverview().then(r => r.data.data),
  });

  // Organizers list
  const { data: organizers = [], isLoading: orgLoading } = useQuery({
    queryKey: ['admin-organizers'],
    queryFn: () => adminApi.getOrganizers().then(r => r.data.data),
    staleTime: 30_000,
  });

  // Plans for subscription assignment
  const { data: plans = [] } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => subscriptionApi.listPlans().then(r => r.data.data),
  });

  const filtered = useMemo(() => {
    if (!search) return organizers;
    const q = search.toLowerCase();
    return organizers.filter((o: any) =>
      `${o.firstName} ${o.lastName} ${o.email}`.toLowerCase().includes(q),
    );
  }, [organizers, search]);

  const selectedOrg = organizers.find((o: any) => o.id === selectedId) ?? null;
  const t = overview?.totals;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Administration Plateforme</h1>
          <p className="text-sm text-gray-500">Gestion globale · Lecture seule sur les événements</p>
        </div>
      </div>

      {/* ── KPI bar ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 flex-shrink-0">
        {ovLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))
        ) : (
          <>
            <KpiCard label="Organisateurs" value={t?.organizers ?? 0}
              sub={`${t?.activeOrganizers ?? 0} actifs`}
              icon={<Users className="h-5 w-5 text-indigo-600" />} color="bg-indigo-100 dark:bg-indigo-900/30" />
            <KpiCard label="Événements" value={t?.events ?? 0}
              sub={`${t?.activeEvents ?? 0} en cours`}
              icon={<Calendar className="h-5 w-5 text-purple-600" />} color="bg-purple-100 dark:bg-purple-900/30" />
            <KpiCard label="Billets générés" value={t?.tickets ?? 0}
              icon={<Ticket className="h-5 w-5 text-emerald-600" />} color="bg-emerald-100 dark:bg-emerald-900/30" />
            <KpiCard label="Validations" value={t?.scans ?? 0}
              sub={`${t?.badges ?? 0} badges`}
              icon={<ScanLine className="h-5 w-5 text-amber-600" />} color="bg-amber-100 dark:bg-amber-900/30" />
          </>
        )}
      </div>

      {/* ── Split panel ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-0">

        {/* ── Left: Organisateurs ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col overflow-hidden">
          {/* Search header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Organisateurs</span>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {filtered.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Rechercher par nom ou email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {orgLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Aucun organisateur trouvé</p>
              </div>
            ) : (
              filtered.map((org: any) => (
                <OrgCard
                  key={org.id}
                  org={org}
                  selected={selectedId === org.id}
                  onClick={() => setSelectedId(org.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: Detail ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          {selectedOrg ? (
            <OrganizerDetail org={selectedOrg} plans={plans} />
          ) : (
            /* Empty state + chart */
            <div className="flex flex-col h-full">
              {/* Prompt to select */}
              <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-indigo-400" />
                  Sélectionnez un organisateur pour voir ses événements et gérer son abonnement.
                </p>
              </div>

              {/* Chart */}
              <div className="p-6 flex-1">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 className="h-4 w-4 text-indigo-500" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Billets générés — 6 derniers mois</p>
                </div>
                {ovLoading ? (
                  <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={overview?.ticketsByMonth ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [N(v), 'Billets']} />
                      <Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* Recent registrations */}
                {(overview?.recentRegistrations?.length ?? 0) > 0 && (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-500" />Derniers inscrits
                    </p>
                    <div className="space-y-2">
                      {overview!.recentRegistrations.map((u: any) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                          onClick={() => setSelectedId(u.id)}
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {u.firstName?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.firstName} {u.lastName}</p>
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatDistanceToNow(new Date(u.createdAt), { locale: fr, addSuffix: true })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
