'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { Search, X, Loader2, Ticket } from 'lucide-react';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { capitalize, formatEventDay, fromPriceLabel } from '@/components/site/format';

interface PublicEvent {
  id: string; name: string; description?: string;
  venue: string; city: string; country: string; type?: string;
  startDate: string; endDate: string; bannerUrl?: string;
  totalCapacity: number; minPrice: number | null; soldOut: boolean;
  ticketTemplates: { id: string; name: string; price: number; currency: string; availableCount: number }[];
  organizer: { firstName: string; lastName: string };
  _count: { tickets: number };
}
type Page = { data: PublicEvent[]; meta: { total: number; page: number; totalPages: number } };

const unwrap = (r: any) => (r.data?.data ?? r.data) as any;

/** The four categories of the mockup, mapped to the event types of the API */
const CATEGORIES = [
  { type: 'PARTY', label: 'Night Club', title: 'Night Club', bg: 'bg-[#B8062C]', image: '/zaya-site/nightclub.webp' },
  { type: 'FESTIVAL', label: 'Festival', title: 'Festivals', bg: 'bg-[#D77D2C]', image: '/zaya-site/festival.webp' },
  { type: 'SPORT', label: 'Sport', title: 'Sport', bg: 'bg-gradient-to-b from-[#119C65] to-[#58C93F]' },
  { type: 'CONFERENCE', label: 'Conférence', title: 'Conférences', bg: 'bg-gradient-to-b from-[#601399] to-[#9A65BB]' },
];

// ─── Hero carousel: upcoming events with a picture ───────────────────────────

