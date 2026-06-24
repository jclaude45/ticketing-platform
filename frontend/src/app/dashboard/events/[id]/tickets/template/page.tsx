'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Palette, Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { eventsApi } from '@/lib/api';
import { useTicketTemplates, useDeleteTemplate } from '@/hooks/useTickets';
import { cn } from '@/lib/utils';

export default function TicketTemplatesListPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await eventsApi.get(eventId);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const { data: templates = [], isLoading } = useTicketTemplates(eventId);
  const deleteTemplate = useDeleteTemplate(eventId);

  const handleDelete = (templateId: string, name: string) => {
    if (!confirm(`Supprimer le modèle "${name}" ? Cette action est irréversible.`)) return;
    deleteTemplate.mutate(templateId);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}`)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <h1 className="text-sm font-semibold text-gray-900 truncate">
              Modèles de billets{event?.name ? ` — ${event.name}` : ''}
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Chaque modèle correspond à un tarif (VIP, Standard, Gratuit…)
          </p>
        </div>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}/tickets/template/new`)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouveau modèle
        </button>
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <Palette className="h-12 w-12 text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-600">Aucun modèle de billet</p>
            <p className="text-xs text-gray-400 mt-1">Créez un premier modèle pour commencer</p>
          </div>
          <button
            onClick={() => router.push(`/dashboard/events/${eventId}/tickets/template/new`)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Créer un modèle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(templates as any[]).map((tpl) => {
            const cf = tpl.customFields ?? {};
            const preview: string | undefined = cf.preview;
            return (
              <div
                key={tpl.id}
                className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Preview image */}
                <div className="relative h-36 overflow-hidden bg-gray-100">
                  {preview ? (
                    <img
                      src={preview}
                      alt={tpl.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Palette className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {/* Color indicator */}
                  <span
                    className="absolute left-3 top-3 h-3 w-3 rounded-full ring-2 ring-white shadow"
                    style={{ backgroundColor: tpl.color ?? '#4f46e5' }}
                  />
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 truncate">{tpl.name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-medium text-gray-800">
                      {Number(tpl.price ?? 0).toFixed(2)} {tpl.currency}
                    </span>
                    <span>·</span>
                    <span>{tpl.availableCount ?? tpl.quantity ?? 0} places</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 px-4 pb-4">
                  <button
                    onClick={() => router.push(`/dashboard/events/${eventId}/tickets/template/${tpl.id}`)}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200',
                      'px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors',
                    )}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Éditer
                  </button>
                  <button
                    onClick={() => handleDelete(tpl.id, tpl.name)}
                    disabled={deleteTemplate.isPending}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
