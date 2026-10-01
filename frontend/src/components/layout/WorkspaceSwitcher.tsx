'use client';

import { Briefcase, Check, User } from 'lucide-react';
import { switchWorkspace } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useWorkspace, PERMISSION_LABELS } from '@/hooks/useWorkspace';

/** "Espaces de travail": my own account + organizer accounts I collaborate on. */
export function WorkspaceSwitcher() {
  const { workspaces, current, isInWorkspace } = useWorkspace();
  if (!workspaces.length) return null;

  const item = 'w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 py-1">
      <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Espaces de travail</p>
      <button onClick={() => isInWorkspace && switchWorkspace(null)} className={item}>
        <User className="h-4 w-4 text-gray-500 flex-shrink-0" />
        <span className="flex-1 truncate text-sm text-gray-800 dark:text-gray-200">Mon compte</span>
        {!isInWorkspace && <Check className="h-4 w-4 text-indigo-600" />}
      </button>
      {workspaces.map((w) => {
        const active = current?.ownerId === w.ownerId;
        return (
          <button key={w.ownerId} onClick={() => !active && switchWorkspace(w.ownerId)} className={item}>
            <Briefcase className={cn('h-4 w-4 flex-shrink-0', active ? 'text-indigo-600' : 'text-gray-500')} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-800 dark:text-gray-200">{w.ownerName || w.ownerEmail}</p>
              <p className="truncate text-xs text-gray-500">{PERMISSION_LABELS[w.permission]}</p>
            </div>
            {active && <Check className="h-4 w-4 text-indigo-600" />}
          </button>
        );
      })}
    </div>
  );
}
