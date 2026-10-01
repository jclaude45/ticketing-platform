'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { authApi, resolveMediaUrl } from '@/lib/api';
import { switchToAccount } from '@/lib/auth';
import { getInitials } from '@/lib/utils';
import type { SessionAccount } from '@/types';

/**
 * Other accounts signed in on this browser + "Ajouter un compte".
 * Switching only affects the current tab; other tabs keep their own account.
 */
export function AccountSwitcher({ currentId, open }: { currentId?: string; open: boolean }) {
  const { data: accounts = [], isLoading } = useQuery<SessionAccount[]>({
    queryKey: ['auth', 'session-accounts'],
    queryFn: async () => {
      const res = await authApi.sessionAccounts();
      return (res.data as any)?.data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const others = accounts.filter((a) => a.id !== currentId);

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 py-1">
      {isLoading && open ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
      ) : (
        others.map((account) => {
          const [first = '', ...rest] = account.name.split(' ');
          return (
            <button
              key={account.id}
              onClick={() => switchToAccount(account.id, account.role === 'CONTROLLER' ? '/controle' : '/dashboard')}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {account.avatar ? (
                <img src={resolveMediaUrl(account.avatar)} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {getInitials(first, rest.join(' ')) || '?'}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-800 dark:text-gray-200">{account.name || account.email}</p>
                <p className="truncate text-xs text-gray-500">
                  {account.email}{account.role === 'CONTROLLER' ? ' · Contrôleur' : ''}
                </p>
              </div>
            </button>
          );
        })
      )}
      <a
        href="/auth/login"
        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <UserPlus className="h-4 w-4" />Ajouter un compte
      </a>
    </div>
  );
}
