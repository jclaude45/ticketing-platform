'use client';

import { useQuery } from '@tanstack/react-query';
import { useEvent } from '@/hooks/useEvents';
import { projectApi, subscriptionApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface ProjectMember {
  id: string;
  userId: string;
  projectRole: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

/**
 * The event and what the current user may do with it: a project CONTRIBUTOR only sees
 * the project, a MANAGER cannot publish / cancel / delete. Shared by the event menu and
 * the overview page (same query keys, fetched once).
 */
export function useEventAccess(id: string) {
  const { user } = useAuthStore();
  const { data: event, isLoading } = useEvent(id);

  const { data: membershipData } = useQuery({
    queryKey: ['project-members', id],
    queryFn: async () => {
      try {
        const res = await projectApi.getMembers(id);
        return res.data.data as { members: ProjectMember[]; invitations: any[] };
      } catch {
        return { members: [], invitations: [] };
      }
    },
    enabled: !!id,
  });

  const { data: subLimits } = useQuery({
    queryKey: ['my-subscription-limits'],
    queryFn: () => subscriptionApi.getMySubscription().then(r => (r.data as any).data.limits),
    staleTime: 30_000,
  });

  const myMembership = membershipData?.members.find(m => m.userId === user?.id);
  return {
    event,
    isLoading,
    isContributor: myMembership?.projectRole === 'CONTRIBUTOR',
    isManager: myMembership?.projectRole === 'MANAGER',
    communicationAllowed: (subLimits?.allowCommunication ?? false) as boolean,
  };
}

export const EVENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  CANCELLED: 'Annulé',
  COMPLETED: 'Terminé',
};

export const EVENT_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-white text-black',
  PUBLISHED: 'bg-[#FFDD00] text-black',
  CANCELLED: 'bg-red-600 text-white',
  COMPLETED: 'bg-white/70 text-black',
};
