import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { AuthShell } from '@/components/site/AuthShell';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Commencez à gérer vos événements dès aujourd'hui."
      headline="Transformez vos événements en expériences inoubliables !"
      footer={
        <p>
          Vous avez déjà un compte ?{' '}
          <a href="/auth/login" className="font-semibold text-black underline underline-offset-4">Se connecter</a>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
