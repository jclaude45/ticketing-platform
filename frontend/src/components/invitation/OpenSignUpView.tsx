'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, CalendarDays, Check, Loader2, MapPin, PartyPopper, Ticket } from 'lucide-react';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { takeCaptcha } from '@/lib/captcha';
import { Captcha } from '@/components/auth/Captcha';
import { capitalize, formatEventDayTime } from '@/components/site/format';
import { QuestionFields, underline, type Answers, type Field } from './GuestRsvpView';

interface OpenPage {
  event: { name: string; startDate: string; endDate: string; timeZone?: string; venue: string; address?: string | null; city: string; bannerUrl?: string | null; organizer: string };
  category: string;
  form: { intro: string | null; askPhone: 'HIDDEN' | 'OPTIONAL' | 'REQUIRED'; deadline: string; fields: Field[] };
  state: 'OPEN' | 'CLOSED' | 'FULL' | 'CANCELLED';
}

const unwrap = (r: any) => (r.data?.data ?? r.data);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared invitation link (the same QR on every paper invitation): the guest gives their name and
 * address, answers the questions and gets their ticket by e-mail.
 */
export function OpenSignUpView({ token }: { token: string }) {
  const { data, isLoading, error, refetch } = useQuery<OpenPage>({
    queryKey: ['open-invitation', token],
    queryFn: () => publicApi.getOpenInvitation(token).then(unwrap),
    retry: (n, e: any) => e?.response?.status !== 404 && n < 2,
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [formError, setFormError] = useState('');

  const send = useMutation({
    mutationFn: () => publicApi.signUpOpenInvitation(token, {
      name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, answers, captcha: takeCaptcha(),
    }).then(unwrap) as Promise<{ ok: true; email: string }>,
    onSuccess: () => { setFormError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setFormError(Array.isArray(m) ? m[0] : m || 'Une erreur est survenue. Réessayez.');
      refetch();
    },
  });

  if (isLoading) return <div className="flex justify-center py-40"><Loader2 className="h-8 w-8 animate-spin text-[#999]" /></div>;
  if (error || !data) {
    const notFound = (error as any)?.response?.status === 404;
    return (
      <div className="mx-auto max-w-[560px] px-6 py-32 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-[#999]" strokeWidth={1.5} />
        <p className="t-title mt-5 text-[28px]">{notFound ? 'Invitation introuvable' : 'Impossible de charger l’invitation'}</p>
        <p className="t-lead mt-3 text-[#555]">
          {notFound ? 'Ce QR code n’est plus valable. Contactez l’organisateur.' : 'Vérifiez votre connexion puis réessayez.'}
        </p>
      </div>
    );
  }

  const { event, form, state } = data;
  const needPhone = form.askPhone === 'REQUIRED';
  const missing = !name.trim() || !EMAIL_RE.test(email.trim()) || (needPhone && !phone.trim())
    || form.fields.some((f) => f.required && (answers[f.id] === undefined || answers[f.id] === ''));
  const set = (id: string, v: string | boolean | undefined) =>
    setAnswers((a) => { const next = { ...a }; if (v === undefined || v === '') delete next[id]; else next[id] = v; return next; });

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-24 pt-8 lg:pt-16">
      {event.bannerUrl && (
        <div className="relative aspect-[16/9] overflow-hidden rounded-[20px] bg-[#eee]">
          <Image src={resolveMediaUrl(event.bannerUrl)!} alt={event.name} fill priority sizes="(min-width: 768px) 720px, 100vw" className="object-cover" />
        </div>
      )}
      <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-[#777]">
        {event.organizer ? `${event.organizer} vous invite` : 'Vous êtes invité(e)'}
      </p>
      <h1 className="t-title mt-2 break-words text-[32px] lg:text-[40px]">{event.name}</h1>
      <div className="t-lead mt-4 space-y-1.5 text-[#333]">
        <p className="flex items-center gap-2"><CalendarDays className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />{capitalize(formatEventDayTime(event.startDate, event.timeZone))}</p>
        <p className="flex items-center gap-2"><MapPin className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />{[event.venue, event.address, event.city].filter(Boolean).join(', ')}</p>
        {data.category && <p className="flex items-center gap-2"><Ticket className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />Invitation · {data.category}</p>}
      </div>
      {form.intro && <p className="t-lead mt-6 whitespace-pre-line">{form.intro}</p>}

      {send.isSuccess ? (
        <div className="mt-8 flex items-start gap-4 rounded-[20px] bg-[#f2f2f2] p-5">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-black text-white"><PartyPopper className="h-6 w-6" strokeWidth={1.5} /></span>
          <div>
            <p className="text-lg font-semibold">Votre présence est confirmée</p>
            <p className="mt-1 text-[15px] text-[#444]">
              Votre billet a été envoyé à {send.data.email}. Présentez son QR code à l’entrée. L’e-mail contient aussi le lien pour modifier votre réponse.
            </p>
          </div>
        </div>
      ) : state !== 'OPEN' ? (
        <div className="mt-8 flex items-start gap-4 rounded-[20px] bg-[#f2f2f2] p-5">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-black text-white"><AlertCircle className="h-6 w-6" strokeWidth={1.5} /></span>
          <div>
            <p className="text-lg font-semibold">
              {state === 'FULL' ? 'Il n’y a plus de place' : state === 'CLOSED' ? 'Les inscriptions sont closes' : 'Invitation indisponible'}
            </p>
            <p className="mt-1 text-[15px] text-[#444]">Pour toute question, contactez {event.organizer || 'l’organisateur'}.</p>
          </div>
        </div>
      ) : (
        <section className="mt-10 border-t border-black pt-8">
          <h2 className="t-heading">Confirmer ma présence</h2>
          <p className="mt-2 text-[15px] text-[#555]">Réponse possible jusqu’au {capitalize(formatEventDayTime(form.deadline, event.timeZone))}.</p>
          <div className="mt-8 space-y-7">
            <label className="block">
              <span className="text-sm font-semibold">Nom complet *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={cn(underline, 'mt-1')} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">E-mail *</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} autoComplete="email" className={cn(underline, 'mt-1')} />
              <span className="mt-1 block text-xs text-[#777]">Votre billet sera envoyé à cette adresse.</span>
            </label>
            {form.askPhone !== 'HIDDEN' && (
              <label className="block">
                <span className="text-sm font-semibold">Téléphone{needPhone ? ' *' : ''}</span>
                <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" placeholder="089… ou +243…" className={cn(underline, 'mt-1')} />
              </label>
            )}
            <QuestionFields fields={form.fields} answers={answers} set={set} />
          </div>
          <Captcha className="mt-8" />
          {formError && <p className="mt-6 flex items-start gap-2 text-[15px] text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />{formError}</p>}
          <button type="button" disabled={send.isPending}
            onClick={() => { if (missing) { setFormError('Complétez les champs marqués d’un astérisque.'); return; } send.mutate(); }}
            className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-8 text-base font-bold uppercase text-white transition-opacity hover:opacity-85 disabled:opacity-60">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Je confirme ma présence
          </button>
        </section>
      )}

      <p className="mt-16 text-sm text-[#777]">
        Une question sur l’événement ? Contactez {event.organizer || 'l’organisateur'}. Billetterie par{' '}
        <Link href="/billetterie" className="underline underline-offset-2">ZAYA</Link>.
      </p>
    </div>
  );
}
