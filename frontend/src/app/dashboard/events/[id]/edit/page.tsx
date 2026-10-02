'use client';

import { useParams } from 'next/navigation';
import { useEvent } from '@/hooks/useEvents';
import { EventForm } from '@/components/events/EventForm';
import { PageLoader } from '@/components/common/LoadingSpinner';

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);

  if (isLoading) return <PageLoader text="Chargement de l'événement..." />;
  if (!event) return <div className="text-center py-12 text-gray-500">Événement introuvable</div>;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-3xl font-black uppercase tracking-tight text-black sm:text-4xl dark:text-white">Modifier l&apos;événement</h1>
      <EventForm event={event} isEdit />
    </div>
  );
}
