'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { billingApi, type BillingPaymentRow } from '@/lib/api';
import { usd } from '@/components/billing/FlexPayDialog';

/** Back from the FlexPay card page: wait for the confirmation, then return where the payment started */
function BillingReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const reference = params.get('reference') ?? '';
  const state = params.get('state');
  const raw = params.get('next') ?? '/dashboard/subscription';
  const next = raw.startsWith('/dashboard/') ? raw : '/dashboard/subscription';
  const [payment, setPayment] = useState<BillingPaymentRow | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!reference || state !== 'approved') return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      tries += 1;
      try {
        const p = await billingApi.payment(reference);
        setPayment(p);
        if (p.status === 'COMPLETED') {
          qc.invalidateQueries({ queryKey: ['my-subscription'] });
          qc.invalidateQueries({ queryKey: ['billing-payments'] });
          timer = setTimeout(() => router.replace(next), 1800);
          return;
        }
        if (p.status === 'FAILED') return;
      } catch {
        // keep trying
      }
      if (tries >= 30) setGaveUp(true);
      else timer = setTimeout(check, 3000);
    };
    check();
    return () => clearTimeout(timer);
  }, [reference, state, next, router, qc]);

  const done = payment?.status === 'COMPLETED';
  const failed = state === 'cancelled' || state === 'declined' || payment?.status === 'FAILED';

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {done ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
          <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-black dark:text-white">Paiement reçu</h1>
          <p className="mt-2 text-gray-500">{payment!.label} · {usd(payment!.amount)}</p>
          <p className="mt-1 text-sm text-gray-500">Retour à la page précédente…</p>
        </>
      ) : failed ? (
        <>
          <XCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-black dark:text-white">
            {state === 'cancelled' ? 'Paiement annulé' : 'Paiement refusé'}
          </h1>
          <p className="mt-2 text-gray-500">Aucun montant n’a été prélevé. Vous pouvez réessayer.</p>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gray-400" />
          <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-black dark:text-white">Confirmation du paiement</h1>
          <p className="mt-2 text-gray-500">
            {gaveUp
              ? 'La confirmation prend plus de temps que prévu. Le paiement apparaîtra dans « Mon abonnement » dès qu’il sera validé.'
              : 'Nous attendons la confirmation de FlexPay. Cela prend quelques secondes.'}
          </p>
        </>
      )}
      {!done && (
        <Link href={next} className="btn-primary mt-8 inline-flex">Revenir</Link>
      )}
    </div>
  );
}

export default function BillingReturnPage() {
  return (
    <Suspense>
      <BillingReturn />
    </Suspense>
  );
}
