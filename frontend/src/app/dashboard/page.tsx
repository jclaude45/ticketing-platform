'use client';

import { motion } from 'framer-motion';
import { BarChart3, Calendar, CheckCircle2, Ticket, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { useGlobalAnalytics } from '@/hooks/useAnalytics';
import { useEvents } from '@/hooks/useEvents';
import { StatsCard } from '@/components/analytics/StatsCard';
import { PageLoader } from '@/components/common/LoadingSpinner';
import { formatDate, formatNumber, getStatusColor } from '@/lib/utils';
import { cn } from '@/lib/utils';


const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const { data: analytics, isLoading: analyticsLoading } = useGlobalAnalytics();
  const { data: eventsData, isLoading: eventsLoading } = useEvents();

  if (analyticsLoading) return <PageLoader text="Loading dashboard..." />;

  // Compute month-over-month % change; returns null when no previous data
  const mom = (analytics as any)?.mom;
  const momPct = (current: number, previous: number): { label: string; type: 'positive' | 'negative' | 'neutral' } | undefined => {
    if (previous === 0 && current === 0) return undefined;
    if (previous === 0) return { label: `+${current} ce mois`, type: 'positive' };
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return { label: '= vs mois dernier', type: 'neutral' };
    return {
      label: `${pct > 0 ? '+' : ''}${pct}%`,
      type: pct > 0 ? 'positive' : 'negative',
    };
  };

  const eventsChange   = mom ? momPct(mom.eventsThisMonth,  mom.eventsLastMonth)  : undefined;
  const ticketsChange  = mom ? momPct(mom.ticketsThisMonth, mom.ticketsLastMonth) : undefined;
  const scansChange    = mom ? momPct(mom.scansThisMonth,   mom.scansLastMonth)   : undefined;

  const stats = [
    {
      title: 'Total Events',
      value: formatNumber(analytics?.totalEvents ?? 0),
      change: eventsChange?.label,
      changeType: eventsChange?.type ?? 'neutral',
      icon: <Calendar className="h-5 w-5" />,
      color: 'indigo' as const,
    },
    {
      title: 'Total Tickets',
      value: formatNumber(analytics?.totalTickets ?? 0),
      change: ticketsChange?.label,
      changeType: ticketsChange?.type ?? 'neutral',
      icon: <Ticket className="h-5 w-5" />,
      color: 'purple' as const,
    },
    {
      title: 'Total Scans',
      value: formatNumber(analytics?.totalScans ?? 0),
      change: scansChange?.label,
      changeType: scansChange?.type ?? 'neutral',
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: 'green' as const,
    },
    {
      title: 'Avg Occupancy',
      value: `${analytics?.averageOccupancy ?? 0}%`,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'blue' as const,
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Stats grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Scan activity chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Scan Activity</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Tickets scannés par heure aujourd&apos;hui
                {analytics?.totalScans !== undefined && (
                  <span className="ml-2 font-medium text-indigo-500">
                    {analytics.scansByHour?.reduce((s, h) => s + h.count, 0) ?? 0} aujourd&apos;hui
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={(analytics?.scansByHour ?? []).map(h => ({ hour: h.hour, scans: h.count }))}
              margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1b4b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="scans" fill="url(#scanGradient)" radius={[4, 4, 0, 0]} />
              <defs>
                <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.8} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Monthly events trend */}
        <motion.div variants={itemVariants} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Events Trend</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Monthly event creation</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={analytics?.eventsByMonth ?? [{ month: 'Jan', count: 0 }]}
              margin={{ top: 0, right: 10, left: -30, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1b4b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ fill: '#6366f1', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Recent events */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Recent Events</h3>
          <Link
            href="/dashboard/events"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
          >
            View all
          </Link>
        </div>
        {eventsLoading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : eventsData?.data && eventsData.data.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {eventsData.data.slice(0, 5).map((event) => (
              <Link
                key={event.id}
                href={`/dashboard/events/${event.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {event.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDate(event.startDate)} • {event.city}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('badge text-xs', getStatusColor(event.status))}>
                    {event.status}
                  </span>
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{event.ticketsScanned}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">scanned</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Calendar className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">No events yet</p>
            <Link href="/dashboard/events/new" className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
              Create your first event
            </Link>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
