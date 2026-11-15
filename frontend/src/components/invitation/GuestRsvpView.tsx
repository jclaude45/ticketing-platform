'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, CalendarDays, Check, Loader2, MapPin, PartyPopper, Ticket, X } from 'lucide-react';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { capitalize, formatEventDayTime } from '@/components/site/format';

type Option = { id: string; label: string; left?: number };
type Field = { id: string; type: 'CHOICE' | 'TEXT' | 'YESNO'; label: string; help?: string | null; required: boolean; options?: Option[] };
type Answers = Record<string, string | boolean>;

interface GuestPage {
  event: { name: string; startDate: string; endDate: string; venue: string; address?: string | null; city: string; bannerUrl?: string | null; organizer: string };
  guest: { name: string | null; email: string | null; phone: string | null; category: string };
  form: { intro: string | null; askPhone: 'HIDDEN' | 'OPTIONAL' | 'REQUIRED'; deadline: string; fields: Field[] };
  answer: { status: 'CONFIRMED' | 'DECLINED'; answers: Answers; updatedAt: string } | null;
  state: 'OPEN' | 'CLOSED' | 'CANCELLED' | 'USED';
  ticketSent: boolean;
}

const unwrap = (r: any) => (r.data?.data ?? r.data) as GuestPage;
const errorText = (e: any) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m[0] : m || 'Une erreur est survenue. Réessayez.';
};

const underline = 'w-full border-0 border-b border-[#9a9a9a] bg-transparent px-0.5 pb-1.5 pt-1 text-[17px] text-black placeholder:text-[#9a9a9a] focus:border-black focus:outline-none focus:ring-0 disabled:text-[#777]';
const pill = (on: boolean) => cn(
  'rounded-full border px-4 py-2 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
  on ? 'border-black bg-black text-white' : 'border-[#bbb] bg-white text-black hover:border-black',
);

