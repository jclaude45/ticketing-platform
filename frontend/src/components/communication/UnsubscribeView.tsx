'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, MailX } from 'lucide-react';
import { publicApi } from '@/lib/api';

interface State { organizer: string; email: string; unsubscribed: boolean }

const unwrap = (r: any) => (r.data?.data ?? r.data) as State;

/** Page of the "Se désinscrire" link: one button, and the way back for those who change their mind */
export function UnsubscribeView({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['unsubscribe', token],
    queryFn: () => publicApi.getUnsubscribe(token).then(unwrap),
    retry: (n, e: any) => e?.response?.status !== 404 && n < 2,
  });
  const change = useMutation({
    mutationFn: (out: boolean) => (out ? publicApi.unsubscribe(token) : publicApi.resubscribe(token)),
    onSuccess: (_, out) => queryClient.setQueryData<State>(['unsubscribe', token], (s) => (s ? { ...s, unsubscribed: out } : s)),
  });

  if (isLoading) return <div className="flex justify-center py-40"><Loader2 className="h-8 w-8 animate-spin text-[#999]" /></div>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-32 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-[#999]" strokeWidth={1.5} />
        <p className="t-title mt-5 text-[28px]">Lien invalide</p>
        <p className="t-lead mt-3 text-[#555]">Vérifiez que vous avez ouvert le lien complet de l’e-mail.</p>
      </div>
    );
  }

  const from = data.organizer || 'cet organisateur';
  return (
    <div className="mx-auto max-w-[620px] px-6 py-24 lg:py-32">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
        {data.unsubscribed ? <Check className="h-6 w-6" /> : <MailX className="h-6 w-6" strokeWidth={1.5} />}
      </span>
      <h1 className="t-title mt-6 text-[32px] lg:text-[40px]">
        {data.unsubscribed ? 'Vous êtes désinscrit(e)' : 'Se désinscrire'}
      </h1>
      <p className="t-lead mt-4 text-[#333]">
        {data.unsubscribed
          ? <>L’adresse <strong>{data.email}</strong> ne recevra plus les e-mails de {from}. Vos billets et leurs confirmations restent envoyés normalement.</>
          : <>Ne plus recevoir les e-mails de {from} à l’adresse <strong>{data.email}</strong> ? Vos billets et leurs confirmations resteront envoyés normalement.</>}
      </p>
      {change.isError && <p className="mt-6 text-[15px] text-red-700">Une erreur est survenue. Réessayez.</p>}
      <div className="mt-8">
        {data.unsubscribed ? (
          <button type="button" onClick={() => change.mutate(false)} disabled={change.isPending} className="text-[15px] underline underline-offset-4 disabled:opacity-60">
            Je me suis trompé(e), je veux encore les recevoir
          </button>
        ) : (
          <button type="button" onClick={() => change.mutate(true)} disabled={change.isPending}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-8 text-base font-bold uppercase text-white transition-opacity hover:opacity-85 disabled:opacity-60">
            {change.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Me désinscrire
          </button>
        )}
      </div>
    </div>
  );
}
