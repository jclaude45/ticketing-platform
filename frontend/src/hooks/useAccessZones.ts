'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export interface AccessZone { id: string; name: string; color: string; position: number }

const FALLBACK_COLOR = '#64748b';

/** Access zones of the organizer account (Admin → Zones d'accès), with their badge colors. */
export function useAccessZones() {
  const { data: zones = [], isLoading } = useQuery<AccessZone[]>({
    queryKey: ['account', 'zones'],
    queryFn: async () => {
      const res = await apiClient.get('/account/zones');
      return (res.data as any)?.data ?? [];
    },
    staleTime: 60_000,
  });
  const colors: Record<string, string> = Object.fromEntries(zones.map((z) => [z.name, z.color]));
  const colorOf = (name: string) => colors[name] ?? FALLBACK_COLOR;
  return { zones, colors, colorOf, isLoading };
}
