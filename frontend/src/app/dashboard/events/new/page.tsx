import type { Metadata } from 'next';
import { EventForm } from '@/components/events/EventForm';
import { PageHeader } from '@/components/common/PageHeader';

export const metadata: Metadata = { title: 'Créer un événement' };

export default function NewEventPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Créer un événement"
        description="Renseignez les détails pour créer un nouvel événement"
        breadcrumbs={[
          { label: 'Événements', href: '/dashboard/events' },
          { label: 'Nouvel événement' },
        ]}
      />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 sm:p-6">
        <EventForm />
      </div>
    </div>
  );
}
