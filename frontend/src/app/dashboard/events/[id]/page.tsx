'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle, BarChart3, Calendar, CheckCircle2, Edit, Globe, MapPin,
  Play, Ticket, Trash2, Users, X,
} from 'lucide-react';
import { useEvent, useDeleteEvent, usePublishEvent, useCancelEvent } from '@/hooks/useEvents';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { StatsCard } from '@/components/analytics/StatsCard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatDate, formatNumber, getStatusColor } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);
  const deleteEvent = useDeleteEvent();
  const publishEvent = usePublishEvent();
  const cancelEvent = useCancelEvent();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isLoading) return <PageLoader text="Loading event..." />;
  if (!event) return <div className="text-center py-12 text-gray-500">Event not found</div>;

  // ticketsGenerated / ticketsScanned are not DB columns — derive from _count.tickets
  // (_count is always included by findOne). ticketsScanned comes via WebSocket scan events.
  const ticketsIssued = event._count?.tickets ?? 0;
  const occupancy = event.totalCapacity > 0
    ? Math.round((ticketsIssued / event.totalCapacity) * 100)
    : 0;

  const hasTemplates = (event.ticketTemplates?.length ?? 0) > 0;

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
              <h1 className="text-2xl font-bold text-white">{event.name}</h1>
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
              Capacity: {formatNumber(event.totalCapacity)}
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
            <Link
              href={`/dashboard/events/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Edit className="h-4 w-4" />Edit
            </Link>
            <Link
              href={`/dashboard/events/${id}/tickets`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <Ticket className="h-4 w-4" />Tickets
            </Link>
            <Link
              href={`/dashboard/events/${id}/analytics`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              <BarChart3 className="h-4 w-4" />Analytics
            </Link>
            <Link
              href={`/dashboard/events/${id}/team`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
            >
              <Users className="h-4 w-4" />Équipe
            </Link>
            {event.status === 'DRAFT' && (
              <button
                onClick={() => publishEvent.mutate(id)}
                disabled={publishEvent.isPending || !hasTemplates}
                title={!hasTemplates ? 'Créez un template de ticket avant de publier' : undefined}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Globe className="h-4 w-4" />Publish
              </button>
            )}
            {event.status === 'PUBLISHED' && (
              <button
                onClick={() => setCancelOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
              >
                <X className="h-4 w-4" />Cancel
              </button>
            )}
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors ml-auto"
            >
              <Trash2 className="h-4 w-4" />Delete
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Tickets Generated"
          value={formatNumber(ticketsIssued)}
          icon={<Ticket className="h-5 w-5" />}
          color="indigo"
        />
        <StatsCard
          title="Occupancy"
          value={`${occupancy}%`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="green"
        />
        <StatsCard
          title="Capacity"
          value={formatNumber(event.totalCapacity)}
          icon={<Users className="h-5 w-5" />}
          color="purple"
        />
        <StatsCard
          title="Available"
          value={formatNumber(event.totalCapacity - ticketsIssued)}
          icon={<BarChart3 className="h-5 w-5" />}
          color={occupancy >= 90 ? 'red' : occupancy >= 70 ? 'yellow' : 'blue'}
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Design Ticket Template', href: `/dashboard/events/${id}/tickets/template`, icon: Ticket, desc: 'Visual editor for ticket design' },
          { label: 'Generate Tickets', href: `/dashboard/events/${id}/tickets/generate`, icon: Play, desc: 'Batch create tickets' },
          { label: 'View Analytics', href: `/dashboard/events/${id}/analytics`, icon: BarChart3, desc: 'Scan rates and occupancy' },
          { label: 'Gérer l\'équipe', href: `/dashboard/events/${id}/team`, icon: Users, desc: 'Personnel et accréditations' },
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
        title="Delete Event"
        description={`Are you sure you want to delete "${event.name}"? This action cannot be undone and will remove all associated tickets.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteEvent.isPending}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => { cancelEvent.mutate(id); setCancelOpen(false); }}
        title="Cancel Event"
        description={`Are you sure you want to cancel "${event.name}"? Ticket holders will be notified.`}
        confirmLabel="Cancel Event"
        variant="warning"
        isLoading={cancelEvent.isPending}
      />
    </div>
  );
}
