'use client';

import { useEffect, useState } from 'react';
import { Briefcase, X } from 'lucide-react';
import { switchWorkspace, takePendingWorkspace } from '@/lib/auth';
import { useWorkspace, PERMISSION_LABELS } from '@/hooks/useWorkspace';

const DISMISS_KEY = 'zaya_workspace_hint_dismissed';

/**
 * Inside a workspace: always shows whose account this is.
 * In my own account: opens the workspace from an invitation link, otherwise points out
 * the accounts I was given access to (easy to miss in the account menu).
 */
export function WorkspaceBanner() {
  const { workspaces, current, isInWorkspace } = useWorkspace();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1'); } catch { setDismissed(false); }
  }, []);

  useEffect(() => {
    if (isInWorkspace || !workspaces.length) return;
    const pending = takePendingWorkspace();
    if (pending && workspaces.some((w) => w.ownerId === pending)) switchWorkspace(pending);
  }, [isInWorkspace, workspaces]);

  if (isInWorkspace) {
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

  if (!workspaces.length || dismissed) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <Briefcase className="hidden h-4 w-4 flex-shrink-0 sm:block" />
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
        {workspaces.map((w) => (
          <span key={w.ownerId} className="inline-flex flex-wrap items-center gap-2">
            <span>
              <strong>{w.ownerName || w.ownerEmail}</strong> vous a donné accès à son compte ({PERMISSION_LABELS[w.permission]})
            </span>
            <button
              onClick={() => switchWorkspace(w.ownerId)}
              className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Ouvrir son espace
            </button>
          </span>
        ))}
      </div>
      <button
        onClick={() => { setDismissed(true); try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } }}
        className="self-end rounded p-1 text-amber-700 hover:bg-amber-100 sm:self-auto"
        aria-label="Masquer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
