import type { Metadata } from 'next';
import { EventForm } from '@/components/events/EventForm';
import { PageHeader } from '@/components/common/PageHeader';

export const metadata: Metadata = { title: 'Create Event' };

export default function NewEventPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Create Event"
        description="Fill in the details to create a new event"
        breadcrumbs={[
          { label: 'Events', href: '/dashboard/events' },
          { label: 'New Event' },
        ]}
      />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
        <EventForm />
      </div>
    </div>
  );
}
