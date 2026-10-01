'use client';

import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { getTabWorkspace } from '@/lib/auth';
import { useAuthStore } from '@/store/auth.store';
import type { Workspace, WorkspacePermission } from '@/types';

export const PERMISSION_LABELS: Record<WorkspacePermission, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  TICKETING: 'Billetterie',
  VIEWER: 'Lecture seule',
};

const RANK: Record<WorkspacePermission, number> = { VIEWER: 0, TICKETING: 1, MANAGER: 2, ADMIN: 3 };

/** Organizer accounts I collaborate on, and the one this tab currently works in. */
export function useWorkspace() {
  const { user, isAuthenticated } = useAuthStore();
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const res = await authApi.workspaces();
      return (res.data as any)?.data ?? [];
    },
    enabled: isAuthenticated && user?.role !== 'CONTROLLER',
    staleTime: 60_000,
  });

  const activeOwnerId = typeof window !== 'undefined' ? getTabWorkspace() : null;
  const current = activeOwnerId ? workspaces.find((w) => w.ownerId === activeOwnerId) ?? null : null;

  /** In my own account I can do everything; in a workspace it depends on my level. */
  const can = (needed: WorkspacePermission) => !activeOwnerId || (!!current && RANK[current.permission] >= RANK[needed]);

  return { workspaces, current, isInWorkspace: !!activeOwnerId, can };
}
