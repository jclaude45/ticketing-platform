'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, ChevronDown } from 'lucide-react';
import { AccountSwitcher } from '@/components/layout/AccountSwitcher';
import { useAuthStore } from '@/store/auth.store';
import { useLogout } from '@/hooks/useAuth';

/** Restricted space for controllers (ticket scanners): no organizer navigation at all. */
export default function ControleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const logout = useLogout();
  const isController = user?.role === 'CONTROLLER';
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace('/auth/controller-login');
    else if (!isController) router.replace('/dashboard');
  }, [isAuthenticated, isLoading, isController, router]);

  if (isLoading || !isAuthenticated || !isController) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/controle" className="flex items-center gap-2">
            <img src="/zaya-logo.svg" alt="ZAYA" className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-gray-900">Contrôle</span>
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative min-w-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1 truncate text-sm text-gray-600 hover:text-gray-900"
              >
                <span className="truncate">{user?.firstName}</span>
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white shadow-lg">
                  <p className="px-4 pt-3 pb-2 text-xs text-gray-500 truncate">{user?.email}</p>
                  <AccountSwitcher currentId={user?.id} open={menuOpen} />
                </div>
              )}
            </div>
            <button
              onClick={() => logout.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
