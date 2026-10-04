'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FilePen, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { eventDraftsApi, type EventDraftSummary } from '@/lib/api';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatRelativeTime } from '@/lib/utils';

/** Event forms saved before creation, to finish later */
export function EventDrafts() {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<EventDraftSummary | null>(null);
  const { data: drafts } = useQuery({ queryKey: ['event-drafts'], queryFn: eventDraftsApi.list });

  const remove = useMutation({
    mutationFn: (id: string) => eventDraftsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-drafts'] });
      toast.success('Brouillon supprimé');
    },
    onError: () => toast.error("Le brouillon n'a pas pu être supprimé"),
  });

  if (!drafts || drafts.length === 0) return null;

  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-tight text-black dark:text-white">Brouillons à terminer</h2>
        <p className="text-xs text-gray-500">{drafts.length} brouillon{drafts.length > 1 ? 's' : ''}</p>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-800">
        {drafts.map(d => {
          const href = `/dashboard/events/new?draft=${d.id}`;
          const details = [
            d.startDate ? new Date(d.startDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : null,
            [d.venue, d.city].filter(Boolean).join(', ') || null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={d.id} className="group flex items-center gap-3 border-b border-gray-200 px-1 py-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900">
              <Link href={href} className="flex min-w-0 flex-1 items-center gap-3.5">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FFDD00] text-black">
                  <FilePen className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-black dark:text-white">{d.name || 'Événement sans nom'}</p>
                  <p className="truncate text-xs text-gray-500">
                    {details ? `${details} · ` : ''}Modifié {formatRelativeTime(d.updatedAt)}
                  </p>
                </div>
              </Link>
              <Link href={href} className="hidden rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-black transition-colors hover:border-black sm:inline-flex dark:border-gray-700 dark:text-white dark:hover:border-white">
                Reprendre
              </Link>
              <button
                type="button"
                onClick={() => setToDelete(d)}
                title="Supprimer"
                aria-label={`Supprimer le brouillon ${d.name ?? ''}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <Link href={href} aria-hidden tabIndex={-1} className="flex h-9 w-9 items-center justify-center text-gray-400 sm:hidden">
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); setToDelete(null); }}
        title="Supprimer le brouillon"
        description={toDelete ? `Supprimer le brouillon « ${toDelete.name || 'Événement sans nom'} » ? Les informations saisies seront perdues.` : ''}
        confirmLabel="Supprimer"
        variant="danger"
        isLoading={remove.isPending}
      />
    </section>
  );
}
