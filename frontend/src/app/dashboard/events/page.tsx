'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Calendar, Filter, Plus, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useEvents } from '@/hooks/useEvents';
import { useEventsStore } from '@/store/events.store';
import { EventCard } from '@/components/events/EventCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { debounce } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'COMPLETED', label: 'Completed' },
];

export default function EventsPage() {
  const { data, isLoading, isError, isFetching, refetch } = useEvents();
  const { filters, setFilters, currentPage, pageSize, setCurrentPage, setPageSize } = useEventsStore();

  const handleSearch = debounce((value: unknown) => {
    setFilters({ search: String(value) });
  }, 300);

  if (isLoading && !data) return <PageLoader text="Loading events..." />;

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
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
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
        title="Events"
        description={`${data?.total ?? 0} events total`}
        actions={
          <div className="flex items-center gap-2">
            {isFetching && (
              <span title="Actualisation…">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
              </span>
            )}
            <Link
              href="/dashboard/events/new"
              className="btn-primary gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Event
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            defaultValue={filters.search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search events..."
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value })}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ dateFrom: e.target.value })}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>

      {/* Grid */}
      {data?.data && data.data.length > 0 ? (
        <>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.08 }}
          >
            {data.data.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </motion.div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === data.totalPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Calendar className="h-8 w-8" />}
          title="No events yet"
          description="Create your first event to start managing tickets and access control."
          action={
            <Link href="/dashboard/events/new" className="btn-primary gap-2">
              <Plus className="h-4 w-4" />
              Create Event
            </Link>
          }
        />
      )}
    </div>
  );
}
