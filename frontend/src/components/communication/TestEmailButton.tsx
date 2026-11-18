'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { FlaskConical, Loader2 } from 'lucide-react';
import { communicationApi } from '@/lib/api';

/**
 * Sends the design being edited to the organizer (or an address they type), filled with this
 * event's details and their own name, to check it in a real mail app before the campaign leaves.
 */
export function TestEmailButton({ eventId, subject, body }: { eventId: string; subject: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim()) { toast.error('Le contenu est vide'); return; }
    setBusy(true);
    try {
      const res = await communicationApi.sendTest({ eventId, subject, body, to: to.trim() || undefined });
      toast.success(`Mail test envoyé à ${res.data.data.to}`);
      setOpen(false);
    } catch (e: any) {
      const m = e?.response?.status === 429 ? 'Trop de mails test : réessayez dans quelques minutes.' : e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Le mail test n’a pas pu partir');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
        <FlaskConical className="h-3 w-3" />
        Envoyer un test
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-10 w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg">
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
            Le mail part tel que vos invités le recevront, avec les détails de cet événement et votre nom. L’objet commence par [TEST].
          </p>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Votre adresse (par défaut)"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="mt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
            <button type="button" onClick={send} disabled={busy}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-full text-xs font-medium disabled:opacity-60">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
