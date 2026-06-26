'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api';
import {
  History, Search, ChevronLeft, ChevronRight,
  Ticket, Sparkles, Ban, ScanLine, RefreshCw,
  Calendar, CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Only ticket-related actions are relevant for an organizer
const TICKET_ACTIONS = ['ticket.generate', 'ticket.cancel', 'ticket.scan'];

const ACTION_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  chip: string;
}> = {
  'ticket.generate': {
    label: 'Génération',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  },
  'ticket.cancel': {
    label: 'Annulation',
    icon: <Ban className="h-3.5 w-3.5" />,
    chip: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  },
  'ticket.scan': {
    label: 'Scan / Validation',
    icon: <ScanLine className="h-3.5 w-3.5" />,
    chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
};

interface LogEntry {
  id: string;
  action: string;
  entity?: string;
  entityId?: string;
  newValues?: any;
  oldValues?: any;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string };
}

export default function HistoriquePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const limit = 30;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['historique', page, actionFilter],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit };
      if (actionFilter !== 'ALL') params.action = actionFilter;
      else params.action = 'ticket'; // filter to ticket.* actions only
      const res = await apiClient.get('/audit/logs', { params });
      const payload = (res.data as any)?.data ?? res.data;
      return {
        data: (payload?.data ?? []) as LogEntry[],
        meta: payload?.meta ?? { total: 0, totalPages: 1, page: 1 },
      };
    },
    staleTime: 0,
  });

  const logs = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, totalPages: 1, page: 1 };

  // Client-side search on entityId / newValues serialNumber
  const filtered = search.trim()
    ? logs.filter((l) => {
        const serial: string = l.newValues?.serialNumber ?? l.newValues?.tickets?.[0]?.serialNumber ?? '';
        const event: string = l.newValues?.eventName ?? l.newValues?.event ?? '';
        const q = search.toLowerCase();
        return serial.toLowerCase().includes(q) || event.toLowerCase().includes(q) || (l.entityId ?? '').includes(q);
      })
    : logs;

  // Stats from current page
  const generated = logs.filter((l) => l.action === 'ticket.generate').length;
  const cancelled  = logs.filter((l) => l.action === 'ticket.cancel').length;
  const scanned    = logs.filter((l) => l.action === 'ticket.scan').length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <History className="h-6 w-6 text-indigo-500" />
            Historique des billets
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Toutes les actions effectuées sur vos billets — générations, annulations, validations
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50 transition-all"
        >
          <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
          Actualiser
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Générés', value: generated, icon: <Sparkles className="h-5 w-5 text-indigo-500" />, bg: 'bg-indigo-50' },
          { label: 'Annulés',  value: cancelled,  icon: <Ban className="h-5 w-5 text-red-500" />,     bg: 'bg-red-50' },
          { label: 'Scannés',  value: scanned,    icon: <ScanLine className="h-5 w-5 text-emerald-500" />, bg: 'bg-emerald-50' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex items-center gap-4">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', s.bg)}>
              {s.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{s.label} (page actuelle)</p>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher numéro de série, événement…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['ALL', 'ticket.generate', 'ticket.cancel', 'ticket.scan'] as const).map((a) => (
            <button
              key={a}
              onClick={() => { setActionFilter(a); setPage(1); }}
              className={cn(
                'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all',
                actionFilter === a
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {a === 'ALL' ? 'Tout' : ACTION_CONFIG[a]?.label ?? a}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Action', 'Billet / Événement', 'Détails', 'Date'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[80, 160, 120, 100].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-gray-200" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <History className="h-10 w-10 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">Aucun historique trouvé</p>
                      <p className="text-xs text-gray-400">Les actions sur vos billets apparaîtront ici</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const cfg = ACTION_CONFIG[log.action];
                  const serial: string =
                    log.newValues?.serialNumber ??
                    log.newValues?.tickets?.[0]?.serialNumber ??
                    log.entityId ?? '—';
                  const eventName: string =
                    log.newValues?.eventName ?? log.newValues?.event ?? '—';
                  const count: number | undefined = log.newValues?.count;
                  const status: string | undefined = log.newValues?.status ?? log.newValues?.result;

                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      {/* Action badge */}
                      <td className="px-4 py-3">
                        {cfg ? (
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', cfg.chip)}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">{log.action}</span>
                        )}
                      </td>

                      {/* Billet / Événement */}
                      <td className="px-4 py-3">
                        <div>
                          {serial !== '—' && (
                            <code className="font-mono text-xs font-semibold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">
                              {serial}
                            </code>
                          )}
                          {count && count > 1 && (
                            <span className="ml-2 text-xs text-indigo-600 font-medium">{count} billets</span>
                          )}
                          {eventName !== '—' && (
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {eventName}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Détails */}
                      <td className="px-4 py-3">
                        {status && (
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            status === 'VALID' || status === 'valid' ? 'text-emerald-600' : 'text-red-500',
                          )}>
                            {status === 'VALID' || status === 'valid'
                              ? <CheckCircle2 className="h-3 w-3" />
                              : <XCircle className="h-3 w-3" />}
                            {status}
                          </span>
                        )}
                        {!status && <span className="text-xs text-gray-400">—</span>}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-gray-700">
                            {format(new Date(log.createdAt), 'dd MMM yyyy', { locale: fr })}
                          </p>
                          <p className="text-xs text-gray-400">
                            {format(new Date(log.createdAt), 'HH:mm:ss')}
                          </p>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-4 py-3">
            <p className="text-xs text-gray-500">
              Page <span className="font-semibold text-gray-800">{meta.page}</span> sur{' '}
              <span className="font-semibold text-gray-800">{meta.totalPages}</span>
              {' · '}
              <span className="font-semibold text-gray-800">{meta.total.toLocaleString('fr-FR')}</span> entrées
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={cn('rounded-lg border border-gray-200 p-1.5 transition-all', page <= 1 ? 'cursor-not-allowed opacity-40' : 'hover:bg-white')}
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className={cn('rounded-lg border border-gray-200 p-1.5 transition-all', page >= meta.totalPages ? 'cursor-not-allowed opacity-40' : 'hover:bg-white')}
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
