import { Suspense } from 'react';
import type { Metadata } from 'next';
import { NewEventForm } from '@/components/events/NewEventForm';

export const metadata: Metadata = { title: 'Créer un événement' };

export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-black uppercase tracking-tight text-black sm:text-4xl dark:text-white">Nouvel événement</h1>
        <p className="mt-1 text-gray-500">Quatre étapes, et votre billetterie est prête à être publiée.</p>
      </div>
      <Suspense>
        <NewEventForm />
      </Suspense>
    </div>
  );
}
