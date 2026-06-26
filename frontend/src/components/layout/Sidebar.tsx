'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BarChart3, Calendar, ChevronLeft, ChevronRight,
  History, LayoutDashboard, LogOut, Settings,
  Shield, Ticket, Users, Zap, CreditCard, ShieldCheck, LayoutGrid, BadgeCheck,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useLogout } from '@/hooks/useAuth';
import { getInitials } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/api';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const baseNavSections: { title: string; items: NavItem[]; roles?: string[] }[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { label: 'Événements', href: '/dashboard/events', icon: Calendar },
      { label: 'Contrôleurs', href: '/dashboard/controllers', icon: Users },
    ],
  },
  {
    title: 'Aperçus',
    items: [
      { label: 'Analytique', href: '/dashboard/analytics', icon: BarChart3 },
      { label: 'Historique', href: '/dashboard/audit', icon: History },
    ],
  },
  {
    title: 'Abonnement',
    roles: ['ORGANIZER', 'ADMIN'],
    items: [
      { label: 'Mon abonnement', href: '/dashboard/subscription', icon: BadgeCheck },
    ],
  },
  {
    title: 'Super Admin',
    roles: ['SUPER_ADMIN'],
    items: [
      { label: 'Vue d\'ensemble', href: '/dashboard/admin', icon: LayoutGrid, exact: true },
      { label: 'Abonnements', href: '/dashboard/admin/subscriptions', icon: CreditCard },
    ],
  },
  {
    title: 'Compte',
    items: [
      { label: 'Paramètres', href: '/dashboard/settings', icon: Settings },
    ],
  },
  {
    title: 'Billetterie',
    items: [
      { label: 'Page publique', href: '/billetterie', icon: Ticket },
    ],
  },
];

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'sidebar-item group relative',
        isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn('flex-shrink-0 h-5 w-5', isActive ? 'text-indigo-600 dark:text-indigo-400' : '')} />
      {/* Label — always in DOM, animated width/opacity avoids AnimatePresence removeChild bug */}
      <motion.span
        animate={collapsed ? { opacity: 0, width: 0 } : { opacity: 1, width: 'auto' }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden whitespace-nowrap"
      >
        {item.label}
      </motion.span>
      {/* Active indicator — always rendered, height animated to avoid layoutId removeChild bug */}
      <motion.div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-1 bg-indigo-600 rounded-l-full"
        animate={{ height: isActive ? 24 : 0, opacity: isActive ? 1 : 0 }}
        transition={{ duration: 0.15, ease: 'easeInOut' }}
      />
    </Link>
  );
}

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const logout = useLogout();
  const navSections = baseNavSections.filter(s => !s.roles || s.roles.includes(user?.role ?? ''));

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 72 : 256 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="relative flex flex-col h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm flex-shrink-0"
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-gray-200 dark:border-gray-800', sidebarCollapsed && 'justify-center px-2')}>
        <img src="/zaya-logo.svg" alt="ZAYA" className="flex-shrink-0 w-8 h-8 rounded-lg shadow" />
        {/* Always in DOM — opacity+width transition avoids AnimatePresence removeChild bug */}
        <motion.span
          animate={sidebarCollapsed ? { opacity: 0, width: 0 } : { opacity: 1, width: 'auto' }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden whitespace-nowrap font-extrabold text-gray-900 dark:text-white text-base tracking-tight"
        >
          ZAYA
        </motion.span>
      </div>

      {/* Toggle button — desktop only */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="hidden lg:flex absolute -right-3 top-16 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 items-center justify-center shadow-sm hover:shadow-md transition-shadow z-10 text-gray-500 dark:text-gray-400"
      >
        {sidebarCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-hide py-4 px-2 space-y-6">
        {navSections.map((section) => (
          <div key={section.title}>
            {/* Always in DOM — height+opacity transition avoids AnimatePresence removeChild bug */}
            <motion.p
              animate={sidebarCollapsed ? { opacity: 0, height: 0, marginBottom: 0 } : { opacity: 1, height: 'auto', marginBottom: 6 }}
              transition={{ duration: 0.2 }}
              className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider overflow-hidden"
            >
              {section.title}
            </motion.p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className={cn('border-t border-gray-200 dark:border-gray-800 p-3', sidebarCollapsed && 'flex flex-col items-center gap-2')}>
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
            {user?.avatar ? (
              <img src={resolveMediaUrl(user.avatar)} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {user ? getInitials(user.firstName, user.lastName) : 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user ? `${user.firstName} ${user.lastName}` : 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-red-500"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            {user?.avatar ? (
              <img src={resolveMediaUrl(user.avatar)} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                {user ? getInitials(user.firstName, user.lastName) : 'U'}
              </div>
            )}
            <button
              onClick={() => logout.mutate()}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </motion.aside>
  );
}
