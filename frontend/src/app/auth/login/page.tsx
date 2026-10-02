import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthShell } from '@/components/site/AuthShell';

export const metadata: Metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <AuthShell
      title="Connecter"
      subtitle="Connectez-vous à votre espace organisateur."
      headline="Vos événements vous attendent."
      footer={
        <>
          <p>
            Vous n&apos;avez pas de compte ?{' '}
            <a href="/auth/register" className="font-semibold text-black underline underline-offset-4">Créer un compte</a>
          </p>
          <p>
            Vous êtes contrôleur ?{' '}
            <a href="/auth/controller-login" className="font-semibold text-black underline underline-offset-4">Espace contrôleur</a>
          </p>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
