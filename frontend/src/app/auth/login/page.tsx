import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/zaya-logo.svg" alt="ZAYA" className="w-16 h-16 rounded-2xl shadow-2xl mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">ZAYA</h1>
          <p className="text-indigo-200 mt-2">Connectez-vous à votre espace</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-5 sm:p-8">
          <LoginForm />
        </div>
        <p className="text-center text-indigo-200 text-sm mt-6">
          Vous n&apos;avez pas de compte ?{' '}
          <a href="/auth/register" className="text-indigo-300 hover:text-white font-semibold underline underline-offset-2 transition-colors">
            Créer un compte
          </a>
        </p>
      </div>
    </div>
  );
}
