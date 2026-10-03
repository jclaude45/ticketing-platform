'use client';

import { AlertCircle, Calendar, ChevronDown, Plus, RefreshCw, Search } from 'lucide-react';
import { ViewToggle, useViewMode } from '@/components/common/ViewToggle';
import Link from 'next/link';
import { useEvents } from '@/hooks/useEvents';
import { useEventsStore } from '@/store/events.store';
import { EventCard, EventListHeader, EventRow } from '@/components/events/EventCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { debounce } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'PUBLISHED', label: 'Publié' },
  { value: 'CANCELLED', label: 'Annulé' },
  { value: 'COMPLETED', label: 'Terminé' },
];

const fieldClass =
  'h-11 rounded-full border border-gray-200 bg-white px-4 text-sm text-black transition-colors focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-gray-700 dark:bg-gray-900 dark:text-white';

export default function EventsPage() {
  const { data, isLoading, isError, isFetching, refetch } = useEvents();
  // Icons or list, remembered on this browser
  const [view, chooseView] = useViewMode('zaya_events_view');
  const { filters, setFilters, currentPage, pageSize, setCurrentPage, setPageSize } = useEventsStore();

  const handleSearch = debounce((value: unknown) => {
    setFilters({ search: String(value) });
  }, 300);

  if (isLoading && !data) return <PageLoader text="Chargement des événements..." />;

  // If the fetch failed and we have no data, show an error state with retry
  if (isError && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <div>
          <p className="text-sm font-semibold text-gray-800">Impossible de charger les événements</p>
          <p className="text-xs text-gray-400 mt-1">Vérifiez votre connexion puis réessayez</p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-primary gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Événements"
        description={`${data?.total ?? 0} événement(s) au total`}
        actions={
          <div className="flex items-center gap-2">
            {isFetching && (
              <span title="Actualisation…">
                <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
              </span>
            )}
            <Link
              href="/dashboard/events/new"
              className="btn-primary gap-2"
            >
              <Plus className="h-4 w-4" />
              Créer un événement
            </Link>
          </div>
        }
      />

      {/* Filters + view */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            defaultValue={filters.search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Rechercher un événement…"
            className={cn(fieldClass, 'w-full pl-10 placeholder:text-gray-400')}
          />
        </div>
        <div className="relative">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value })}
            className={cn(fieldClass, 'appearance-none pr-10')}
            aria-label="Statut"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        </div>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ dateFrom: e.target.value })}
          className={fieldClass}
          aria-label="À partir du"
        />

        <ViewToggle value={view} onChange={chooseView} className="ml-auto" />
      </div>

      {/* Grid */}
      {data?.data && data.data.length > 0 ? (
        <>
          {view === 'grid' ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {data.data.map((event) => <EventCard key={event.id} event={event} />)}
            </div>
          ) : (
            <div>
              <EventListHeader />
              {data.data.map((event) => <EventRow key={event.id} event={event} />)}
            </div>
          )}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Affichage {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, data.total)} sur {data.total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === data.totalPages}
                  className="px-4 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Calendar className="h-8 w-8" />}
          title="Aucun événement"
          description="Créez votre premier événement pour gérer les billets et le contrôle d'accès."
          action={
            <Link href="/dashboard/events/new" className="btn-primary gap-2">
              <Plus className="h-4 w-4" />
              Créer un événement
            </Link>
          }
        />
      )}
    </div>
  );
}
