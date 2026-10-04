'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { subscriptionApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

/** Free trial used up: tells why creating is refused and where to choose a plan */
export function TrialBanner() {
  const role = useAuthStore(s => s.user?.role);
  const concerned = role === 'ORGANIZER' || role === 'ADMIN';
  const { data } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionApi.getMySubscription().then(r => r.data.data),
    enabled: concerned,
    staleTime: 60_000,
  });
  if (!concerned || !data?.limits?.trialOver) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#FFDD00] px-4 py-2.5 text-sm text-black md:px-5 lg:px-6">
      <Lock className="h-4 w-4 flex-shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Votre essai gratuit est terminé.</span>{' '}
        Vous pouvez consulter vos données, mais plus rien créer ni modifier tant qu’un plan n’est pas choisi.
      </p>
      <Link href="/dashboard/subscription#plans" className="rounded-full bg-black px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-85">
        Choisir un plan
      </Link>
    </div>
  );
}
