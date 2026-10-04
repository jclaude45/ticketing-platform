'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Copy, Loader2, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { totpSchema, type TotpFormData } from '@/lib/validations';
import { useSetup2FA, useVerify2FA } from '@/hooks/useAuth';
import { copyToClipboard } from '@/lib/utils';
import toast from 'react-hot-toast';
import { authButton } from '@/components/site/AuthShell';

type Step = 'scan' | 'verify' | 'done';

export function TwoFactorSetup() {
  const [step, setStep] = useState<Step>('scan');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const setup2FA = useSetup2FA();
  const verify2FA = useVerify2FA();

  const { register, handleSubmit, formState: { errors } } = useForm<TotpFormData>({
    resolver: zodResolver(totpSchema),
  });

  // Asked once: a second request would show a secret other than the one kept by the server
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    setup2FA.mutate(undefined, {
      onSuccess: (res) => {
        setQrCode(res.data.data.qrCode);
        setSecret(res.data.data.secret);
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVerify = (data: TotpFormData) => {
    verify2FA.mutate(data.code, {
      onSuccess: (res) => {
        setBackupCodes((res.data as { data: { backupCodes: string[] } }).data.backupCodes ?? []);
        setStep('done');
      },
    });
  };

  const handleCopySecret = () => {
    copyToClipboard(secret).then(() => toast.success('Clé copiée !'));
  };

  return (
    <AnimatePresence mode="wait">
      {step === 'scan' && (
        <motion.div key="scan" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
          <p className="text-[#555]">
            <span className="font-semibold text-black">1.</span> Scannez ce QR code avec votre application d&apos;authentification
            (Google Authenticator, Authy, Microsoft Authenticator…).
          </p>
          {setup2FA.isPending ? (
            <div className="flex h-52 w-52 items-center justify-center rounded-2xl border border-[#e5e5e5]">
              <Loader2 className="h-8 w-8 animate-spin text-[#9a9a9a]" />
            </div>
          ) : qrCode ? (
            <div className="inline-block rounded-2xl border border-[#e5e5e5] p-3">
              <Image src={qrCode} alt="QR code de double authentification" width={192} height={192} />
            </div>
          ) : null}

          {secret && (
            <div>
              <p className="mb-1.5 text-sm text-[#707070]">Ou saisissez cette clé dans l&apos;application :</p>
              <div className="flex items-center gap-3 border-b border-[#9a9a9a] pb-2">
                <code className="flex-1 break-all font-mono text-[15px] tracking-wider text-black">{secret}</code>
                <button type="button" onClick={handleCopySecret} aria-label="Copier la clé" className="flex-shrink-0 text-[#9a9a9a] transition-colors hover:text-black">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <button type="button" onClick={() => setStep('verify')} disabled={!qrCode} className={`${authButton} mt-4`}>
            J&apos;ai scanné le code
          </button>
        </motion.div>
      )}

      {step === 'verify' && (
        <motion.form key="verify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleSubmit(onVerify)} className="space-y-6">
          <div>
            <ShieldCheck className="mb-3 h-12 w-12 text-black" strokeWidth={1.5} />
            <p className="text-[#555]">
              <span className="font-semibold text-black">2.</span> Entrez le code à 6 chiffres affiché par votre application pour confirmer.
            </p>
          </div>

          <div>
            <input
              {...register('code')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="w-full rounded-2xl border border-[#9a9a9a] py-3 text-center text-2xl tracking-[0.4em] text-black placeholder:text-[#c4c4c4] focus:border-black focus:outline-none focus:ring-0"
            />
            {errors.code && <p className="mt-1 text-center text-sm text-red-600">{errors.code.message}</p>}
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep('scan')} className="h-12 flex-1 rounded-full border border-black text-lg font-semibold uppercase text-black transition-colors hover:bg-black hover:text-white">
              Retour
            </button>
            <button type="submit" disabled={verify2FA.isPending} className={`${authButton} flex-1`}>
              {verify2FA.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Vérification...</> : 'Vérifier'}
            </button>
          </div>
        </motion.form>
      )}

      {step === 'done' && (
        <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
          <div>
            <CheckCircle className="mb-3 h-12 w-12 text-black" strokeWidth={1.5} />
            <p className="text-xl font-semibold text-black">Double authentification activée</p>
            <p className="mt-1 text-[#555]">
              Votre compte est maintenant protégé. À chaque connexion, ZAYA vous demandera le code à 6 chiffres de votre application :
              gardez-la sur votre téléphone. Si vous changez de téléphone, désactivez la double authentification dans Paramètres avant.
            </p>
          </div>

          {backupCodes.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-black">Gardez ces codes de secours en lieu sûr :</p>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#FFDD00] p-4">
                {backupCodes.map((code, i) => (
                  <code key={i} className="rounded bg-white/60 py-1 text-center font-mono text-sm text-black">{code}</code>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#707070]">Chaque code ne peut servir qu&apos;une seule fois, si vous perdez votre téléphone.</p>
            </div>
          )}

          <a href="/dashboard" className={authButton}>Aller au tableau de bord</a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
