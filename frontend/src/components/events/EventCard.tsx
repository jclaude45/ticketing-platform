'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, Edit, Eye, MapPin, Ticket, Users } from 'lucide-react';
import { type Event } from '@/types';
import { cn, formatDate, getStatusColor } from '@/lib/utils';

interface EventCardProps {
  event: Event;
}

export function EventCard({ event }: EventCardProps) {
  // ticketsGenerated / ticketsScanned are not DB columns — use _count.tickets (total issued)
  // and fall back to 0 for scanned (updated in real-time via WebSocket scan events).
  const ticketsIssued = event._count?.tickets ?? 0;
  const occupancy = event.totalCapacity > 0 ? Math.round((ticketsIssued / event.totalCapacity) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-200"
    >
      {/* Cover */}
      <div className="relative h-40 bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden">
        {event.bannerUrl ? (
          <img src={event.bannerUrl} alt={event.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <Ticket className="h-24 w-24 text-white" />
          </div>
        )}
        <div className="absolute top-3 right-3">
          <span className={cn('badge text-xs font-semibold shadow-sm', getStatusColor(event.status))}>
            {event.status}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-base mb-1 line-clamp-1">
          {event.name}
        </h3>

        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{formatDate(event.startDate)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{event.venue}, {event.city}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <Ticket className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ticketsIssued}</span>
            <span className="text-xs text-gray-400">issued</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{event.totalCapacity}</span>
            <span className="text-xs text-gray-400">capacity</span>
          </div>
        </div>

        {/* Occupancy bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Occupancy</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{occupancy}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                occupancy >= 90 ? 'bg-red-500' : occupancy >= 70 ? 'bg-yellow-500' : 'bg-indigo-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${occupancy}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/dashboard/events/${event.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />View
          </Link>
          <Link
            href={`/dashboard/events/${event.id}/edit`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Edit className="h-3.5 w-3.5" />Edit
          </Link>
          <Link
            href={`/dashboard/events/${event.id}/tickets`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Ticket className="h-3.5 w-3.5" />Tickets
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
