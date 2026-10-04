import type { Metadata } from 'next';
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup';
import { AuthShell } from '@/components/site/AuthShell';

export const metadata: Metadata = { title: 'Activer la double authentification' };

export default function Setup2FAPage() {
  return (
    <AuthShell
      title="Double authentification"
      subtitle="Un code de votre téléphone en plus du mot de passe : personne ne peut se connecter sans lui."
      headline="Vos billets et vos ventes, bien protégés."
      footer={
        <p>
          <a href="/dashboard" className="font-semibold text-black underline underline-offset-4">Plus tard</a>
        </p>
      }
    >
      <TwoFactorSetup />
    </AuthShell>
  );
}
