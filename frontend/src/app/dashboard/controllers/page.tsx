'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useControllers } from '@/hooks/useControllers';
import { ControllerList } from '@/components/controllers/ControllerList';
import { Shield, Plus, Search, RefreshCw, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

const STATUS_FILTERS = [
  { value: 'all',      label: 'Tous' },
  { value: 'active',   label: 'Actifs' },
  { value: 'inactive', label: 'Inactifs' },
] as const;

export default function ControllersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage]           = useState(1);

  const filters = {
    page,
    limit: 30,
    ...(search ? { search } : {}),
    ...(status !== 'all' ? { isActive: status === 'active' } : {}),
  };

  const { data, isLoading, refetch, isRefetching } = useControllers(filters as any);

  const controllers = (data as any)?.data ?? [];
  const total       = (data as any)?.meta?.total ?? 0;
  const totalPages  = (data as any)?.meta?.totalPages ?? 1;

  const activeCount   = controllers.filter((c: any) => c.isActive).length;
  const inactiveCount = controllers.filter((c: any) => !c.isActive).length;

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Contrôleurs</h1>
          </div>
          <p className="text-sm text-gray-500">
            Agents de contrôle autorisés à scanner les billets sur le terrain
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ['controllers'] }); }}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50 transition-all"
          >
            <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
            Actualiser
          </button>
          <button
            onClick={() => router.push('/dashboard/controllers/new')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nouveau contrôleur
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total',    value: total,         color: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
          { label: 'Actifs',   value: activeCount,   color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
          { label: 'Inactifs', value: inactiveCount, color: 'border-gray-200 bg-gray-50 text-gray-600' },
        ].map((s) => (
          <div key={s.label} className={cn('rounded-xl border px-4 py-3', s.color)}>
            <p className="text-xs font-medium opacity-70">{s.label}</p>
            <p className="text-2xl font-bold mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatus(f.value); setPage(1); }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                status === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ControllerList controllers={controllers} isLoading={isLoading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Précédent
          </button>
          <span className="text-sm text-gray-500">Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
