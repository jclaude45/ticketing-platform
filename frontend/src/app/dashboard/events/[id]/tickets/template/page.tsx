'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Edit2, Loader2, Palette, Plus, Trash2 } from 'lucide-react';
import { eventsApi } from '@/lib/api';
import { useTicketTemplates, useDeleteTemplate } from '@/hooks/useTickets';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ViewToggle, useViewMode } from '@/components/common/ViewToggle';
import { cn, formatMoney, formatNumber } from '@/lib/utils';
import { tariffDaysLabel } from '@/components/site/format';

interface Template {
  id: string;
  name: string;
  price: number | string;
  currency: string;
  quantity?: number;
  availableCount?: number;
  color?: string;
  customFields?: { preview?: string } | null;
  validDays?: string[];
}

/** Sold = issued from the tariff's stock */
function sales(t: Template) {
  const total = t.quantity ?? 0;
  const sold = Math.max(0, total - (t.availableCount ?? total));
  return { total, sold, pct: total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0 };
}

const priceLabel = (t: Template) => (Number(t.price ?? 0) === 0 ? 'Gratuit' : formatMoney(Number(t.price), t.currency || 'USD'));

function FillBar({ pct }: { pct: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div
        className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-[#FFDD00]' : 'bg-black dark:bg-white')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function DesignBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black shadow-sm">Design prêt</span>
  ) : (
    <span className="rounded-full bg-[#FFDD00] px-2.5 py-1 text-[11px] font-semibold text-black shadow-sm">À concevoir</span>
  );
}

function Preview({ t, className }: { t: Template; className?: string }) {
  const preview = t.customFields?.preview;
  return (
    <div className={cn('relative overflow-hidden bg-[#F2F2F2] dark:bg-gray-800', className)}>
      {preview ? (
        <img src={preview} alt="" loading="lazy" className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Palette className="h-1/3 w-1/3 max-h-12 max-w-12 text-gray-300 dark:text-gray-600" strokeWidth={1.4} />
        </div>
      )}
    </div>
  );
}

export default function TicketTemplatesListPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const [view, setView] = useViewMode('zaya_templates_view');
  const [toDelete, setToDelete] = useState<Template | null>(null);

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await eventsApi.get(eventId);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const { data, isLoading } = useTicketTemplates(eventId);
  const templates = (data ?? []) as Template[];
  const deleteTemplate = useDeleteTemplate(eventId);
  const base = `/dashboard/events/${eventId}/tickets/template`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modèles de billets"
        description={`Un modèle par tarif (VIP, Standard, Gratuit…)${event?.name ? ` · ${event.name}` : ''}`}
        actions={
          <Link href={`${base}/new`} className="btn-primary gap-2">
            <Plus className="h-4 w-4" />
            Nouveau modèle
          </Link>
        }
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border-b border-gray-200 py-16 text-center dark:border-gray-800">
          <Palette className="h-12 w-12 text-gray-300" strokeWidth={1.4} />
          <div>
            <p className="font-medium text-black dark:text-white">Aucun tarif défini</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
              Ajoutez d&apos;abord des tarifs en modifiant l&apos;événement, puis revenez ici pour concevoir leurs billets.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={`/dashboard/events/${eventId}/edit`} className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-black hover:text-black dark:border-gray-700 dark:text-gray-300">
              Modifier l&apos;événement
            </Link>
            <Link href={`${base}/new`} className="btn-primary gap-2">
              <Plus className="h-4 w-4" />
              Concevoir un modèle
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {templates.length} modèle{templates.length > 1 ? 's' : ''}
              {' · '}
              {templates.filter(t => !t.customFields?.preview).length} à concevoir
            </p>
            <ViewToggle value={view} onChange={setView} />
          </div>

          {view === 'grid' ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
              {templates.map(t => {
                const s = sales(t);
                return (
                  <div key={t.id} className="group relative">
                    <Link href={`${base}/${t.id}`} className="block" aria-label={`Éditer ${t.name}`}>
                      <div className="relative">
                        <Preview t={t} className="aspect-[16/9] rounded-[18px]" />
                        <span className="absolute left-3 top-3"><DesignBadge ready={!!t.customFields?.preview} /></span>
                      </div>
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-normal text-black dark:text-white">
                            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20" style={{ backgroundColor: t.color ?? '#181818' }} />
                            <span className="truncate">{t.name}</span>
                          </h3>
                          <span className="flex-shrink-0 text-[15px] font-semibold text-black dark:text-white">{priceLabel(t)}</span>
                        </div>
                        {tariffDaysLabel(t.validDays) && (
                          <p className="text-xs font-medium text-black dark:text-white">{tariffDaysLabel(t.validDays)}</p>
                        )}
                        <p className="flex justify-between text-xs text-gray-500">
                          <span>Billets émis</span>
                          <span>{formatNumber(s.sold)} / {formatNumber(s.total)}</span>
                        </p>
                        <FillBar pct={s.pct} />
                      </div>
                    </Link>

                    <div className="absolute right-3 top-3 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <Link href={`${base}/${t.id}`} title="Éditer" aria-label="Éditer" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-black shadow-sm hover:bg-white">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Link>
                      <button type="button" onClick={() => setToDelete(t)} title="Supprimer" aria-label="Supprimer" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-sm hover:bg-white">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="hidden grid-cols-[minmax(0,1fr)_140px_200px_88px] gap-6 border-b border-gray-200 px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-gray-400 md:grid dark:border-gray-800">
                <span>Modèle</span>
                <span>Prix</span>
                <span>Billets émis</span>
                <span />
              </div>
              {templates.map(t => {
                const s = sales(t);
                return (
                  <div
                    key={t.id}
                    className="group grid grid-cols-[minmax(0,1fr)_88px] items-center gap-4 border-b border-gray-200 px-1 py-3 transition-colors hover:bg-gray-50 md:grid-cols-[minmax(0,1fr)_140px_200px_88px] md:gap-6 dark:border-gray-800 dark:hover:bg-gray-900"
                  >
                    <Link href={`${base}/${t.id}`} className="flex min-w-0 items-center gap-3.5">
                      <Preview t={t} className="h-12 w-[86px] flex-shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[15px] font-semibold text-black dark:text-white">
                          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20" style={{ backgroundColor: t.color ?? '#181818' }} />
                          <span className="truncate">{t.name}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {t.customFields?.preview ? 'Design prêt' : <span className="font-medium text-black dark:text-white">À concevoir</span>}
                          {tariffDaysLabel(t.validDays) && <span> · {tariffDaysLabel(t.validDays)}</span>}
                          <span className="md:hidden"> · {priceLabel(t)} · {formatNumber(s.sold)}/{formatNumber(s.total)}</span>
                        </p>
                      </div>
                    </Link>
                    <p className="hidden text-sm text-black md:block dark:text-white">{priceLabel(t)}</p>
                    <div className="hidden space-y-1.5 md:block">
                      <p className="text-sm text-black dark:text-white">
                        {formatNumber(s.sold)} <span className="text-gray-400">/ {formatNumber(s.total)}</span>
                      </p>
                      <FillBar pct={s.pct} />
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setToDelete(t)} title="Supprimer" aria-label={`Supprimer ${t.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Link href={`${base}/${t.id}`} title="Éditer" aria-label={`Éditer ${t.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-black dark:hover:bg-gray-800 dark:hover:text-white">
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { if (toDelete) deleteTemplate.mutate(toDelete.id); setToDelete(null); }}
        title="Supprimer le modèle"
        description={toDelete ? `Supprimer le modèle « ${toDelete.name} » ? Cette action est irréversible.` : ''}
        confirmLabel="Supprimer"
        variant="danger"
        isLoading={deleteTemplate.isPending}
      />
    </div>
  );
}
