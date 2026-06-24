'use client';

import { useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  RefreshCw,
  Ticket,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Square,
  CheckSquare,
  Plus,
  Eye,
  Ban,
  Printer,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { printPDFBlob } from '@/lib/print';
import toast from 'react-hot-toast';
import { ExportOptions } from '@/components/tickets/ExportOptions';
import { PrintButton } from '@/components/tickets/PrintButton';

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = 'VALID' | 'USED' | 'CANCELLED' | 'PENDING' | 'FRAUDULENT';

interface TicketRow {
  id: string;
  serialNumber: string;
  status: TicketStatus;
  holderName: string | null;
  holderEmail: string | null;
  price: number;
  currency: string;
  purchasedAt: string | null;
  usedAt: string | null;
  template: { name: string; color: string };
}

interface PaginatedTickets {
  data: TicketRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EventSummary {
  id: string;
  name: string;
  startDate: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; icon: React.ReactNode; chip: string }
> = {
  VALID: {
    label: 'Valide',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  USED: {
    label: 'Utilisé',
    icon: <Ticket className="h-3.5 w-3.5" />,
    chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  },
  CANCELLED: {
    label: 'Annulé',
    icon: <XCircle className="h-3.5 w-3.5" />,
    chip: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  },
  PENDING: {
    label: 'En attente',
    icon: <Clock className="h-3.5 w-3.5" />,
    chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  FRAUDULENT: {
    label: 'Frauduleux',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    chip: 'bg-rose-50 text-rose-800 ring-1 ring-rose-300',
  },
};

const PAGE_SIZES = [20, 50, 100, 200];

// ─── Component ───────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  // ── Filters & pagination ─────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // ── Selection ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Fetch event info ─────────────────────────────────────────────────────
  const { data: event } = useQuery<EventSummary>({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/events/${eventId}`);
      return data.data ?? data;
    },
  });

  // ── Fetch tickets ────────────────────────────────────────────────────────
  const {
    data: ticketsData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<PaginatedTickets>({
    queryKey: ['tickets', eventId, page, limit, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const { data } = await apiClient.get(
        `/events/${eventId}/tickets?${params.toString()}`,
      );
      // Backend wraps: { success, statusCode, data: { data: tickets[], meta: {...} }, timestamp }
      const payload = (data.data ?? data) as { data: TicketRow[]; meta: { total: number; page: number; limit: number; totalPages: number } };
      return {
        data: payload.data,
        total: payload.meta.total,
        page: payload.meta.page,
        limit: payload.meta.limit,
        totalPages: payload.meta.totalPages,
      } as PaginatedTickets;
    },
    // Always refetch on mount so tickets are always fresh when navigating back.
    staleTime: 0,
    refetchOnMount: 'always',
    placeholderData: (prev) => prev,
  });

  const tickets = ticketsData?.data ?? [];
  const total = ticketsData?.total ?? 0;
  const totalPages = ticketsData?.totalPages ?? 1;

  // ── Selection helpers ────────────────────────────────────────────────────
  const pageIds = useMemo(() => tickets.map((t) => t.id), [tickets]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allPageSelected, pageIds]);

  const clearSelection = () => setSelected(new Set());

  // ── Cancel ticket ────────────────────────────────────────────────────────
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (ticket: TicketRow) => {
    if (!confirm(`Annuler le billet ${ticket.serialNumber} ? Cette action est irréversible.`)) return;
    setCancellingId(ticket.id);
    try {
      await apiClient.post(`/events/${eventId}/tickets/${ticket.id}/cancel`);
      toast.success('Billet annulé');
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Impossible d'annuler ce billet");
    } finally {
      setCancellingId(null);
    }
  };

  // ── Print single ticket ──────────────────────────────────────────────────
  const [printingId, setPrintingId] = useState<string | null>(null);

  const handlePrintTicket = async (ticketId: string) => {
    setPrintingId(ticketId);
    try {
      const res = await apiClient.request<ArrayBuffer>({
        method: 'GET',
        url: `/events/${eventId}/tickets/${ticketId}/export/pdf`,
        responseType: 'arraybuffer',
      });
      printPDFBlob(new Blob([res.data], { type: 'application/pdf' }));
    } catch {
      toast.error("Erreur lors de la préparation de l'impression");
    } finally {
      setPrintingId(null);
    }
  };

  // ── Pagination ───────────────────────────────────────────────────────────
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilter = (s: TicketStatus | 'ALL') => {
    setStatusFilter(s);
    setPage(1);
    clearSelection();
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <button
              onClick={() => router.back()}
              className="hover:text-gray-800 transition-colors"
            >
              ← Retour
            </button>
            <span>/</span>
            <span className="font-medium text-gray-800 truncate max-w-xs">
              {event?.name ?? '…'}
            </span>
            <span>/</span>
            <span>Billets</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Gestion des billets
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total > 0 ? (
              <>
                <span className="font-semibold text-gray-700">{total.toLocaleString('fr-FR')}</span>
                {' '}billet{total > 1 ? 's' : ''} au total
              </>
            ) : (
              'Aucun billet pour cet événement'
            )}
          </p>
        </div>

        {/* Actions right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2',
              'text-sm text-gray-600 shadow-sm hover:bg-gray-50 transition-all',
            )}
          >
            <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
            Actualiser
          </button>

          <ExportOptions
            eventId={eventId}
            selectedTicketIds={Array.from(selected)}
            totalTickets={total}
          />

          <button
            onClick={() => router.push(`/dashboard/events/${eventId}/tickets/generate`)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2',
              'text-sm font-semibold text-white shadow-sm',
              'hover:bg-indigo-700 active:bg-indigo-800 transition-colors',
            )}
          >
            <Plus className="h-4 w-4" />
            Générer des billets
          </button>
        </div>
      </div>

      {/* ── Filters bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un billet, numéro, titulaire…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className={cn(
              'w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4',
              'text-sm text-gray-900 placeholder-gray-400',
              'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
            )}
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
          {(['ALL', 'VALID', 'USED', 'PENDING', 'CANCELLED', 'FRAUDULENT'] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => handleStatusFilter(s)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all',
                  statusFilter === s
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {s === 'ALL' ? 'Tous' : (STATUS_CONFIG[s]?.label ?? s)}
              </button>
            ),
          )}
        </div>

        {/* Page size selector */}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          <span className="text-xs text-gray-400">Lignes&nbsp;:</span>
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className={cn(
              'rounded-md border border-gray-200 bg-white px-2 py-1',
              'text-xs text-gray-700 focus:border-indigo-400 focus:outline-none',
            )}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Selection banner ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              'flex items-center gap-3 rounded-xl border border-indigo-200',
              'bg-indigo-50 px-4 py-3 shadow-sm',
            )}
          >
            <CheckSquare className="h-5 w-5 text-indigo-600 flex-shrink-0" />
            <span className="flex-1 text-sm font-medium text-indigo-800">
              {selected.size} billet{selected.size > 1 ? 's' : ''} sélectionné
              {selected.size > 1 ? 's' : ''}
            </span>
            <ExportOptions
              eventId={eventId}
              selectedTicketIds={Array.from(selected)}
              totalTickets={total}
              className="flex-shrink-0"
            />
            <PrintButton
              eventId={eventId}
              ticketIds={Array.from(selected)}
              label={`Imprimer (${selected.size})`}
              variant="ghost"
              className="flex-shrink-0 text-indigo-700 hover:bg-indigo-100"
            />
            <button
              onClick={clearSelection}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-900 transition-colors"
            >
              Désélectionner
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tickets table ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            {/* Table head */}
            <thead>
              <tr className="bg-gray-50">
                {/* Select-all checkbox */}
                <th className="w-10 px-4 py-3">
                  <button
                    onClick={togglePage}
                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                    title={allPageSelected ? 'Désélectionner la page' : 'Sélectionner la page'}
                  >
                    {allPageSelected ? (
                      <CheckSquare className="h-4 w-4 text-indigo-600" />
                    ) : somePageSelected ? (
                      <Square className="h-4 w-4 text-indigo-400" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  N° de série
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Titulaire
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Statut
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Prix
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Date d'achat
                </th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>

            {/* Table body */}
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                // Skeleton rows
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3">
                      <div className="h-4 w-4 rounded bg-gray-200" />
                    </td>
                    {[120, 80, 100, 70, 60, 70, 80].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div
                          className="h-4 rounded bg-gray-200"
                          style={{ width: w }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Ticket className="h-10 w-10 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">
                        Aucun billet trouvé
                      </p>
                      <p className="text-xs text-gray-400">
                        {search || statusFilter !== 'ALL'
                          ? 'Essayez de modifier vos filtres'
                          : 'Générez des billets pour cet événement'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const statusCfg = STATUS_CONFIG[ticket.status];
                  const isChecked = selected.has(ticket.id);

                  return (
                    <motion.tr
                      key={ticket.id}
                      layout
                      className={cn(
                        'group transition-colors',
                        isChecked ? 'bg-indigo-50/60' : 'hover:bg-gray-50/70',
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleOne(ticket.id)}
                          className="text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-indigo-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* Serial number */}
                      <td className="px-4 py-3">
                        <code className="font-mono text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                          {ticket.serialNumber}
                        </code>
                      </td>

                      {/* Template type with color dot */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: ticket.template?.color ?? '#6366f1' }}
                          />
                          <span className="text-sm text-gray-700 truncate max-w-[120px]">
                            {ticket.template?.name ?? '—'}
                          </span>
                        </div>
                      </td>

                      {/* Holder */}
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-gray-800 truncate max-w-[140px]">
                            {ticket.holderName ?? (
                              <span className="text-gray-400 italic">Sans nom</span>
                            )}
                          </p>
                          {ticket.holderEmail && (
                            <p className="text-xs text-gray-400 truncate max-w-[140px]">
                              {ticket.holderEmail}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                            statusCfg?.chip ?? 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {statusCfg?.icon}
                          {statusCfg?.label ?? ticket.status}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-gray-800">
                          {Number(ticket.price ?? 0).toFixed(2)}{' '}
                          <span className="text-xs text-gray-400">
                            {ticket.currency}
                          </span>
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">
                          {ticket.purchasedAt
                            ? format(new Date(ticket.purchasedAt), 'dd MMM yyyy', { locale: fr })
                            : '—'}
                        </span>
                      </td>

                      {/* Row actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() =>
                              router.push(
                                `/dashboard/events/${eventId}/tickets/${ticket.id}`,
                              )
                            }
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                            title="Voir le billet"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => handlePrintTicket(ticket.id)}
                            disabled={printingId === ticket.id}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all disabled:opacity-40"
                            title="Imprimer le billet"
                          >
                            {printingId === ticket.id
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Printer className="h-3.5 w-3.5" />}
                          </button>

                          {/* Individual PDF download */}
                          <button
                            onClick={async () => {
                              try {
                                const res = await apiClient.request<ArrayBuffer>({
                                  method: 'GET',
                                  url: `/events/${eventId}/tickets/${ticket.id}/export/pdf`,
                                  responseType: 'arraybuffer',
                                });
                                const blob = new Blob([res.data], { type: 'application/pdf' });
                                const url = URL.createObjectURL(blob);
                                const a = Object.assign(document.createElement('a'), {
                                  href: url,
                                  download: `ticket-${ticket.serialNumber}.pdf`,
                                });
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              } catch {
                                alert('Erreur lors du téléchargement du PDF');
                              }
                            }}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                            title="Télécharger PDF"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                          </button>

                          {ticket.status !== 'CANCELLED' && ticket.status !== 'USED' && (
                            <button
                              onClick={() => handleCancel(ticket)}
                              disabled={cancellingId === ticket.id}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-40"
                              title="Annuler le billet"
                            >
                              {cancellingId === ticket.id
                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                : <Ban className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer ─────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-4 py-3">
            <p className="text-xs text-gray-500">
              Page{' '}
              <span className="font-semibold text-gray-800">{page}</span>
              {' '}sur{' '}
              <span className="font-semibold text-gray-800">{totalPages}</span>
              {' '}·{' '}
              <span className="font-semibold text-gray-800">{total.toLocaleString('fr-FR')}</span>{' '}
              résultats
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={cn(
                  'rounded-lg border border-gray-200 p-1.5 transition-all',
                  page <= 1
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:border-indigo-300 hover:bg-white',
                )}
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>

              {/* Page number pills */}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const p = totalPages <= 7
                  ? i + 1
                  : page <= 4
                  ? i + 1
                  : page >= totalPages - 3
                  ? totalPages - 6 + i
                  : page - 3 + i;

                if (p < 1 || p > totalPages) return null;

                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'h-8 w-8 rounded-lg text-xs font-medium transition-all',
                      p === page
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'border border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-white',
                    )}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={cn(
                  'rounded-lg border border-gray-200 p-1.5 transition-all',
                  page >= totalPages
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:border-indigo-300 hover:bg-white',
                )}
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
