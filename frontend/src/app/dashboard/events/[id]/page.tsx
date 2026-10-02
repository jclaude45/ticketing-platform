'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, BarChart3, Calendar, CheckCircle2, Edit, ExternalLink, FolderKanban, Globe, MapPin,
  MoreHorizontal, Palette, Play, Ticket, Trash2, Users, X,
} from 'lucide-react';
import { useDeleteEvent, usePublishEvent, useCancelEvent } from '@/hooks/useEvents';
import { useEventAccess, EVENT_STATUS_LABELS, EVENT_STATUS_STYLES } from '@/hooks/useEventAccess';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { StatsCard } from '@/components/analytics/StatsCard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ZayaLogo } from '@/components/site/ZayaLogo';
import { formatDate, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/api';

/** "…" menu of the rare, destructive actions */
function MoreMenu({ items }: { items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Plus d'actions"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          {items.map(i => (
            <button
              key={i.label}
              type="button"
              onClick={() => { setOpen(false); i.onClick(); }}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800',
                i.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200',
              )}
            >
              {i.icon}{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { event, isLoading, isContributor, isManager } = useEventAccess(id);
  const deleteEvent = useDeleteEvent();
  const publishEvent = usePublishEvent();
  const cancelEvent = useCancelEvent();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isLoading) return <PageLoader text="Chargement de l'événement..." />;
  if (!event) return <div className="py-12 text-center text-gray-500">Événement introuvable</div>;

  const ticketsIssued = event._count?.tickets ?? 0;
  const occupancy = event.totalCapacity > 0 ? Math.round((ticketsIssued / event.totalCapacity) * 100) : 0;
  const hasTemplates = (event.ticketTemplates?.length ?? 0) > 0;
  const isOwner = !isManager && !isContributor;

  const hero = (actions?: React.ReactNode) => (
    <div className="relative rounded-[28px] bg-[#181818]">
      {/* Picture clipped to the card; the "…" menu below may overflow it */}
      <div className="absolute inset-0 overflow-hidden rounded-[28px]">
        {event.bannerUrl ? (
          <img src={resolveMediaUrl(event.bannerUrl)} alt="" className="h-full w-full object-cover" />
        ) : (
          <ZayaLogo markOnly className="absolute -right-10 -top-10 text-[280px] text-white/[0.04]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
      </div>
      <div className="relative flex min-h-[260px] flex-col justify-end gap-5 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', EVENT_STATUS_STYLES[event.status] ?? 'bg-white text-black')}>
            {EVENT_STATUS_LABELS[event.status] ?? event.status}
          </span>
          <h1 className="mt-3 break-words text-3xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-[44px]">
            {event.name}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/80">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(event.startDate)}{event.endDate && ` – ${formatDate(event.endDate)}`}
            </span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue}, {event.city}</span>
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{formatNumber(event.totalCapacity)} places</span>
          </div>
        </div>
        {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );

  // ── Project contributors only reach the project ─────────────────────────────
  if (isContributor) {
    return (
      <div className="space-y-6">
        {hero()}
        <div className="flex flex-col gap-4 rounded-[24px] border border-gray-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900">
          <p className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
            <FolderKanban className="mt-0.5 h-5 w-5 flex-shrink-0 text-black dark:text-white" />
            En tant que collaborateur, vous avez accès à la gestion de projet de cet événement.
          </p>
          <Link href={`/dashboard/events/${id}/project`} className="btn-primary gap-2">
            Accéder au projet <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const pill = 'flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-opacity hover:opacity-85';
  const actions = (
    <>
      {isOwner && event.status === 'DRAFT' && (
        <button
          type="button"
          onClick={() => publishEvent.mutate(id)}
          disabled={publishEvent.isPending || !hasTemplates}
          title={!hasTemplates ? 'Ajoutez au moins un tarif avant de publier' : undefined}
          className={cn(pill, 'bg-[#FFDD00] text-black disabled:cursor-not-allowed disabled:opacity-50')}
        >
          <Globe className="h-4 w-4" />Publier
        </button>
      )}
      {event.status === 'PUBLISHED' && (
        <a href={`/billetterie/${id}`} target="_blank" rel="noopener noreferrer" className={cn(pill, 'bg-white text-black')}>
          <ExternalLink className="h-4 w-4" />Page de vente
        </a>
      )}
      <Link href={`/dashboard/events/${id}/edit`} className={cn(pill, 'bg-white/15 text-white backdrop-blur hover:bg-white/25 hover:opacity-100')}>
        <Edit className="h-4 w-4" />Modifier
      </Link>
      <MoreMenu
        items={[
          ...(isOwner && event.status === 'PUBLISHED'
            ? [{ label: "Annuler l'événement", icon: <X className="h-4 w-4" />, onClick: () => setCancelOpen(true) }]
            : []),
          ...(isOwner ? [{ label: 'Supprimer', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteOpen(true), danger: true }] : []),
        ]}
      />
    </>
  );

  const shortcuts = [
    { label: 'Design du billet', desc: 'Éditeur visuel de vos billets', href: `/dashboard/events/${id}/tickets/template`, icon: Palette },
    { label: 'Générer des billets', desc: 'Créer des billets en lot', href: `/dashboard/events/${id}/tickets/generate`, icon: Play },
    { label: 'Statistiques', desc: 'Ventes, scans et audience', href: `/dashboard/events/${id}/analytics`, icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {hero(actions)}

      {event.description && (
        <p className="max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">{event.description}</p>
      )}

      {/* Draft: what is missing before publishing */}
      {event.status === 'DRAFT' && (
        <div className="flex items-start gap-3 rounded-[20px] border border-[#FFDD00] bg-[#FFDD00]/15 p-4 text-sm text-black dark:text-white">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {!hasTemplates ? (
            <p>
              <span className="font-semibold">Au moins un tarif est requis pour publier.</span>{' '}
              <Link href={`/dashboard/events/${id}/edit`} className="underline underline-offset-2">Ajoutez des tarifs</Link>{' '}
              ou créez directement un{' '}
              <Link href={`/dashboard/events/${id}/tickets/template`} className="underline underline-offset-2">modèle de billet</Link>.
            </p>
          ) : (
            <p>
              <span className="font-semibold">Cet événement est en brouillon.</span>{' '}
              {isOwner ? 'Publiez-le pour qu\'il apparaisse sur la billetterie publique.' : "L'organisateur doit le publier pour ouvrir la vente."}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatsCard title="Billets émis" value={formatNumber(ticketsIssued)} icon={<Ticket className="h-5 w-5" />} color="indigo" />
        <StatsCard title="Occupation" value={`${occupancy}%`} icon={<CheckCircle2 className="h-5 w-5" />} color="green" />
        <StatsCard title="Capacité" value={formatNumber(event.totalCapacity)} icon={<Users className="h-5 w-5" />} color="purple" />
        <StatsCard
          title="Disponible"
          value={formatNumber(event.totalCapacity - ticketsIssued)}
          icon={<BarChart3 className="h-5 w-5" />}
          color={occupancy >= 90 ? 'red' : occupancy >= 70 ? 'yellow' : 'blue'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {shortcuts.map(s => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-center gap-4 rounded-[20px] border border-gray-200 bg-white p-4 transition-all hover:border-black hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-white"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
              <s.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-black dark:text-white">{s.label}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">{s.desc}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-black dark:group-hover:text-white" />
          </Link>
        ))}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => { deleteEvent.mutate(id); setDeleteOpen(false); }}
        title="Supprimer l'événement"
        description={`Voulez-vous vraiment supprimer "${event.name}" ? Cette action est irréversible et supprimera tous les billets associés.`}
        confirmLabel="Supprimer"
        variant="danger"
        isLoading={deleteEvent.isPending}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => { cancelEvent.mutate(id); setCancelOpen(false); }}
        title="Annuler l'événement"
        description={`Voulez-vous vraiment annuler "${event.name}" ? Les détenteurs de billets seront notifiés.`}
        confirmLabel="Annuler l'événement"
        variant="warning"
        isLoading={cancelEvent.isPending}
      />
    </div>
  );
}
