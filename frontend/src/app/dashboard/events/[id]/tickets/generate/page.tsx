'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Sparkles, Ticket, AlertTriangle, Ban } from 'lucide-react';
import { eventsApi } from '@/lib/api';
import { GenerateTicketsForm } from '@/components/tickets/GenerateTicketsForm';
import { cn } from '@/lib/utils';

export default function GenerateTicketsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await eventsApi.get(eventId);
      return (res.data as any)?.data ?? res.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // ticketsGenerated does not exist as a DB column — use _count.tickets which is
  // already included by the findOne endpoint (include: { _count: { select: { tickets: true } } }).
  const ticketsGenerated = event?._count?.tickets ?? 0;
  const remaining =
    event?.totalCapacity != null
      ? event.totalCapacity - ticketsGenerated
      : null;

  const isCancelled = event?.status === 'CANCELLED';
  const isFull = remaining !== null && remaining <= 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux billets
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Générer des billets</h1>
            {event?.name && (
              <p className="text-sm text-gray-500">{event.name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Capacity banner */}
      {!isLoading && event && (
        <div className={cn(
          'rounded-xl border px-4 py-3',
          isFull
            ? 'border-red-200 bg-red-50'
            : remaining !== null && remaining < 50
            ? 'border-amber-200 bg-amber-50'
            : 'border-indigo-200 bg-indigo-50',
        )}>
          <div className="flex items-start gap-3">
            {isFull
              ? <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              : <Ticket className="h-5 w-5 text-indigo-500 flex-shrink-0 mt-0.5" />
            }
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <p className={cn(
                  'text-sm font-semibold',
                  isFull ? 'text-red-800' : 'text-indigo-800',
                )}>
                  {isFull
                    ? 'Capacité maximale atteinte'
                    : `${remaining?.toLocaleString('fr-FR') ?? '—'} places disponibles`}
                </p>
                <span className="text-xs text-gray-500">
                  {ticketsGenerated.toLocaleString('fr-FR')} / {(event.totalCapacity ?? 0).toLocaleString('fr-FR')} billets
                </span>
              </div>
              {/* Progress bar */}
              {event.totalCapacity > 0 && (
                <div className="h-2 w-full rounded-full bg-white/60">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all duration-700',
                      isFull ? 'bg-red-500' : remaining !== null && remaining < 50 ? 'bg-amber-500' : 'bg-indigo-500',
                    )}
                    style={{
                      width: `${Math.min(100, Math.round((ticketsGenerated / event.totalCapacity) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Block form if cancelled */}
      {isCancelled ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <Ban className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <p className="text-base font-semibold text-gray-900">Événement annulé</p>
          <p className="text-sm text-gray-500 mt-1">
            Il n'est pas possible de générer des billets pour un événement annulé.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
        </div>
      ) : isFull ? (
        <div className="rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-3" />
          <p className="text-base font-semibold text-gray-900">Génération impossible</p>
          <p className="text-sm text-gray-500 mt-1">
            La capacité maximale de cet événement est atteinte.<br />
            Augmentez la capacité dans les paramètres de l'événement pour générer plus de billets.
          </p>
          <button
            onClick={() => router.push(`/dashboard/events/${eventId}/edit`)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Modifier la capacité
          </button>
        </div>
      ) : (
        <GenerateTicketsForm eventId={eventId} />
      )}
    </div>
  );
}
