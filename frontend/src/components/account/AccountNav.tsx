'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, CreditCard, Key, Lock, Shield, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Sections of the account: the settings tabs and the subscription page */
export const ACCOUNT_SECTIONS = [
  { id: 'profile', label: 'Profil', icon: User, href: '/dashboard/settings?tab=profile' },
  { id: 'security', label: 'Mot de passe', icon: Lock, href: '/dashboard/settings?tab=security' },
  { id: '2fa', label: 'Double auth.', icon: Shield, href: '/dashboard/settings?tab=2fa' },
  { id: 'keys', label: 'Clés RSA', icon: Key, href: '/dashboard/settings?tab=keys' },
  { id: 'notifications', label: 'Notifications', icon: Bell, href: '/dashboard/settings?tab=notifications' },
  { id: 'subscription', label: 'Abonnement', icon: CreditCard, href: '/dashboard/subscription' },
] as const;
export type AccountSection = typeof ACCOUNT_SECTIONS[number]['id'];

/** Left column of the account pages: who is signed in, then the sections */
export function AccountNav({ active }: { active: AccountSection }) {
  const user = useAuthStore(s => s.user);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();
  const avatar = resolveMediaUrl(user?.avatar);
  // On phones the menu scrolls sideways: bring the active section into view
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && item && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = item.offsetLeft - 16;
  }, [active]);

  return (
    <aside className="lg:w-56 lg:flex-shrink-0">
      <div className="mb-6 hidden items-center gap-3 lg:flex">
        {avatar ? (
          <img src={avatar} alt="" className="h-11 w-11 flex-shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-black text-sm font-bold text-white dark:bg-white dark:text-black">
            {initials || '?'}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black dark:text-white">{name || 'Mon compte'}</p>
          <p className="truncate text-xs text-gray-500">{user?.email}</p>
        </div>
      </div>
      <nav ref={navRef} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
        {ACCOUNT_SECTIONS.map(s => {
          const on = s.id === active;
          const Icon = s.icon;
          return (
            <Link
              key={s.id}
              href={s.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors lg:rounded-none lg:px-3 lg:py-2.5',
                on
                  ? 'bg-black font-semibold text-white lg:bg-transparent lg:text-black dark:bg-white dark:text-black lg:dark:bg-transparent lg:dark:text-white'
                  : 'text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white',
              )}
            >
              {/* Yellow mark on the active section, like the main menu */}
              {on && <span className="absolute -left-2 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-full bg-[#FFDD00] lg:block" />}
              <Icon className="h-4 w-4 flex-shrink-0" />
              {s.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
