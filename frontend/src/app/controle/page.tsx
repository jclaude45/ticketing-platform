'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Calendar, MapPin, Loader2, ChevronRight, CalendarX } from 'lucide-react';
import { apiClient, resolveMediaUrl } from '@/lib/api';
import { formatEventDate } from './format';

interface AssignedEvent {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  venue: string;
  city: string;
  bannerUrl: string | null;
}

export default function ControleHomePage() {
  const { data: events = [], isLoading } = useQuery<AssignedEvent[]>({
    queryKey: ['controller-space', 'events'],
    queryFn: async () => {
      const res = await apiClient.get('/controller-space/events');
      return (res.data as any)?.data ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mes événements</h1>
        <p className="text-sm text-gray-500">Les événements dont vous contrôlez les entrées.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <CalendarX className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="font-medium text-gray-900">Aucun événement assigné</p>
          <p className="text-sm text-gray-500 mt-1">L&apos;organisateur ne vous a pas encore assigné d&apos;événement.</p>
        </div>
      ) : (
        events.map((ev) => (
          <Link
            key={ev.id}
            href={`/controle/${ev.id}`}
            className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm transition-all"
          >
            {ev.bannerUrl ? (
              <img src={resolveMediaUrl(ev.bannerUrl)} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-indigo-100" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900">{ev.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                <Calendar className="h-3.5 w-3.5" /> {formatEventDate(ev.startDate)}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 truncate">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" /> {ev.venue}, {ev.city}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </Link>
        ))
      )}
    </div>
  );
}
