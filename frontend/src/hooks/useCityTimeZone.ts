'use client';

import { useQuery } from '@tanstack/react-query';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Zone of a city (GeoNames, /geo/tz): its own, or its country's main one; null while unknown */
export function useCityTimeZone(countryCode: string | null, city: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ['geo', 'tz', countryCode],
    queryFn: async (): Promise<{ d: string; x?: Record<string, string> } | null> => {
      const res = await fetch(`/geo/tz/${countryCode}.json`);
      return res.ok ? res.json() : null;
    },
    enabled: !!countryCode,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  if (!data) return null;
  const c = normalize(city ?? '');
  const own = Object.entries(data.x ?? {}).find(([name]) => normalize(name) === c)?.[1];
  return own ?? data.d;
}
