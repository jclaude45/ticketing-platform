'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Users } from 'lucide-react';
import { invitationApi } from '@/lib/api';

interface InvitationDetails {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  projectRole: string;
  status: string;
  event: { id: string; name: string; city: string };
  invitedBy: { firstName: string; lastName: string };
}

export default function JoinProjectPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await invitationApi.getInvitation(token);
        setDetails(res.data.data);
      } catch (e: unknown) {
        const axiosErr = e as { response?: { data?: { message?: string } } };
        setError(axiosErr?.response?.data?.message ?? 'Invitation invalide ou expirée');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setSubmitError('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 8) { setSubmitError('Le mot de passe doit faire au moins 8 caractères'); return; }
    setSubmitting(true); setSubmitError('');
    try {
      await invitationApi.acceptInvitation(token, { password });
      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setSubmitError(axiosErr?.response?.data?.message ?? 'Erreur lors de l\'acceptation');
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabel = details?.projectRole === 'MANAGER' ? 'Responsable' : 'Collaborateur';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-gray-500">Chargement de l&apos;invitation...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="h-12 w-12 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Invitation invalide</h2>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        )}

        {!loading && done && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Compte créé !</h2>
            <p className="text-sm text-gray-500">Redirection vers la page de connexion...</p>
          </div>
        )}

        {!loading && !error && !done && details && (
          <>
            <div className="flex flex-col items-center gap-2 mb-6 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Users className="h-7 w-7 text-indigo-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Rejoindre l&apos;équipe</h1>
              <p className="text-sm text-gray-500">
                <span className="font-medium">{details.invitedBy.firstName} {details.invitedBy.lastName}</span> vous invite à rejoindre le projet
              </p>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-4 py-2 mt-1">
                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">{details.event.name}</p>
                <p className="text-xs text-gray-500">{details.event.city}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Rôle : {roleLabel}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Prénom
                </label>
                <input
                  value={details.firstName} readOnly
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  value={details.email} readOnly
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Choisir un mot de passe <span className="text-red-500">*</span>
                </label>
                <input
                  type="password" required minLength={8}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Au moins 8 caractères"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirmer le mot de passe <span className="text-red-500">*</span>
                </label>
                <input
                  type="password" required
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Répéter le mot de passe"
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {submitError && <p className="text-sm text-red-600">{submitError}</p>}

              <button
                type="submit" disabled={submitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Créer mon compte et rejoindre
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-gray-400">
              Déjà un compte ?{' '}
              <a href="/login" className="text-indigo-600 hover:underline">Se connecter</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
