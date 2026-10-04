'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
  ArrowLeft, BarChart3, FolderKanban, LayoutGrid, Lock, Mail, Send, ShoppingBag, Ticket, Users, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEventAccess, EVENT_STATUS_LABELS } from '@/hooks/useEventAccess';

interface Tab {
  label: string;
  /** Relative to /dashboard/events/<id>; '' is the overview */
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  locked?: boolean;
}

/**
 * Menu shared by every page of an event: back link, event name and status, then one
 * row of tabs (black pill on the current one). Scrolls sideways on phones. Hidden in
 * the full-screen ticket design editor.
 */
export function EventNav() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { event, isContributor, communicationAllowed } = useEventAccess(id);

  const base = `/dashboard/events/${id}`;
  const sub = pathname.slice(base.length);
  // The visual ticket editor takes the whole screen
  if (/^\/tickets\/template\/[^/]+/.test(sub)) return null;

  const tabs: Tab[] = isContributor
    ? [
        { label: 'Aperçu', path: '', icon: LayoutGrid },
        { label: 'Projet', path: '/project', icon: FolderKanban },
      ]
    : [
        { label: 'Aperçu', path: '', icon: LayoutGrid },
        { label: 'Billets', path: '/tickets', icon: Ticket },
        { label: 'Ventes', path: '/orders', icon: Receipt },
        { label: 'Invitations', path: '/invitations', icon: Send },
        { label: 'Analytique', path: '/analytics', icon: BarChart3 },
        { label: 'Équipe', path: '/team', icon: Users },
        { label: 'Projet', path: '/project', icon: FolderKanban },
        { label: 'Communication', path: '/communication', icon: Mail, locked: !communicationAllowed },
        { label: 'Boutique', path: '/boutique', icon: ShoppingBag },
      ];

  const isActive = (t: Tab) => (t.path === '' ? sub === '' || sub === '/' : sub.startsWith(t.path));

  return (
    <div className="sticky -top-4 z-20 md:-top-5 lg:-top-6 -mx-4 -mt-4 mb-6 border-b border-gray-100 bg-white/90 px-4 pt-3 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/90 md:-mx-5 md:-mt-5 md:px-5 lg:-mx-6 lg:-mt-6 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard/events"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-black dark:hover:bg-gray-800 dark:hover:text-white"
          aria-label="Retour aux événements"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <p className="min-w-0 truncate text-[15px] font-semibold text-black dark:text-white">{event?.name ?? '…'}</p>
        {event && (
          <span className="flex-shrink-0 rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">
            {EVENT_STATUS_LABELS[event.status] ?? event.status}
          </span>
        )}
      </div>

      <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-3 [&::-webkit-scrollbar]:hidden" aria-label="Sections de l'événement">
        {tabs.map(t => {
          const active = isActive(t);
          return (
            <Link
              key={t.label}
              href={base + t.path}
              aria-current={active ? 'page' : undefined}
              title={t.locked ? 'Non disponible dans votre plan actuel' : undefined}
              className={cn(
                'flex flex-shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-black dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
                t.locked && !active && 'text-gray-400',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.locked && <Lock className="h-3 w-3 opacity-60" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
