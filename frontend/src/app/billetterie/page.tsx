'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import {
  Search, MapPin, Calendar, ChevronLeft, ChevronRight,
  Ticket, X, ArrowRight, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketTemplate {
  id: string; name: string; price: number; currency: string; availableCount: number;
}
interface PublicEvent {
  id: string; name: string; description?: string;
  venue: string; city: string; country: string;
  startDate: string; endDate: string; bannerUrl?: string;
  totalCapacity: number; minPrice: number | null; soldOut: boolean;
  ticketTemplates: TicketTemplate[];
  organizer: { firstName: string; lastName: string };
  _count: { tickets: number };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function priceLabel(event: PublicEvent): { label: string; className: string } {
  if (event.soldOut) return { label: 'Complet', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
  if (event.minPrice === null) return { label: 'Consulter', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  if (event.minPrice === 0) return { label: 'Gratuit', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
  const cur = event.ticketTemplates[0]?.currency ?? 'USD';
  return { label: `Dès ${Number(event.minPrice).toFixed(2)} ${cur}`, className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' };
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: PublicEvent }) {
  const badge = priceLabel(event);
  const available = event.ticketTemplates.reduce((s, t) => s + t.availableCount, 0);
  const pct = event.totalCapacity > 0 ? Math.min(100, ((event.totalCapacity - available) / event.totalCapacity) * 100) : 0;
  const hot = pct >= 70 && !event.soldOut;

  return (
    <Link
      href={`/billetterie/${event.id}`}
      className="group flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
    >
      {/* Banner */}
      <div className="relative h-48 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 overflow-hidden flex-shrink-0">
        {event.bannerUrl ? (
          <img
            src={resolveMediaUrl(event.bannerUrl)}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Ticket className="h-16 w-16 text-white/20" />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
          <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm', badge.className)}>
            {badge.label}
          </span>
          {hot && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white animate-pulse">
              🔥 Bientôt complet
            </span>
          )}
        </div>

        {/* Date on banner */}
        <div className="absolute bottom-3 left-3">
          <span className="text-xs font-semibold text-white/90 bg-black/30 backdrop-blur-sm rounded-lg px-2.5 py-1">
            {formatDateShort(event.startDate)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2.5">
        <h3 className="font-bold text-gray-900 dark:text-white text-[15px] leading-tight line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {event.name}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
          <span className="truncate">{event.venue}, <span className="font-medium">{event.city}</span></span>
        </div>

        {event.description && (
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{event.description}</p>
        )}

        {/* Ticket categories */}
        {event.ticketTemplates.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {event.ticketTemplates.slice(0, 3).map(t => (
              <span key={t.id} className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded-full border',
                t.availableCount === 0
                  ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 line-through'
                  : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400',
              )}>
                {t.name}
              </span>
            ))}
            {event.ticketTemplates.length > 3 && (
              <span className="text-[11px] text-gray-400 px-1 py-0.5">+{event.ticketTemplates.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
          {!event.soldOut && event.totalCapacity > 0 && (
            <div className="flex-1 min-w-0">
              <div className="h-1 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-1 rounded-full transition-all', pct >= 80 ? 'bg-orange-400' : 'bg-indigo-400')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{available} place{available > 1 ? 's' : ''} restante{available > 1 ? 's' : ''}</p>
            </div>
          )}
          <span className={cn(
            'flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0 transition-colors',
            event.soldOut
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
              : 'bg-indigo-600 text-white group-hover:bg-indigo-700',
          )}>
            {event.soldOut ? 'Complet' : <>Voir <ArrowRight className="h-3 w-3" /></>}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BilletteriePage() {
  const [search, setSearch] = useState('');
  const [city, setCity]     = useState('');
  const [page, setPage]     = useState(1);

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['public-events', page, search, city],
    queryFn: () => publicApi.listEvents({ page, limit: 12, search: search || undefined, city: city || undefined })
      .then(r => (r.data as any).data as { data: PublicEvent[]; meta: any }),
    staleTime: 30_000,
    placeholderData: prev => prev,
  });

  const { data: citiesData } = useQuery({
    queryKey: ['public-cities'],
    queryFn: () => publicApi.getCities().then(r => ((r.data as any).data ?? r.data) as string[]),
    staleTime: 60_000,
  });

  const events = data?.data ?? [];
  const meta   = data?.meta;
  const cities = citiesData ?? [];

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 overflow-hidden">
        {/* Background texture */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 25% 25%, #818cf8 0%, transparent 50%), radial-gradient(circle at 75% 75%, #a78bfa 0%, transparent 50%)',
        }} />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center space-y-6">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight tracking-tight">
            Trouvez votre<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
              prochain événement
            </span>
          </h1>

          <p className="text-base sm:text-lg text-indigo-200/80 max-w-xl mx-auto">
            Concerts, conférences, festivals, soirées — achetez vos billets en quelques clics.
          </p>

          {/* Search bar */}
          <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Rechercher un événement, une ville…"
                defaultValue={search}
                onChange={e => handleSearch(e.target.value)}
                className="w-full rounded-xl bg-white dark:bg-gray-900 border border-white/10 pl-11 pr-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-lg"
              />
              {search && (
                <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          {meta && meta.total > 0 && (
            <p className="text-sm text-indigo-300/70">
              <strong className="text-white">{meta.total}</strong> événement{meta.total > 1 ? 's' : ''} disponible{meta.total > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </section>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      {cities.length > 0 && (
        <section className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-16 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 overflow-x-auto scrollbar-hide">
            <span className="text-xs font-semibold text-gray-400 whitespace-nowrap flex-shrink-0">
              <MapPin className="h-3.5 w-3.5 inline mr-1" />Ville :
            </span>
            <button
              onClick={() => { setCity(''); setPage(1); }}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
                !city ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-indigo-50',
              )}
            >
              Toutes
            </button>
            {cities.map(c => (
              <button
                key={c}
                onClick={() => { setCity(c === city ? '' : c); setPage(1); }}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap',
                  city === c ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-indigo-50',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Events grid ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

        {/* Active filters */}
        {(search || city) && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-sm text-gray-500">Filtres actifs :</span>
            {search && (
              <button
                onClick={() => handleSearch('')}
                className="flex items-center gap-1.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-full hover:bg-indigo-200 transition-colors"
              >
                « {search} » <X className="h-3 w-3" />
              </button>
            )}
            {city && (
              <button
                onClick={() => { setCity(''); setPage(1); }}
                className="flex items-center gap-1.5 text-xs font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-full hover:bg-rose-200 transition-colors"
              >
                <MapPin className="h-3 w-3" />{city} <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse h-80" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center gap-5">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center">
              <Ticket className="h-10 w-10 text-indigo-400" />
            </div>
            <div>
              <p className="font-bold text-gray-700 dark:text-gray-300 text-lg">Aucun événement trouvé</p>
              <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                {search || city ? 'Essayez d\'autres termes ou retirez les filtres.' : 'Revenez bientôt pour découvrir les prochains événements.'}
              </p>
            </div>
            {(search || city) && (
              <button
                onClick={() => { handleSearch(''); setCity(''); }}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <X className="h-4 w-4" /> Effacer tous les filtres
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Section header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {city ? `Événements à ${city}` : search ? `Résultats` : 'Tous les événements'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {meta?.total ?? 0} événement{(meta?.total ?? 0) > 1 ? 's' : ''}
                  {isFetching && !isLoading && <span className="ml-2 text-indigo-400 text-xs animate-pulse">Mise à jour…</span>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {events.map(ev => <EventCard key={ev.id} event={ev} />)}
            </div>
          </>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-12">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Précédent
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(meta.totalPages - 4, page - 2)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'w-9 h-9 rounded-lg text-sm font-semibold transition-colors',
                      p === page
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
