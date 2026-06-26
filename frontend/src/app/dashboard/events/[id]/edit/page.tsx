'use client';

import { useParams } from 'next/navigation';
import { useEvent } from '@/hooks/useEvents';
import { EventForm } from '@/components/events/EventForm';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/LoadingSpinner';

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);

  if (isLoading) return <PageLoader text="Chargement de l'événement..." />;
  if (!event) return <div className="text-center py-12 text-gray-500">Événement introuvable</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Modifier l'événement"
        description={`Modification : ${event.name}`}
        breadcrumbs={[
          { label: 'Événements', href: '/dashboard/events' },
          { label: event.name, href: `/dashboard/events/${id}` },
          { label: 'Modifier' },
        ]}
      />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 sm:p-6">
        <EventForm event={event} isEdit />
      </div>
    </div>
  );
}
