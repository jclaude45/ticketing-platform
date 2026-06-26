import type { Metadata } from 'next';
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup';

export const metadata: Metadata = { title: 'Activer la double authentification' };

export default function Setup2FAPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Activer la double authentification</h1>
          <p className="text-indigo-200 mt-2">Ajoutez une couche de sécurité supplémentaire à votre compte</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-5 sm:p-8">
          <TwoFactorSetup />
        </div>
      </div>
    </div>
  );
}
