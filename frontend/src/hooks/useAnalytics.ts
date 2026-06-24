'use client';

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';

export function useEventAnalytics(eventId: string) {
  return useQuery({
    queryKey: ['analytics', 'event', eventId],
    queryFn: async () => {
      const res = await analyticsApi.getEventAnalytics(eventId);
      return res.data.data;
    },
    enabled: !!eventId,
    refetchInterval: 30 * 1000,
  });
}

export function useGlobalAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'global'],
    queryFn: async () => {
      const res = await analyticsApi.getGlobalAnalytics();
      return res.data.data;
    },
    refetchInterval: 60 * 1000,
  });
}