function HeroCarousel({ events }: { events: PublicEvent[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (events.length < 2 || paused) return;
    const t = setInterval(() => setIndex(i => (i + 1) % events.length), 6000);
    return () => clearInterval(t);
  }, [events.length, paused]);

  if (events.length === 0) return null;
  const current = events[Math.min(index, events.length - 1)];

  return (
    <section
      className="relative h-[760px] overflow-hidden bg-white sm:h-[640px] lg:h-[694px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carrousel"
    >
      {events.map((e, i) => (
        <div
          key={e.id}
          className={cn('absolute inset-0 transition-opacity duration-700', i === index ? 'opacity-100' : 'pointer-events-none opacity-0')}
          aria-hidden={i !== index}
        >
          <div className="absolute inset-x-0 top-0 h-[560px] sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[70%] lg:w-[62%]">
            <Image src={resolveMediaUrl(e.bannerUrl)!} alt="" fill sizes="(min-width: 640px) 70vw, 100vw" priority={i === 0} className="object-cover object-center" />
          </div>
        </div>
      ))}
      {/* White fades: left side for the text, bottom towards the page */}
      <div className="absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-white from-40% via-white/60 to-transparent sm:block" />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent via-white/85 to-white sm:h-[40%]" />

      <div className="relative mx-auto flex h-full max-w-[1366px] flex-col justify-end px-6 pb-10 text-center sm:px-[110px] sm:pb-[60px] sm:text-left">
        <h1 className="line-clamp-2 break-words text-[56px] font-black uppercase leading-[0.95] tracking-tight sm:max-w-[700px] sm:text-[72px] lg:text-[80px]">
          {current.name}
        </h1>
        <div className="mt-6 space-y-1 text-xl font-light text-[#111] sm:mt-4 sm:space-y-1.5 sm:text-[31px] sm:leading-tight">
          <p>{capitalize(formatEventDay(current.startDate))}</p>
          <p>{current.city}, {current.venue}</p>
          <p>{fromPriceLabel(current)}</p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-8 sm:mt-6 sm:flex-row sm:justify-between">
          <Link href={`/billetterie/${current.id}`} className="rounded-full bg-black px-9 py-3 text-lg font-bold uppercase text-white transition-opacity hover:opacity-85">
            Acheter
          </Link>
          {events.length > 1 && (
            <div className="flex items-center gap-1.5 sm:self-end sm:pb-2">
              {events.map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Afficher ${e.name}`}
                  className={cn('h-[10px] rounded-full bg-[#707070] transition-all', i === index ? 'w-8' : 'w-[10px]')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: PublicEvent }) {
  return (
    <Link href={`/billetterie/${event.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-[20px] bg-[#eee]">
        {event.bannerUrl ? (
          <Image src={resolveMediaUrl(event.bannerUrl)!} alt={event.name} fill sizes="(min-width: 1024px) 230px, 45vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center"><Ticket className="h-14 w-14 text-[#bbb]" strokeWidth={1.4} /></div>
        )}
      </div>
      <h3 className="mt-3 truncate text-lg font-normal tracking-normal text-black sm:text-xl">{event.name}</h3>
      <div className="mt-1 space-y-1.5 text-[15px] font-light tracking-wide text-[#8a8a8a] sm:text-lg">
        <p>{formatEventDay(event.startDate)}</p>
        <p className="truncate">{event.venue}</p>
        <p>{fromPriceLabel(event)}</p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BilletteriePage() {
  const [type, setType] = useState('');
  const [city, setCity] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Typing settles for 300 ms before a new search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: heroEvents = [] } = useQuery({
    queryKey: ['public-events-hero'],
    queryFn: () => publicApi.listEvents({ page: 1, limit: 20 }).then(r => unwrap(r) as Page),
    select: (p: Page) => p.data
      .filter(e => e.bannerUrl && new Date(e.endDate).getTime() > Date.now())
      .slice(0, 4),
    staleTime: 60_000,
  });

  const { data: cities = [] } = useQuery({
    queryKey: ['public-cities'],
    queryFn: () => publicApi.getCities().then(r => unwrap(r) as string[]),
    staleTime: 60_000,
  });

  const list = useInfiniteQuery({
    queryKey: ['public-events', search, city, type],
    queryFn: ({ pageParam }) =>
      publicApi.listEvents({ page: pageParam, limit: 12, search: search || undefined, city: city || undefined, type: type || undefined })
        .then(r => unwrap(r) as Page),
    initialPageParam: 1,
    getNextPageParam: last => (last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    staleTime: 30_000,
    placeholderData: prev => prev,
  });

  const events = useMemo(() => list.data?.pages.flatMap(p => p.data) ?? [], [list.data]);
  const filtered = !!(type || city || search);
  const category = CATEGORIES.find(c => c.type === type);
  const onlyCity = city || (events.length > 0 && events.every(e => e.city === events[0].city) ? events[0].city : '');
  const title = `${search ? 'Résultats' : category ? category.title : 'Événements populaires'}${onlyCity ? ` à ${onlyCity}` : ''}`;

  return (
    <>
      <HeroCarousel events={heroEvents} />

      {/* ── Categories ── */}
      <section className="mx-auto max-w-[1366px] pt-10 lg:px-[134px] lg:pt-11">
        <div className="flex snap-x gap-4 overflow-x-auto px-6 pb-2 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map(c => (
            <button
              key={c.type}
              onClick={() => setType(t => (t === c.type ? '' : c.type))}
              aria-pressed={type === c.type}
              className={cn(
                'relative h-[80px] w-[185px] flex-shrink-0 snap-start overflow-hidden rounded-[22px] text-left transition-transform hover:-translate-y-0.5 lg:h-[107px] lg:w-auto lg:rounded-[30px]',
                c.bg,
                type === c.type && 'ring-4 ring-black ring-offset-2',
              )}
            >
              {c.image && <Image src={c.image} alt="" fill sizes="250px" className="object-cover opacity-30 mix-blend-luminosity" />}
              <span className="absolute bottom-3 left-4 text-sm font-bold text-white lg:bottom-4 lg:left-5 lg:text-lg">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Events ── */}
      <section id="evenements" className="mx-auto max-w-[1366px] scroll-mt-24 px-6 pb-20 pt-12 lg:px-[147px] lg:pt-[88px]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-[560px] text-[36px] font-light tracking-normal uppercase leading-[0.95] lg:text-[40px]">{title}</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="relative block">
              <Search className="absolute bottom-2.5 left-0 h-4 w-4 text-[#8a8a8a]" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Rechercher un événement"
                className="w-full border-0 border-b border-[#9a9a9a] bg-transparent py-2 pl-6 pr-6 text-[15px] placeholder:text-[#8a8a8a] focus:border-black focus:outline-none focus:ring-0 sm:w-[240px]"
              />
              {searchInput && (
                <button onClick={() => setSearchInput('')} className="absolute bottom-2.5 right-0 text-[#8a8a8a] hover:text-black" aria-label="Effacer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            {cities.length > 1 && (
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="border-0 border-b border-[#9a9a9a] bg-transparent py-2 pl-0.5 pr-8 text-[15px] focus:border-black focus:outline-none focus:ring-0"
              >
                <option value="">Toutes les villes</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        </div>

        {list.isError && events.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-xl">Impossible de charger les événements.</p>
            <button onClick={() => list.refetch()} className="mt-4 rounded-full bg-black px-6 py-2.5 text-sm uppercase text-white">Réessayer</button>
          </div>
        ) : list.isLoading ? (
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4 lg:gap-x-[51px] lg:gap-y-[60px]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-square animate-pulse rounded-[20px] bg-[#eee]" />
                <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-[#eee]" />
                <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-[#f3f3f3]" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-xl">Aucun événement {filtered ? 'ne correspond à votre recherche' : 'pour le moment'}.</p>
            {filtered && (
              <button onClick={() => { setType(''); setCity(''); setSearchInput(''); }} className="mt-4 rounded-full bg-black px-6 py-2.5 text-sm uppercase text-white">
                Voir tous les événements
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={cn('mt-8 grid grid-cols-2 gap-x-5 gap-y-10 transition-opacity lg:grid-cols-4 lg:gap-x-[51px] lg:gap-y-[60px]', list.isFetching && !list.isFetchingNextPage && 'opacity-60')}>
              {events.map(e => <EventCard key={e.id} event={e} />)}
            </div>
            {list.hasNextPage && (
              <div className="mt-14 text-center">
                <button
                  onClick={() => list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-full bg-black px-8 py-3 text-base uppercase text-white transition-opacity hover:opacity-85 disabled:opacity-60"
                >
                  {list.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />} Voir plus
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Welcome banner ── */}
      <section className="mx-auto max-w-[1366px] px-6 pb-10 lg:px-[69px]">
        <div className="relative overflow-hidden rounded-[40px] bg-[#f2f2f2] lg:h-[440px] lg:rounded-[60px]">
          <div className="relative h-[290px] overflow-hidden rounded-b-[40px] lg:absolute lg:inset-0 lg:h-auto lg:rounded-none">
            <Image src="/zaya-site/foule.webp" alt="" fill sizes="(min-width: 1024px) 1230px, 100vw" className="object-cover object-[center_30%] grayscale" />
            <div className="absolute inset-0 hidden bg-gradient-to-r from-transparent via-white/20 to-white/85 lg:block" />
          </div>
          <div className="relative px-6 pb-10 pt-8 text-center lg:absolute lg:bottom-[80px] lg:right-[30px] lg:max-w-[400px] lg:p-0 lg:text-left">
            <p className="text-[40px] font-black uppercase leading-[0.95] tracking-tight lg:text-[50px]">
              « Welcome to Zaya, where real events meet real lives »
            </p>
            <a href="#telecharger" className="mt-4 inline-block rounded-full bg-black px-4 py-2 text-lg uppercase text-white transition-opacity hover:opacity-85">
              Télécharger
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
