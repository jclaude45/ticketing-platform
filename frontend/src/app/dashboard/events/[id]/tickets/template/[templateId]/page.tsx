'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Palette, Info } from 'lucide-react';
import { eventsApi } from '@/lib/api';
import { useTicketTemplate } from '@/hooks/useTickets';
import { TicketEditor } from '@/components/tickets/TicketEditor';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function TicketTemplateEditorPage() {
  const { id: eventId, templateId } = useParams<{ id: string; templateId: string }>();
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const isNew = templateId === 'new';

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await eventsApi.get(eventId);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const { data: template, isLoading: templateLoading } = useTicketTemplate(
    eventId,
    isNew ? undefined : templateId,
  );

  const existingCanvas: string | undefined = template?.customFields?.canvas ?? undefined;
  const initialMeta = template
    ? {
        name: template.name ?? 'Nouveau tarif',
        price: Number(template.price ?? 0),
        currency: template.currency ?? 'USD',
        quantity: template.availableCount ?? template.quantity ?? 100,
        color: template.color ?? '#4f46e5',
      }
    : undefined;

  const handleSaved = (savedId: string) => {
    if (isNew) {
      // Replace the "new" URL with the real id so the user can keep editing
      router.replace(`/dashboard/events/${eventId}/tickets/template/${savedId}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm z-10">
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/tickets/template`)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Modèles
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <h1 className="text-sm font-semibold text-gray-900 truncate">
              {isNew ? 'Nouveau modèle' : (template?.name ?? 'Éditeur de billet')}
              {event?.name ? ` — ${event.name}` : ''}
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
            Définissez le design et le tarif, puis enregistrez
          </p>
        </div>

        <button
          onClick={() => setShowHelp((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
            showHelp ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
          )}
        >
          <Info className="h-4 w-4" />
          Aide
        </button>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="border-b border-indigo-100 bg-indigo-50 px-6 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 text-sm">
            <div>
              <p className="font-semibold text-indigo-800 mb-1.5">Tarif (panneau droit)</p>
              <p className="text-xs text-indigo-700">Nom, prix, devise et quantité dans le panneau Propriétés à droite.</p>
            </div>
            <div>
              <p className="font-semibold text-indigo-800 mb-1.5">Image de fond</p>
              <ol className="space-y-0.5 text-xs text-indigo-700 list-decimal list-inside">
                <li>Bouton "Fond" dans la barre d'outils</li>
                <li>Sélectionnez PNG/JPG</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold text-indigo-800 mb-1.5">QR Code</p>
              <ol className="space-y-0.5 text-xs text-indigo-700 list-decimal list-inside">
                <li>Outil QR dans la barre d'outils</li>
                <li>Glissez et redimensionnez</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold text-indigo-800 mb-1.5">Nom participant</p>
              <ol className="space-y-0.5 text-xs text-indigo-700 list-decimal list-inside">
                <li>Outil "Nom participant" (icône personne)</li>
                <li>Positionnez sur le canvas</li>
                <li>Le nom apparaît dans le PDF nominatif</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {templateLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="text-sm text-gray-500">Chargement…</p>
            </div>
          </div>
        ) : (
          <TicketEditor
            eventId={eventId}
            templateId={isNew ? undefined : templateId}
            initialData={existingCanvas}
            initialMeta={initialMeta}
            onSaved={handleSaved}
          />
        )}
      </div>
    </div>
  );
}
