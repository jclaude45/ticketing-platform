'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import {
  Search, MapPin, Calendar, ChevronLeft, ChevronRight,
  Tag, Users, Loader2, Ticket, SlidersHorizontal, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PublicEvent {
  id: string;
  name: string;
  description?: string;
  venue: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  bannerUrl?: string;
  totalCapacity: number;
  minPrice: number | null;
  soldOut: boolean;
  ticketTemplates: { id: string; name: string; price: number; currency: string; availableCount: number }[];
  organizer: { firstName: string; lastName: string };
  _count: { tickets: number };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function priceLabel(event: PublicEvent) {
  if (event.soldOut) return { label: 'Complet', color: 'bg-red-100 text-red-700' };
  if (event.minPrice === null) return { label: 'Consulter', color: 'bg-gray-100 text-gray-600' };
  if (event.minPrice === 0) return { label: 'Gratuit', color: 'bg-emerald-100 text-emerald-700' };
  const cur = event.ticketTemplates[0]?.currency ?? 'EUR';
  return {
    label: `Dès ${event.minPrice.toFixed(2)} ${cur}`,
    color: 'bg-indigo-100 text-indigo-700',
  };
}

function EventCard({ event }: { event: PublicEvent }) {
  const badge = priceLabel(event);
  return (
    <Link href={`/billetterie/${event.id}`} className="group flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
      {/* Banner */}
      <div className="relative h-44 bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden flex-shrink-0">
        {event.bannerUrl ? (
          <img
            src={resolveMediaUrl(event.bannerUrl)}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <Ticket className="h-20 w-20 text-white" />
          </div>
        )}
        <span className={cn('absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full', badge.color)}>
          {badge.label}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {event.name}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
          {formatDate(event.startDate)}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
          <span className="truncate">{event.venue}, {event.city}</span>
        </div>

        {event.ticketTemplates.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {event.ticketTemplates.slice(0, 3).map(t => (
              <span key={t.id} className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded-full',
                t.availableCount === 0
                  ? 'bg-gray-100 text-gray-400 line-through'
                  : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300',
              )}>
                {t.name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Par {event.organizer.firstName} {event.organizer.lastName}
          </span>
          <span className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-full',
            event.soldOut
              ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
          )}>
            {event.soldOut ? 'Complet' : 'Voir →'}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function BilletteriePage() {
  const [search, setSearch]   = useState('');
  const [city, setCity]       = useState('');
  const [page, setPage]       = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const debouncedSearch = useCallback(
    (v: string) => { setSearch(v); setPage(1); },
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['public-events', page, search, city],
    queryFn: () => publicApi.listEvents({ page, limit: 12, search: search || undefined, city: city || undefined })
      .then(r => (r.data as any).data as { data: PublicEvent[]; meta: any }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const { data: citiesData } = useQuery({
    queryKey: ['public-cities'],
    queryFn: () => publicApi.getCities().then(r => ((r.data as any).data ?? r.data) as string[]),
    staleTime: 60_000,
  });

  const events   = data?.data ?? [];
  const meta     = data?.meta;
  const cities   = citiesData ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* Hero */}
      <div className="text-center space-y-3 py-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Trouvez votre prochain événement
        </h1>
        <p className="text-base text-gray-500 max-w-xl mx-auto">
          Concerts, conférences, festivals, expositions — achetez vos billets en ligne en quelques secondes.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher un événement…"
            defaultValue={search}
            onChange={e => debouncedSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <button
          onClick={() => setShowFilters(s => !s)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors',
            (city || showFilters)
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtrer
          {city && <span className="bg-white/20 rounded-full px-1.5 text-xs">1</span>}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filtrer par ville</p>
            {city && (
              <button onClick={() => setCity('')} className="text-xs text-red-500 flex items-center gap-1 hover:text-red-700">
                <X className="h-3 w-3" /> Effacer
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {cities.map(c => (
              <button
                key={c}
                onClick={() => { setCity(c === city ? '' : c); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  city === c
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
                )}
              >
                {c}
              </button>
            ))}
            {cities.length === 0 && <p className="text-sm text-gray-400">Aucune ville disponible</p>}
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Ticket className="h-8 w-8 text-gray-400" />
          </div>
          <p className="font-semibold text-gray-700 dark:text-gray-300">Aucun événement trouvé</p>
          <p className="text-sm text-gray-400 max-w-xs">
            {search || city ? 'Essayez d\'autres termes de recherche.' : 'Revenez bientôt pour découvrir les prochains événements.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              <strong className="text-gray-900 dark:text-white">{meta?.total ?? 0}</strong> événement{(meta?.total ?? 0) !== 1 ? 's' : ''}
              {city && <> à <strong>{city}</strong></>}
              {search && <> pour &laquo; <strong>{search}</strong> &raquo;</>}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {events.map(ev => <EventCard key={ev.id} event={ev} />)}
          </div>
        </>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Précédent
          </button>
          <span className="text-sm text-gray-500">
            {page} / {meta.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="flex items-center gap-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            Suivant <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
