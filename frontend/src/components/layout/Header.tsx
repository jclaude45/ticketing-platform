'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bell, CheckCheck, ChevronDown, Info, LogOut, Menu, Moon,
  Search, Settings, Sun, User, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useLogout } from '@/hooks/useAuth';
import { useNotifications, type AppNotification } from '@/hooks/useNotifications';
import { getInitials } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/api';

function getPageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || last === 'dashboard') return 'Tableau de bord';
  if (last === 'events') return 'Événements';
  if (last === 'new') return 'Créer';
  if (last === 'edit') return 'Modifier';
  if (last === 'tickets') return 'Billets';
  if (last === 'template') return 'Créateur de billets';
  if (last === 'generate') return 'Générer des billets';
  if (last === 'analytics') return 'Analytique';
  if (last === 'controllers') return 'Contrôleurs';
  if (last === 'audit') return "Journaux d'audit";
  if (last === 'settings') return 'Paramètres';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

function typeIcon(type: AppNotification['type']) {
  if (type === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (type === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  if (type === 'error') return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Info className="h-3.5 w-3.5 text-indigo-500" />;
}

export function Header() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const logout = useLogout();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const pageTitle = getPageTitle(pathname);

  const toggleDark = () => {
    setDarkMode((v) => !v);
    document.documentElement.classList.toggle('dark');
  };

  const handleNotifClick = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) {
      setNotifOpen(false);
      router.push(n.link);
    }
  };

  const dropdownBase =
    'absolute right-0 top-full mt-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden transition-all duration-150 origin-top-right';
  const dropdownOpen = 'opacity-100 scale-100 pointer-events-auto';
  const dropdownClosed = 'opacity-0 scale-95 pointer-events-none';

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left: menu + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 w-48 lg:w-64">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Rechercher..."
            spellCheck={false}
            autoComplete="off"
            className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none w-full"
          />
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen((v) => !v); setUserMenuOpen(false); }}
            className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown — always in DOM, CSS-only transition (avoids AnimatePresence removeChild bug) */}
          <div className={cn(dropdownBase, 'w-80 max-w-[calc(100vw-1rem)]', notifOpen ? dropdownOpen : dropdownClosed)}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="font-semibold text-sm text-gray-900 dark:text-white">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Tout marquer lu
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="h-8 w-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Aucune notification</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
                      !n.read && 'bg-indigo-50/60 dark:bg-indigo-900/10',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex-shrink-0">{typeIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => { setUserMenuOpen((v) => !v); setNotifOpen(false); }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {user?.avatar ? (
              <img src={resolveMediaUrl(user.avatar)} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                {user ? getInitials(user.firstName, user.lastName) : 'U'}
              </div>
            )}
            <ChevronDown className={cn('h-4 w-4 text-gray-500 transition-transform hidden sm:block', userMenuOpen && 'rotate-180')} />
          </button>

          {/* Dropdown — always in DOM, CSS-only transition */}
          <div className={cn(dropdownBase, 'w-56 max-w-[calc(100vw-1rem)]', userMenuOpen ? dropdownOpen : dropdownClosed)}>
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {user ? `${user.firstName} ${user.lastName}` : 'Utilisateur'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user?.email}</p>
            </div>
            <div className="py-1">
              <Link
                href="/dashboard/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <User className="h-4 w-4" />Profil
              </Link>
              <Link
                href="/dashboard/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Settings className="h-4 w-4" />Paramètres
              </Link>
              <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                <button
                  onClick={() => { setUserMenuOpen(false); logout.mutate(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />Se déconnecter
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
