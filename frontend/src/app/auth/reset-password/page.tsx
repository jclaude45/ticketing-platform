import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { AuthShell } from '@/components/site/AuthShell';

export const metadata: Metadata = { title: 'Réinitialiser le mot de passe' };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe d’au moins 8 caractères, avec une majuscule et un chiffre."
      headline="Transformez vos événements en expériences inoubliables !"
      footer={
        <p>
          <a href="/auth/login" className="font-semibold text-black underline underline-offset-4">Retour à la connexion</a>
        </p>
      }
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
