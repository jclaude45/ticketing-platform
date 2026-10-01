'use client';

import { Briefcase } from 'lucide-react';
import { switchWorkspace } from '@/lib/auth';
import { useWorkspace, PERMISSION_LABELS } from '@/hooks/useWorkspace';

/** Always visible while working in another organizer's account. */
export function WorkspaceBanner() {
  const { current, isInWorkspace } = useWorkspace();
  if (!isInWorkspace) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
      <span className="flex items-center gap-2 min-w-0">
        <Briefcase className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">
          Vous travaillez sur le compte de <strong>{current?.ownerName ?? '…'}</strong>
          {current && <> · niveau {PERMISSION_LABELS[current.permission]}</>}
        </span>
      </span>
      <button onClick={() => switchWorkspace(null)} className="font-medium underline underline-offset-2 hover:text-indigo-700">
        Revenir à mon compte
      </button>
    </div>
  );
}
