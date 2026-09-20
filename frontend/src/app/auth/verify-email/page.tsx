'use client';

import { useSearchParams } from 'next/navigation';
import { useResendVerification } from '@/hooks/useAuth';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const { mutate: resend, isPending } = useResendVerification();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-500/20 border-2 border-indigo-400 mb-6">
          <svg className="w-10 h-10 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Vérifie ta boîte mail</h1>
        <p className="text-indigo-200 mb-6 leading-relaxed">
          Un lien de vérification a été envoyé{email ? ` à ${decodeURIComponent(email)}` : ''}. Clique sur le lien pour activer ton compte.
        </p>
        <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 mb-6">
          <p className="text-indigo-100 text-sm">Tu n&apos;as pas reçu l&apos;email ? Vérifie tes spams ou</p>
          <button
            onClick={() => email && resend(decodeURIComponent(email))}
            disabled={isPending || !email}
            className="text-indigo-300 hover:text-white underline text-sm mt-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Envoi en cours…' : 'Renvoyer l\'email de vérification'}
          </button>
        </div>
        <a href="/auth/login" className="text-indigo-300 hover:text-white text-sm underline transition-colors">
          Retour à la connexion
        </a>
      </div>
    </div>
  );
}
