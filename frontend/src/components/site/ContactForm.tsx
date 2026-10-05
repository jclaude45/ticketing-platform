'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { publicApi } from '@/lib/api';
import { QUOTE_EVENT, QUOTE_OTHER, SERVICES } from './services';

const COUNTRIES = [
  'RD Congo', 'Congo-Brazzaville', 'Angola', 'Cameroun', "Côte d'Ivoire", 'Sénégal', 'Gabon',
  'Rwanda', 'Burundi', 'France', 'Belgique', 'Canada', 'Autre pays',
];
const PROFILES = ["Organisateur d'événements", 'Participant', 'Partenaire / sponsor', 'Média / presse', 'Autre'];

const field = 'w-full border-0 border-b border-[#9a9a9a] bg-transparent px-0.5 pb-2 pt-1 text-lg text-black placeholder:text-[#707070] focus:border-black focus:outline-none focus:ring-0';

const SERVICE_NAMES = SERVICES.map(s => s.name);

/** Underlined list with a thin chevron, like the other fields */
function Select({ value, onChange, placeholder, options, label, selectRef }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder: string;
  options: string[];
  label?: string;
  selectRef?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <div className="relative">
      <select ref={selectRef} value={value} onChange={onChange} aria-label={label ?? placeholder}
        className={`${field} cursor-pointer appearance-none truncate pr-8 ${value ? '' : 'text-[#707070]'}`}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o} className="text-black">{o}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute bottom-3 right-0.5 h-5 w-5 text-[#707070]" strokeWidth={1.75} />
    </div>
  );
}

/** "Parle-nous" form, also the quote request form: underlined fields, sent to the ZAYA team by email */
export function ContactForm() {
  const [form, setForm] = useState({
    lastName: '', firstName: '', email: '', phone: '', company: '', country: '', profile: '', service: '', message: '', newsletter: false, website: '',
  });
  const serviceRef = useRef<HTMLSelectElement>(null);
  const isQuote = !!form.service && form.service !== 'Autre demande';

  // "Demander un devis" buttons: on this page (event) or from another page (?service= / ?devis=1)
  useEffect(() => {
    const choose = (service: string) => {
      setForm(f => ({ ...f, service, profile: f.profile || "Organisateur d'événements" }));
      if (!service) setTimeout(() => serviceRef.current?.focus({ preventScroll: true }), 400);
    };
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('service');
    if (fromUrl !== null || params.get('devis')) choose(SERVICE_NAMES.includes(fromUrl ?? '') ? fromUrl! : '');
    const onQuote = (e: Event) => choose((e as CustomEvent<{ service: string }>).detail?.service ?? '');
    window.addEventListener(QUOTE_EVENT, onQuote);
    return () => window.removeEventListener(QUOTE_EVENT, onQuote);
  }, []);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.message.trim().length < 10) {
      setError(isQuote
        ? 'Décrivez votre événement en quelques mots : date, lieu, nombre de participants.'
        : 'Expliquez-nous en quelques mots pourquoi vous nous contactez.');
      return;
    }
    setStatus('sending');
    try {
      await publicApi.sendContact({
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        service: form.service || undefined,
        company: form.company.trim() || undefined,
        country: form.country || undefined,
        profile: form.profile || undefined,
        message: form.message.trim(),
        newsletter: form.newsletter,
        website: form.website || undefined,
      });
      setStatus('sent');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? 'Vérifiez les champs du formulaire.' : msg ?? "L'envoi a échoué. Réessayez dans un instant.");
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <CheckCircle2 className="h-12 w-12 text-black" strokeWidth={1.5} />
        <p className="text-2xl text-black">
          Merci {form.firstName}, {isQuote ? 'votre demande de devis est bien partie.' : 'votre message est bien parti.'}
        </p>
        <p className="text-[#555]">
          {isQuote
            ? `Notre équipe étudie votre événement et vous envoie un devis à ${form.email} dans les plus brefs délais.`
            : `Notre équipe vous répond par email à ${form.email} dans les plus brefs délais.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-10">
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
        <input value={form.lastName} onChange={set('lastName')} required maxLength={80} placeholder="Nom" autoComplete="family-name" className={field} />
        <input value={form.firstName} onChange={set('firstName')} required maxLength={80} placeholder="Prénom" autoComplete="given-name" className={field} />
        <input type="email" value={form.email} onChange={set('email')} required maxLength={160} placeholder="Email" autoComplete="email" className={field} />
        <input type="tel" value={form.phone} onChange={set('phone')} maxLength={30} placeholder="Téléphone (facultatif)" autoComplete="tel" className={field} />
        <input value={form.company} onChange={set('company')} maxLength={120} placeholder="Entreprise" autoComplete="organization" className={field} />
        <Select value={form.country} onChange={set('country')} placeholder="Vous nous écrivez depuis" options={COUNTRIES} />
        <Select value={form.profile} onChange={set('profile')} placeholder="Vous êtes" options={PROFILES} />
        <Select selectRef={serviceRef} value={form.service} onChange={set('service')} placeholder="Service souhaité (devis)"
          options={[...SERVICE_NAMES, ...QUOTE_OTHER]} label="Service souhaité" />
      </div>

      <div className="space-y-6 !mt-12">
        <label htmlFor="contact-message" className="block text-lg text-[#707070]">
          {isQuote ? 'Décrivez votre événement : date, lieu, nombre de participants, vos besoins' : 'Expliquez-nous pourquoi vous nous contactez'}
        </label>
        <textarea id="contact-message" value={form.message} onChange={set('message')} required maxLength={4000} rows={8}
          className="w-full resize-y border border-[#707070] bg-transparent p-3 text-base text-black focus:border-black focus:outline-none focus:ring-0" />

        <label className="flex cursor-pointer items-start gap-4 text-sm text-[#555]">
          <input type="checkbox" checked={form.newsletter} onChange={set('newsletter')} className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 rounded-none border-[#707070] accent-black" />
          Cochez si vous souhaitez recevoir des mises à jour de ZAYA
        </label>

        {/* honeypot — hidden from people, bots fill it */}
        <input value={form.website} onChange={set('website')} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={status === 'sending'}
            className="inline-flex min-w-[156px] items-center justify-center gap-2 rounded-full bg-black px-10 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85 disabled:opacity-60">
            {status === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" /> : isQuote ? 'Demander un devis' : 'Envoyer'}
          </button>
        </div>
      </div>
    </form>
  );
}
