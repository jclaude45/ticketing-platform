'use client';

import Link from 'next/link';
import { ChevronRight, Edit, MapPin, Ticket } from 'lucide-react';
import { type Event } from '@/types';
import { cn, formatNumber } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/api';
import { EVENT_STATUS_LABELS, EVENT_STATUS_STYLES } from '@/hooks/useEventAccess';

/** Tickets issued against the capacity (tickets are counted by the API in _count) */
function fill(event: Event) {
  const issued = event._count?.tickets ?? 0;
  const pct = event.totalCapacity > 0 ? Math.min(100, Math.round((issued / event.totalCapacity) * 100)) : 0;
  return { issued, pct };
}

/** "aujourd'hui", "demain", "dans 12 j", "en cours", "passé" */
function timing(event: Event): { label: string; past: boolean } {
  const now = Date.now();
  const start = new Date(event.startDate).getTime();
  const end = new Date(event.endDate ?? event.startDate).getTime();
  if (end < now) return { label: 'Passé', past: true };
  if (start <= now) return { label: 'En cours', past: false };
  const days = Math.floor((new Date(event.startDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return { label: "Aujourd'hui", past: false };
  if (days === 1) return { label: 'Demain', past: false };
  return { label: `Dans ${days} j`, past: false };
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' });
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function Poster({ event, className }: { event: Event; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden bg-[#181818]', className)}>
      {event.bannerUrl ? (
        <img src={resolveMediaUrl(event.bannerUrl)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Ticket className="h-1/3 w-1/3 text-white/15" strokeWidth={1.2} />
        </div>
      )}
    </div>
  );
}

function FillBar({ pct }: { pct: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div
        className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-[#FFDD00]' : 'bg-black dark:bg-white')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Grid ("icônes") ──────────────────────────────────────────────────────────

export function EventCard({ event }: { event: Event }) {
  const { issued, pct } = fill(event);
  const when = timing(event);
  const href = `/dashboard/events/${event.id}`;

  return (
    <div className={cn('group relative', when.past && 'opacity-70 hover:opacity-100')}>
      <Link href={href} className="block" aria-label={event.name}>
        <div className="relative">
          <Poster event={event} className="aspect-square rounded-[18px]" />
          {/* Date tile */}
          <div className="absolute bottom-3 left-3 flex h-14 w-12 flex-col items-center justify-center rounded-xl bg-white text-black shadow-sm">
            <span className="text-lg font-black leading-none">{dayOf(event.startDate)}</span>
            <span className="text-[11px] font-medium uppercase">{monthOf(event.startDate)}</span>
          </div>
          <span className={cn('absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold', EVENT_STATUS_STYLES[event.status] ?? 'bg-white text-black')}>
            {EVENT_STATUS_LABELS[event.status] ?? event.status}
          </span>
        </div>

        <div className="mt-3 space-y-1">
          <h3 className="truncate text-[15px] font-semibold tracking-normal text-black dark:text-white">{event.name}</h3>
          <p className="flex items-center gap-1.5 truncate text-sm text-gray-500">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{event.venue}, {event.city}</span>
          </p>
          <p className="flex items-center justify-between text-xs text-gray-500">
            <span>{time(event.startDate)} · <span className={cn(!when.past && 'font-medium text-black dark:text-white')}>{when.label}</span></span>
            <span>{formatNumber(issued)} / {formatNumber(event.totalCapacity)}</span>
          </p>
          <FillBar pct={pct} />
        </div>
      </Link>

      {/* Quick actions, on hover (always visible on touch screens) */}
      <div className="absolute right-3 top-3 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <Link href={`${href}/edit`} title="Modifier" aria-label="Modifier" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-black shadow-sm hover:bg-white">
          <Edit className="h-3.5 w-3.5" />
        </Link>
        <Link href={`${href}/tickets`} title="Billets" aria-label="Billets" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/85 text-white shadow-sm hover:bg-black">
          <Ticket className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function EventListHeader() {
  return (
    <div className="hidden grid-cols-[minmax(0,1fr)_170px_200px_150px_24px] gap-6 border-b border-gray-200 px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-gray-400 md:grid dark:border-gray-800">
      <span>Événement</span>
      <span>Date</span>
      <span>Lieu</span>
      <span>Billets</span>
      <span />
    </div>
  );
}

export function EventRow({ event }: { event: Event }) {
  const { issued, pct } = fill(event);
  const when = timing(event);

  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      className={cn(
        'group grid grid-cols-[minmax(0,1fr)_24px] items-center gap-4 border-b border-gray-200 px-1 py-3.5 transition-colors hover:bg-gray-50 md:grid-cols-[minmax(0,1fr)_170px_200px_150px_24px] md:gap-6 dark:border-gray-800 dark:hover:bg-gray-900',
        when.past && 'opacity-70 hover:opacity-100',
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <Poster event={event} className="h-14 w-14 flex-shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-black dark:text-white">{event.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', EVENT_STATUS_STYLES[event.status] ?? 'bg-gray-100 text-black', event.status === 'DRAFT' && 'border border-gray-200')}>
              {EVENT_STATUS_LABELS[event.status] ?? event.status}
            </span>
            {/* Phones: the other columns fold into this line */}
            <span className="truncate text-xs text-gray-500 md:hidden">{fullDate(event.startDate)} · {event.city}</span>
          </div>
        </div>
      </div>

      <div className="hidden text-sm md:block">
        <p className="text-black dark:text-white">{fullDate(event.startDate)}</p>
        <p className={cn('text-xs', when.past ? 'text-gray-400' : 'font-medium text-black dark:text-white')}>{time(event.startDate)} · {when.label}</p>
      </div>

      <div className="hidden min-w-0 text-sm md:block">
        <p className="truncate text-black dark:text-white">{event.venue}</p>
        <p className="truncate text-xs text-gray-500">{event.city}{event.country ? `, ${event.country}` : ''}</p>
      </div>

      <div className="hidden space-y-1.5 md:block">
        <p className="text-sm text-black dark:text-white">
          {formatNumber(issued)} <span className="text-gray-400">/ {formatNumber(event.totalCapacity)}</span>
        </p>
        <FillBar pct={pct} />
      </div>

      <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-black dark:group-hover:text-white" />
    </Link>
  );
}
