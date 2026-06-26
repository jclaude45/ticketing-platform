import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Mot de passe oublié ?</h1>
          <p className="text-indigo-200 mt-2">Entrez votre email et nous vous enverrons un lien de réinitialisation</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-5 sm:p-8">
          <ForgotPasswordForm />
        </div>
        <p className="text-center text-indigo-200 text-sm mt-6">
          <a href="/auth/login" className="text-indigo-300 hover:text-white font-semibold underline underline-offset-2 transition-colors">
            Retour à la connexion
          </a>
        </p>
      </div>
    </div>
  );
}
