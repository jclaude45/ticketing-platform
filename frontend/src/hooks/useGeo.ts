'use client';

import { useQuery } from '@tanstack/react-query';

/** Countries and cities from /public/geo (GeoNames, CC BY 4.0 — see public/geo/SOURCE.txt) */

export interface Country {
  code: string;
  name: string;
  currency: string;
}

/** Names people use here, clearer than the official ones */
const NAME_OVERRIDES: Record<string, string> = { CD: 'RD Congo', CG: 'Congo-Brazzaville' };

/** Shown first in the list */
export const FREQUENT_COUNTRIES = ['CD', 'CG', 'AO', 'CM', 'CI', 'SN', 'GA', 'RW', 'BI', 'FR', 'BE', 'CA', 'US'];

const ALIASES: Record<string, string> = {
  rdc: 'CD', drc: 'CD', 'rd congo': 'CD', 'republique democratique du congo': 'CD', 'congo-kinshasa': 'CD',
  'congo kinshasa': 'CD', 'democratic republic of the congo': 'CD', zaire: 'CD',
  congo: 'CG', 'congo-brazzaville': 'CG', 'congo brazzaville': 'CG', 'republique du congo': 'CG',
  usa: 'US', 'etats-unis': 'US', 'royaume-uni': 'GB', uk: 'GB',
};

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function frenchName(code: string): string {
  if (NAME_OVERRIDES[code]) return NAME_OVERRIDES[code];
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function useCountries() {
  return useQuery({
    queryKey: ['geo', 'countries'],
    queryFn: async (): Promise<Country[]> => {
      const res = await fetch('/geo/countries.json');
      if (!res.ok) throw new Error('countries');
      const raw: { code: string; currency: string }[] = await res.json();
      return raw
        .map(c => ({ code: c.code, currency: c.currency, name: frenchName(c.code) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Cities of a country, most populated first */
export function useCities(code: string | null) {
  return useQuery({
    queryKey: ['geo', 'cities', code],
    queryFn: async (): Promise<string[]> => {
      const res = await fetch(`/geo/cities/${code}.json`);
      return res.ok ? res.json() : [];
    },
    enabled: !!code,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** ISO code of a stored country name ("RD Congo", "RDC", "France", "CD"…), null if unknown */
export function countryCodeOf(value: string | null | undefined, countries: Country[] | undefined): string | null {
  if (!value || !countries) return null;
  const v = normalize(value);
  if (ALIASES[v]) return ALIASES[v];
  const byCode = countries.find(c => c.code.toLowerCase() === v);
  if (byCode) return byCode.code;
  return countries.find(c => normalize(c.name) === v)?.code ?? null;
}