export function GuestRsvpView({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['guest-invitation', token],
    queryFn: () => publicApi.getInvitation(token).then(unwrap),
    retry: (n, e: any) => e?.response?.status !== 404 && n < 2,
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');

  // The form starts from what the guest already said (or the organizer's list)
  useEffect(() => {
    if (!data) return;
    setName(data.guest.name ?? '');
    setPhone(data.guest.phone ?? '');
    setAnswers(data.answer?.status === 'CONFIRMED' ? data.answer.answers : {});
    setEditing(!data.answer);
  }, [data]);

  const send = useMutation({
    mutationFn: (attending: boolean) =>
      publicApi.answerInvitation(token, attending ? { attending, name: name.trim(), phone: phone.trim() || undefined, answers } : { attending }).then(unwrap),
    onSuccess: (page) => {
      setFormError('');
      queryClient.setQueryData(['guest-invitation', token], page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => {
      setFormError(errorText(e));
      // Places may have changed meanwhile: show the current ones
      refetch();
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-40"><Loader2 className="h-8 w-8 animate-spin text-[#999]" /></div>;
  }
  if (error || !data) {
    const notFound = (error as any)?.response?.status === 404;
    return (
      <div className="mx-auto max-w-[560px] px-6 py-32 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-[#999]" strokeWidth={1.5} />
        <p className="t-title mt-5 text-[28px]">{notFound ? 'Invitation introuvable' : 'Impossible de charger votre invitation'}</p>
        <p className="t-lead mt-3 text-[#555]">
          {notFound ? 'Vérifiez que vous avez ouvert le lien complet reçu par e-mail.' : 'Vérifiez votre connexion puis réessayez.'}
        </p>
        {!notFound && <button onClick={() => refetch()} className="mt-6 rounded-full bg-black px-6 py-2.5 text-sm uppercase text-white">Réessayer</button>}
      </div>
    );
  }

  const { event, guest, form, answer, state } = data;
  const open = state === 'OPEN';
  const deadline = capitalize(formatEventDayTime(form.deadline));
  const needPhone = form.askPhone === 'REQUIRED';
  const missing = !name.trim()
    || (needPhone && !phone.trim())
    || form.fields.some((f) => f.required && (answers[f.id] === undefined || answers[f.id] === ''));

  const confirm = () => {
    if (missing) { setFormError('Complétez les champs marqués d’un astérisque.'); return; }
    send.mutate(true);
  };
  const decline = () => {
    if (window.confirm('Vous ne pourrez pas venir ? Votre place sera libérée pour un autre invité.')) send.mutate(false);
  };
  const set = (id: string, v: string | boolean | undefined) =>
    setAnswers((a) => { const next = { ...a }; if (v === undefined || v === '') delete next[id]; else next[id] = v; return next; });

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-24 pt-8 lg:pt-16">
      {/* ── Event ── */}
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
        <p className="flex items-center gap-2"><CalendarDays className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />{capitalize(formatEventDayTime(event.startDate))}</p>
        <p className="flex items-center gap-2"><MapPin className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />{[event.venue, event.address, event.city].filter(Boolean).join(', ')}</p>
        <p className="flex items-center gap-2"><Ticket className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />Invitation · {guest.category}</p>
      </div>
      {form.intro && <p className="t-lead mt-6 whitespace-pre-line">{form.intro}</p>}

      {/* ── Where the guest stands ── */}
      <StatusBox data={data} />

      {/* ── Form ── */}
      {open && (editing || answer?.status !== 'CONFIRMED') && (
        <section className="mt-10 border-t border-black pt-8">
          <h2 className="t-heading">{answer?.status === 'CONFIRMED' ? 'Modifier ma réponse' : 'Confirmer ma présence'}</h2>
          <p className="mt-2 text-[15px] text-[#555]">Réponse possible jusqu’au {deadline}.</p>

          <div className="mt-8 space-y-7">
            <label className="block">
              <span className="text-sm font-semibold">Nom complet *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={cn(underline, 'mt-1')} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">E-mail</span>
              <input value={guest.email ?? ''} disabled className={cn(underline, 'mt-1')} />
              <span className="mt-1 block text-xs text-[#777]">Votre billet sera envoyé à cette adresse.</span>
            </label>
            {form.askPhone !== 'HIDDEN' && (
              <label className="block">
                <span className="text-sm font-semibold">Téléphone{needPhone ? ' *' : ''}</span>
                <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" placeholder="089… ou +243…" className={cn(underline, 'mt-1')} />
              </label>
            )}

            {form.fields.map((f) => (
              <div key={f.id}>
                <p className="text-sm font-semibold">{f.label}{f.required ? ' *' : ''}</p>
                {f.help && <p className="mt-0.5 text-xs text-[#777]">{f.help}</p>}
                {f.type === 'TEXT' && (
                  <input value={(answers[f.id] as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} maxLength={500} className={cn(underline, 'mt-1')} />
                )}
                {f.type === 'YESNO' && (
                  <div className="mt-3 flex gap-2">
                    {[true, false].map((v) => (
                      <button key={String(v)} type="button" onClick={() => set(f.id, answers[f.id] === v && !f.required ? undefined : v)} className={pill(answers[f.id] === v)}>
                        {v ? 'Oui' : 'Non'}
                      </button>
                    ))}
                  </div>
                )}
                {f.type === 'CHOICE' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {f.options!.map((o) => {
                      const on = answers[f.id] === o.id;
                      const full = o.left === 0 && !on;
                      return (
                        <button key={o.id} type="button" disabled={full}
                          onClick={() => set(f.id, on && !f.required ? undefined : o.id)} className={pill(on)}>
                          {o.label}
                          {full ? ' · complet' : o.left !== undefined && o.left <= 10 ? ` · ${o.left} place${o.left > 1 ? 's' : ''}` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {formError && <p className="mt-6 flex items-start gap-2 text-[15px] text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />{formError}</p>}

          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <button type="button" onClick={confirm} disabled={send.isPending}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-8 text-base font-bold uppercase text-white transition-opacity hover:opacity-85 disabled:opacity-60">
              {send.isPending && send.variables === true ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {answer?.status === 'CONFIRMED' ? 'Enregistrer' : 'Je confirme ma présence'}
            </button>
            {answer?.status === 'CONFIRMED' && (
              <button type="button" onClick={() => { setEditing(false); setAnswers(answer.answers); setFormError(''); }} className="text-[15px] underline underline-offset-4">
                Annuler
              </button>
            )}
            {answer?.status !== 'DECLINED' && (
              <button type="button" onClick={decline} disabled={send.isPending} className="text-[15px] text-[#555] underline underline-offset-4 hover:text-black sm:ml-auto">
                Je ne pourrai pas venir
              </button>
            )}
          </div>
        </section>
      )}

      {/* Confirmed: a summary, with the way back to the form while answers are open */}
      {answer?.status === 'CONFIRMED' && !editing && (
        <section className="mt-10 border-t border-black pt-8">
          <h2 className="t-heading">Vos réponses</h2>
          <dl className="mt-6 space-y-3 text-[16px]">
            <Row label="Nom" value={data.guest.name ?? ''} />
            {form.askPhone !== 'HIDDEN' && data.guest.phone && <Row label="Téléphone" value={data.guest.phone} />}
            {form.fields.map((f) => <Row key={f.id} label={f.label} value={shown(f, answer.answers[f.id])} />)}
          </dl>
          {open && (
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <button type="button" onClick={() => setEditing(true)} className="h-11 rounded-full border border-black px-6 text-[15px] uppercase hover:bg-black hover:text-white">
                Modifier ma réponse
              </button>
              <button type="button" onClick={decline} disabled={send.isPending} className="text-[15px] text-[#555] underline underline-offset-4 hover:text-black sm:ml-auto">
                Je ne pourrai plus venir
              </button>
            </div>
          )}
          {open && <p className="mt-4 text-sm text-[#777]">Modifiable jusqu’au {deadline}.</p>}
        </section>
      )}

      {answer?.status === 'DECLINED' && open && (
        <div className="mt-8">
          <button type="button" onClick={() => setEditing(true)} className={cn('h-11 rounded-full border border-black px-6 text-[15px] uppercase hover:bg-black hover:text-white', editing && 'hidden')}>
            Finalement, je viens
          </button>
        </div>
      )}

      <p className="mt-16 text-sm text-[#777]">
        Une question sur l’événement ? Contactez {event.organizer || 'l’organisateur'}. Billetterie par{' '}
        <Link href="/billetterie" className="underline underline-offset-2">ZAYA</Link>.
      </p>
    </div>
  );
}

function shown(f: Field, v: string | boolean | undefined) {
  if (v === undefined) return '—';
  if (f.type === 'YESNO') return v ? 'Oui' : 'Non';
  if (f.type === 'CHOICE') return f.options?.find((o) => o.id === v)?.label ?? '—';
  return String(v);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-6">
      <dt className="text-[#777] sm:w-56 sm:flex-shrink-0">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function StatusBox({ data }: { data: GuestPage }) {
  const { answer, state, guest, ticketSent } = data;
  let icon = <Ticket className="h-6 w-6" strokeWidth={1.5} />;
  let title = '';
  let text = '';
  if (state === 'USED') {
    icon = <Check className="h-6 w-6" />; title = 'Vous êtes entré(e)'; text = 'Bonne soirée !';
  } else if (state === 'CANCELLED') {
    icon = <X className="h-6 w-6" />; title = 'Invitation annulée'; text = 'L’organisateur a annulé cette invitation.';
  } else if (answer?.status === 'CONFIRMED' || (ticketSent && !answer)) {
    icon = <PartyPopper className="h-6 w-6" strokeWidth={1.5} />;
    title = 'Votre présence est confirmée';
    text = `Votre billet a été envoyé à ${guest.email ?? 'votre adresse e-mail'} : présentez son QR code à l’entrée.`;
  } else if (answer?.status === 'DECLINED') {
    icon = <X className="h-6 w-6" />; title = 'Vous avez décliné l’invitation';
    text = state === 'OPEN' ? 'Vous changez d’avis ? Vous pouvez encore confirmer, s’il reste de la place.' : 'Merci de nous avoir prévenus.';
  } else if (state === 'CLOSED') {
    icon = <AlertCircle className="h-6 w-6" strokeWidth={1.5} />; title = 'Les réponses sont closes'; text = 'La date limite pour répondre est passée.';
  } else {
    return null;
  }
  return (
    <div className="mt-8 flex items-start gap-4 rounded-[20px] bg-[#f2f2f2] p-5">
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-black text-white">{icon}</span>
      <div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-1 text-[15px] text-[#444]">{text}</p>
      </div>
    </div>
  );
}
