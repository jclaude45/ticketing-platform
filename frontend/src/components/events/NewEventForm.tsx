'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { eventDraftsApi } from '@/lib/api';
import { EventForm } from './EventForm';

/** Creation form, resuming the draft named in ?draft= when there is one */
export function NewEventForm() {
  const params = useSearchParams();
  // Read once: the form itself writes ?draft= when it saves its first draft
  const [draftId] = useState(() => params.get('draft'));

  const { data: draft, isLoading, isError } = useQuery({
    queryKey: ['event-draft', draftId],
    queryFn: () => eventDraftsApi.get(draftId!),
    enabled: !!draftId,
    staleTime: Infinity,
    retry: false,
  });

  if (draftId && isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (draftId && (isError || !draft)) {
    return (
      <div className="border-b border-gray-200 py-16 text-center dark:border-gray-800">
        <p className="font-medium text-black dark:text-white">Ce brouillon n&apos;existe plus</p>
        <p className="mt-1 text-sm text-gray-500">Il a peut-être été supprimé, ou l&apos;événement a déjà été créé.</p>
        <Link href="/dashboard/events/new" className="btn-primary mt-5 inline-flex">Commencer un nouvel événement</Link>
      </div>
    );
  }

  return <EventForm draft={draft ? { id: draft.id, data: draft.data } : undefined} />;
}
