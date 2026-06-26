import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = { title: 'Réinitialiser le mot de passe' };

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Réinitialiser le mot de passe</h1>
          <p className="text-indigo-200 mt-2">Entrez votre nouveau mot de passe</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-5 sm:p-8">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
