'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react';
import { useResendVerification } from '@/hooks/useAuth';
import { authApi } from '@/lib/api';
import { AuthShell, authButton } from '@/components/site/AuthShell';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const email = searchParams.get('email') ?? '';
  const { mutate: resend, isPending } = useResendVerification();

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    setStatus('verifying');
    authApi.verifyEmail(token)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/auth/login'), 2500);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err?.response?.data?.message ?? 'Lien invalide ou expiré.');
      });
  }, [token, router]);

  const footer = (
    <p>
      <a href="/auth/login" className="font-semibold text-black underline underline-offset-4">Retour à la connexion</a>
    </p>
  );

  if (token) {
    const view = {
      idle: { title: 'Vérification', text: '', icon: <Loader2 className="h-12 w-12 animate-spin text-black" strokeWidth={1.5} /> },
      verifying: { title: 'Vérification', text: 'Nous vérifions votre adresse e-mail…', icon: <Loader2 className="h-12 w-12 animate-spin text-black" strokeWidth={1.5} /> },
      success: { title: 'E-mail vérifié', text: 'Votre compte est activé. Redirection vers la connexion…', icon: <CheckCircle2 className="h-12 w-12 text-black" strokeWidth={1.5} /> },
      error: { title: 'Lien invalide', text: errorMsg, icon: <XCircle className="h-12 w-12 text-red-600" strokeWidth={1.5} /> },
    }[status];
    return (
      <AuthShell title={view.title} subtitle={view.text} headline="Transformez vos événements en expériences inoubliables !" footer={footer}>
        {view.icon}
      </AuthShell>
    );
  }

  const address = email ? decodeURIComponent(email) : '';
  return (
    <AuthShell
      title="Vérifiez vos e-mails"
      subtitle={`Un lien de vérification a été envoyé${address ? ` à ${address}` : ''}. Cliquez dessus pour activer votre compte.`}
      headline="Transformez vos événements en expériences inoubliables !"
      footer={footer}
    >
      <div className="space-y-6">
        <MailCheck className="h-12 w-12 text-black" strokeWidth={1.5} />
        <p className="text-[#555]">Vous ne l&apos;avez pas reçu ? Regardez dans vos courriers indésirables, ou renvoyez-le.</p>
        <button
          type="button"
          onClick={() => address && resend(address)}
          disabled={isPending || !address}
          className={authButton}
        >
          {isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours…</> : 'Renvoyer l’e-mail'}
        </button>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
