'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { publicApi } from '@/lib/api';

const COUNTRIES = [
  'RD Congo', 'Congo-Brazzaville', 'Angola', 'Cameroun', "Côte d'Ivoire", 'Sénégal', 'Gabon',
  'Rwanda', 'Burundi', 'France', 'Belgique', 'Canada', 'Autre pays',
];
const PROFILES = ["Organisateur d'événements", 'Participant', 'Partenaire / sponsor', 'Média / presse', 'Autre'];

const field = 'w-full border-0 border-b border-[#9a9a9a] bg-transparent px-0.5 pb-2 pt-1 text-lg text-black placeholder:text-[#707070] focus:border-black focus:outline-none focus:ring-0';

/** "Parle-nous" form: underlined fields, sent to the ZAYA team by email */
export function ContactForm() {
  const [form, setForm] = useState({
    lastName: '', firstName: '', email: '', company: '', country: '', profile: '', message: '', newsletter: false, website: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.message.trim().length < 10) {
      setError('Expliquez-nous en quelques mots pourquoi vous nous contactez.');
      return;
    }
    setStatus('sending');
    try {
      await publicApi.sendContact({
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        email: form.email.trim(),
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
        <p className="text-2xl text-black">Merci {form.firstName}, votre message est bien parti.</p>
        <p className="text-[#555]">Notre équipe vous répond par email à {form.email} dans les plus brefs délais.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-14 lg:space-y-[88px]">
      <input value={form.lastName} onChange={set('lastName')} required maxLength={80} placeholder="Nom" autoComplete="family-name" className={field} />
      <input value={form.firstName} onChange={set('firstName')} required maxLength={80} placeholder="Prénom" autoComplete="given-name" className={field} />
      <input type="email" value={form.email} onChange={set('email')} required maxLength={160} placeholder="Email" autoComplete="email" className={field} />
      <input value={form.company} onChange={set('company')} maxLength={120} placeholder="Entreprise" autoComplete="organization" className={field} />

      <div className="relative">
        <select value={form.country} onChange={set('country')} className={`${field} appearance-none pr-8 ${form.country ? '' : 'text-[#707070]'}`}>
          <option value="">Vous nous écrivez depuis</option>
          {COUNTRIES.map(c => <option key={c} value={c} className="text-black">{c}</option>)}
        </select>
        <span className="pointer-events-none absolute bottom-3 right-1 h-0 w-0 border-x-[13px] border-t-[18px] border-x-transparent border-t-black" />
      </div>

      <div className="relative">
        <select value={form.profile} onChange={set('profile')} className={`${field} appearance-none pr-8 ${form.profile ? '' : 'text-[#707070]'}`}>
          <option value="">Vous êtes</option>
          {PROFILES.map(p => <option key={p} value={p} className="text-black">{p}</option>)}
        </select>
        <span className="pointer-events-none absolute bottom-3 right-1 h-0 w-0 border-x-[13px] border-t-[18px] border-x-transparent border-t-black" />
      </div>

      <div className="space-y-6 !mt-14">
        <label htmlFor="contact-message" className="block text-lg text-[#707070]">Expliquez-nous pourquoi vous nous contactez</label>
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
            {status === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Envoyer'}
          </button>
        </div>
      </div>
    </form>
  );
}
