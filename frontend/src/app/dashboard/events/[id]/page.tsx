'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle, BarChart3, Calendar, CheckCircle2, Edit, FolderKanban, Globe, Lock, Mail, MapPin,
  Play, Ticket, Trash2, Users, X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEvent, useDeleteEvent, usePublishEvent, useCancelEvent } from '@/hooks/useEvents';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { StatsCard } from '@/components/analytics/StatsCard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatDate, formatNumber, getStatusColor } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { projectApi, subscriptionApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface ProjectMember {
  id: string;
  userId: string;
  projectRole: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);
  const deleteEvent = useDeleteEvent();
  const publishEvent = usePublishEvent();
  const cancelEvent = useCancelEvent();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { user } = useAuthStore();

  // Fetch the current user's project membership for this event
  const { data: membershipData } = useQuery({
    queryKey: ['project-members', id],
    queryFn: async () => {
      try {
        const res = await projectApi.getMembers(id);
        return res.data.data as { members: ProjectMember[]; invitations: any[] };
      } catch {
        return { members: [], invitations: [] };
      }
    },
    enabled: !!id,
  });

  const myMembership = membershipData?.members.find(m => m.userId === user?.id);
  const isContributor = myMembership?.projectRole === 'CONTRIBUTOR';
  const isManager = myMembership?.projectRole === 'MANAGER';

  const { data: subLimits } = useQuery({
    queryKey: ['my-subscription-limits'],
    queryFn: () => subscriptionApi.getMySubscription().then(r => (r.data as any).data.limits),
    staleTime: 30_000,
  });
  const communicationAllowed: boolean = subLimits?.allowCommunication ?? false;

  if (isLoading) return <PageLoader text="Chargement de l'événement..." />;
  if (!event) return <div className="text-center py-12 text-gray-500">Événement introuvable</div>;

  const ticketsIssued = event._count?.tickets ?? 0;
  const occupancy = event.totalCapacity > 0
    ? Math.round((ticketsIssued / event.totalCapacity) * 100)
    : 0;

  const hasTemplates = (event.ticketTemplates?.length ?? 0) > 0;

  // ── Vue restreinte pour les COLLABORATEURs ──────────────────────────────────
  if (isContributor) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/dashboard/events" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Événements</Link>
          <span>/</span>
          <span className="text-gray-900 dark:text-white font-medium">{event.name}</span>
        </nav>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="relative h-52 bg-gradient-to-br from-indigo-600 to-purple-700">
            {event.bannerUrl && (
              <img src={event.bannerUrl} alt={event.name} className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-4 left-6">
              <span className={cn('badge text-xs font-semibold mb-2 inline-block', getStatusColor(event.status))}>
                {event.status}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{event.name}</h1>
            </div>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-indigo-500" />
                {formatDate(event.startDate)}
                {event.endDate && ` – ${formatDate(event.endDate)}`}
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-indigo-500" />
                {event.venue}, {event.city}, {event.country}
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{event.description}</p>

            {/* Info banner */}
            <div className="flex items-start gap-3 mb-6 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
              <FolderKanban className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-indigo-800 dark:text-indigo-300">
                Vous avez accès uniquement à la <strong>gestion de projet</strong> de cet événement en tant que Collaborateur.
              </p>
            </div>

            <Link
              href={`/dashboard/events/${id}/project`}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-sm"
            >
              <FolderKanban className="h-4 w-4" />
              Accéder au projet
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Vue complète (organisateur / ADMIN / MANAGER) ────────────────────────────
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/dashboard/events" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Events</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white font-medium">{event.name}</span>
      </nav>

      {/* Hero card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="relative h-52 bg-gradient-to-br from-indigo-600 to-purple-700">
          {event.bannerUrl && (
            <img src={event.bannerUrl} alt={event.name} className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
            <div>
              <span className={cn('badge text-xs font-semibold mb-2 inline-block', getStatusColor(event.status))}>
                {event.status}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{event.name}</h1>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-indigo-500" />
              {formatDate(event.startDate)}
              {event.endDate && ` – ${formatDate(event.endDate)}`}
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-indigo-500" />
              {event.venue}, {event.city}, {event.country}
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-indigo-500" />
              Capacité : {formatNumber(event.totalCapacity)}
            </div>
          </div>

          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{event.description}</p>

          {/* Warning: no ticket templates */}
          {event.status === 'DRAFT' && !hasTemplates && (
            <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-medium">Template requis pour publier.</span>{' '}
                Crée d'abord un{' '}
                <Link href={`/dashboard/events/${id}/tickets/template`} className="underline hover:no-underline">
                  template de ticket
                </Link>
                .
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Edit — visible pour organisateur et MANAGER */}
            <Link
              href={`/dashboard/events/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Edit className="h-4 w-4" />Modifier
            </Link>
            <Link
              href={`/dashboard/events/${id}/tickets`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <Ticket className="h-4 w-4" />Billets
            </Link>
            <Link
              href={`/dashboard/events/${id}/analytics`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              <BarChart3 className="h-4 w-4" />Analytique
            </Link>
            <Link
              href={`/dashboard/events/${id}/team`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
            >
              <Users className="h-4 w-4" />Équipe
            </Link>
            <Link
              href={`/dashboard/events/${id}/project`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
            >
              <FolderKanban className="h-4 w-4" />Projet
            </Link>
            <Link
              href={`/dashboard/events/${id}/communication`}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                communicationAllowed
                  ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/50'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
              title={communicationAllowed ? undefined : 'Non disponible dans votre plan actuel'}
            >
              <Mail className="h-4 w-4" />
              Communication
              {!communicationAllowed && (
                <Lock className="h-3.5 w-3.5 ml-0.5 opacity-70" />
              )}
            </Link>
            {/* Publish / Cancel / Delete — uniquement pour l'organisateur réel (pas les MANAGERs invités) */}
            {!isManager && event.status === 'DRAFT' && (
              <button
                onClick={() => publishEvent.mutate(id)}
                disabled={publishEvent.isPending || !hasTemplates}
                title={!hasTemplates ? 'Créez un template de ticket avant de publier' : undefined}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Globe className="h-4 w-4" />Publier
              </button>
            )}
            {!isManager && event.status === 'PUBLISHED' && (
              <button
                onClick={() => setCancelOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
              >
                <X className="h-4 w-4" />Annuler
              </button>
            )}
            {!isManager && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors ml-auto"
              >
                <Trash2 className="h-4 w-4" />Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Billets émis"
          value={formatNumber(ticketsIssued)}
          icon={<Ticket className="h-5 w-5" />}
          color="indigo"
        />
        <StatsCard
          title="Occupation"
          value={`${occupancy}%`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="green"
        />
        <StatsCard
          title="Capacité"
          value={formatNumber(event.totalCapacity)}
          icon={<Users className="h-5 w-5" />}
          color="purple"
        />
        <StatsCard
          title="Disponible"
          value={formatNumber(event.totalCapacity - ticketsIssued)}
          icon={<BarChart3 className="h-5 w-5" />}
          color={occupancy >= 90 ? 'red' : occupancy >= 70 ? 'yellow' : 'blue'}
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Design du billet', href: `/dashboard/events/${id}/tickets/template`, icon: Ticket, desc: 'Éditeur visuel des billets' },
          { label: 'Générer des billets', href: `/dashboard/events/${id}/tickets/generate`, icon: Play, desc: 'Créer des billets en lot' },
          { label: 'Statistiques', href: `/dashboard/events/${id}/analytics`, icon: BarChart3, desc: 'Taux de scan et occupation' },
          { label: 'Gérer l\'équipe', href: `/dashboard/events/${id}/team`, icon: Users, desc: 'Personnel et accréditations' },
          { label: 'Gestion de projet', href: `/dashboard/events/${id}/project`, icon: FolderKanban, desc: 'Rétroplanning et budget' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
              <item.icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">{item.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
            </div>
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
