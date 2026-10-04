'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingApi } from '@/lib/api';
import { clearTokens } from '@/lib/auth';

/** Closing of the organizer's own account: personal data removed, sales kept anonymously */
export function CloseAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await billingApi.closeAccount(password);
      if (!res.closed) {
        setError(res.message ?? 'Fermeture impossible');
        return;
      }
      toast.success('Votre compte est fermé');
      clearTokens();
      window.location.href = '/auth/login';
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Fermeture impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 border-t border-gray-200 pt-6 dark:border-gray-800">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Fermer mon compte</h2>
      <p className="mt-1 max-w-xl text-sm text-gray-500">
        Vos données personnelles (nom, e-mail, photo, coordonnées de versement) sont effacées et vous ne pourrez plus vous connecter.
        Les ventes et paiements passés sont conservés sans votre nom, comme l’impose la loi. Possible une fois vos événements terminés,
        vos versements et remboursements réglés.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">
          Fermer mon compte
        </button>
      ) : (
        <div className="mt-4 max-w-sm space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Votre mot de passe pour confirmer"
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-black focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={busy || !password} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Fermer définitivement
            </button>
            <button type="button" onClick={() => { setOpen(false); setPassword(''); setError(null); }} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
