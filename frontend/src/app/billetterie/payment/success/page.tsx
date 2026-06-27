'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2, Ticket, AlertCircle } from 'lucide-react';
import { publicApi } from '@/lib/api';

type Status = 'checking' | 'completed' | 'failed';

function SuccessContent() {
  const params = useSearchParams();
  const reference = params.get('reference');
  const [status, setStatus] = useState<Status>('checking');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!reference) { setStatus('failed'); return; }

    const poll = async () => {
      try {
        const res = await publicApi.getPaymentStatus(reference);
        const d = (res.data as any).data ?? res.data;
        if (d.status === 'COMPLETED') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setStatus('completed');
        } else if (d.status === 'FAILED' || d.status === 'CANCELLED') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setStatus('failed');
        }
      } catch {
        // keep polling
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 4000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [reference]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-950 dark:to-gray-900">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-6">
        {status === 'checking' && (
          <>
            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Confirmation du paiement…</h1>
            <p className="text-sm text-gray-500">Veuillez patienter pendant la validation de votre paiement.</p>
          </>
        )}

        {status === 'completed' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Paiement confirmé !</h1>
            <p className="text-sm text-gray-500">
              Vos billets ont été générés et envoyés par email. Vérifiez votre boîte de réception.
            </p>
            <Link
              href="/billetterie"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all"
            >
              <Ticket className="h-4 w-4" />
              Retour à la billetterie
            </Link>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Échec du paiement</h1>
            <p className="text-sm text-gray-500">Le paiement n&apos;a pas pu être confirmé. Aucun montant n&apos;a été débité.</p>
            <Link
              href="/billetterie"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
            >
              Réessayer
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
