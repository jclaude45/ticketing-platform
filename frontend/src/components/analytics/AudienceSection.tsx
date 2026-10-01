'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Eye, Users, Globe2, MapPin, Loader2, Monitor, Smartphone, Tablet, Info } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AudiencePlace } from './AudienceMap';

// Leaflet touches `window`: load the map in the browser only
const AudienceMap = dynamic(() => import('./AudienceMap'), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />,
});

interface Audience {
  days: number;
  views: number;
  uniqueVisitors: number;
  countriesCount: number;
  locatedShare: number;
  byDay: { date: string; views: number; visitors: number }[];
  countries: { country: string | null; visitors: number }[];
  places: AudiencePlace[];
  referrers: { name: string; views: number }[];
  devices: { device: string; views: number }[];
  events: { id: string; name: string; views: number; visitors: number }[];
}

const PERIODS = [7, 30, 90, 365];

const countryName = (code: string | null) => {
  if (!code) return 'Non localisé';
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const flag = (code: string | null) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(0x1f1a5 + code.charCodeAt(0), 0x1f1a5 + code.charCodeAt(1)) : '🌐';

const sourceLabel = (name: string) => (name === 'Direct' ? 'Accès direct / lien partagé' : name.startsWith('utm:') ? `Campagne « ${name.slice(4)} »` : name);

const DEVICE_ICONS: Record<string, typeof Monitor> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };
const DEVICE_LABELS: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' };

/**
 * "Audience web": how many people saw the public sales page(s) and where they are.
 * `eventId` → one event; otherwise every event of the account.
 */
export function AudienceSection({ eventId }: { eventId?: string }) {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<Audience>({
    queryKey: ['audience', eventId ?? 'all', days],
    queryFn: async () => {
      const url = eventId ? `/analytics/events/${eventId}/audience` : '/analytics/audience';
      const res = await apiClient.get(url, { params: { days } });
      return (res.data as any)?.data ?? res.data;
    },
  });

  const card = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900';

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Audience web</h2>
          <p className="text-sm text-gray-500">
            Personnes qui ont consulté {eventId ? 'la page de vente de cet événement' : 'les pages de vente de vos événements'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                days === p ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-900' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400',
              )}
            >
              {p === 365 ? '1 an' : `${p} j`}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className={cn(card, 'flex justify-center py-12')}><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Personnes touchées', value: data.uniqueVisitors, icon: Users },
              { label: 'Vues de la page', value: data.views, icon: Eye },
              { label: 'Pays', value: data.countriesCount, icon: Globe2 },
              { label: 'Villes', value: data.places.filter((p) => p.city).length, icon: MapPin },
            ].map((s) => (
              <div key={s.label} className={card}>
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <s.icon className="h-3.5 w-3.5" />{s.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{s.value.toLocaleString('fr-FR')}</p>
              </div>
            ))}
          </div>

          {data.views === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-gray-700">
              Aucune visite sur cette période. Partagez le lien de la page de vente : chaque visiteur apparaîtra sur la carte.
            </div>
          )}
          <>
              <div className={card}>
                <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Visites par jour</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.byDay} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(d: string) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      formatter={(value: number, name: string) => [value, name === 'visitors' ? 'Personnes' : 'Vues']}
                    />
                    <Area type="monotone" dataKey="views" stroke="#a5b4fc" fill="#e0e7ff" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="visitors" stroke="#5C37FF" fill="#5C37FF" fillOpacity={0.25} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className={cn(card, 'lg:col-span-2')}>
                  <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Où sont vos visiteurs</p>
                  {/* Always shown: an empty world map until the first visitors are located */}
                  <AudienceMap places={data.places} />
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    Position approximative (ville) déduite de la connexion internet
                    {data.views > 0 && ` — ${Math.round(data.locatedShare * 100)}% des visites localisées`}.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className={card}>
                    <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Pays</p>
                    <ul className="space-y-1.5">
                      {data.countries.length === 0 && <li className="text-xs text-gray-400">Aucune donnée pour le moment.</li>}
                      {data.countries.slice(0, 6).map((c) => (
                        <li key={c.country ?? 'unknown'} className="flex items-center justify-between text-sm">
                          <span className="truncate text-gray-700 dark:text-gray-300">{flag(c.country)} {countryName(c.country)}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{c.visitors}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={card}>
                    <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Villes</p>
                    <ul className="space-y-1.5">
                      {data.places.filter((p) => p.city).slice(0, 6).map((p) => (
                        <li key={`${p.lat},${p.lng}`} className="flex items-center justify-between text-sm">
                          <span className="truncate text-gray-700 dark:text-gray-300">{p.city}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{p.visitors}</span>
                        </li>
                      ))}
                      {!data.places.some((p) => p.city) && <li className="text-xs text-gray-400">Ville non disponible pour ces visites.</li>}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className={card}>
                  <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Provenance</p>
                  <ul className="space-y-1.5">
                    {data.referrers.length === 0 && <li className="text-xs text-gray-400">Aucune donnée pour le moment.</li>}
                    {data.referrers.map((r) => (
                      <li key={r.name} className="flex items-center justify-between text-sm">
                        <span className="truncate text-gray-700 dark:text-gray-300">{sourceLabel(r.name)}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{r.views}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={card}>
                  <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Appareils</p>
                  <ul className="space-y-1.5">
                    {data.devices.length === 0 && <li className="text-xs text-gray-400">Aucune donnée pour le moment.</li>}
                    {data.devices.map((d) => {
                      const Icon = DEVICE_ICONS[d.device] ?? Monitor;
                      return (
                        <li key={d.device} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <Icon className="h-4 w-4 text-gray-400" />{DEVICE_LABELS[d.device] ?? d.device}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {Math.round((d.views / data.views) * 100)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {!eventId && data.events.length > 1 && (
                <div className={card}>
                  <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Par événement</p>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.events.map((e) => (
                      <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="truncate text-gray-700 dark:text-gray-300">{e.name}</span>
                        <span className="whitespace-nowrap text-gray-500">
                          <strong className="text-gray-900 dark:text-white">{e.visitors}</strong> personnes · {e.views} vues
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </>
        </>
      )}
    </section>
  );
}
