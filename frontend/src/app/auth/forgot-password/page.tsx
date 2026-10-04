import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { AuthShell } from '@/components/site/AuthShell';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Indiquez votre e-mail : nous vous envoyons un lien pour en choisir un nouveau."
      headline="Transformez vos événements en expériences inoubliables !"
      footer={
        <p>
          Vous vous en souvenez ?{' '}
          <a href="/auth/login" className="font-semibold text-black underline underline-offset-4">Se connecter</a>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
