'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Copy, Loader2, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { totpSchema, type TotpFormData } from '@/lib/validations';
import { useSetup2FA, useVerify2FA } from '@/hooks/useAuth';
import { copyToClipboard } from '@/lib/utils';
import toast from 'react-hot-toast';

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

  useEffect(() => {
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
        <motion.div
          key="scan"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6"
        >
          <div className="text-center">
            <p className="text-white/80 text-sm mb-4">
              Scannez ce QR code avec votre application d&apos;authentification (Google Authenticator, Authy, etc.)
            </p>
            {setup2FA.isPending ? (
              <div className="w-48 h-48 mx-auto flex items-center justify-center bg-white/10 rounded-xl">
                <Loader2 className="h-8 w-8 text-indigo-300 animate-spin" />
              </div>
            ) : qrCode ? (
              <div className="inline-block p-3 bg-white rounded-xl mx-auto">
                <Image src={qrCode} alt="2FA QR Code" width={192} height={192} className="rounded" />
              </div>
            ) : null}
          </div>

          {secret && (
            <div>
              <p className="text-white/60 text-xs text-center mb-2">Ou entrez cette clé manuellement :</p>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 border border-white/20">
                <code className="flex-1 text-indigo-300 font-mono text-sm tracking-wider break-all">{secret}</code>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="text-white/40 hover:text-white transition-colors flex-shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setStep('verify')}
            disabled={!qrCode}
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            J&apos;ai scanné le code
          </button>
        </motion.div>
      )}

      {step === 'verify' && (
        <motion.form
          key="verify"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          onSubmit={handleSubmit(onVerify)}
          className="space-y-5"
        >
          <div className="text-center">
            <ShieldCheck className="h-12 w-12 text-indigo-300 mx-auto mb-3" />
            <p className="text-white font-medium">Vérifier la configuration</p>
            <p className="text-white/60 text-sm mt-1">Entrez le code à 6 chiffres de votre application pour confirmer</p>
          </div>

          <div>
            <input
              {...register('code')}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="w-full text-center text-2xl tracking-widest py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
            />
            {errors.code && <p className="mt-1 text-sm text-red-300 text-center">{errors.code.message}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('scan')}
              className="flex-1 py-2.5 px-4 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 transition-all text-sm"
            >
              Retour
            </button>
            <button
              type="submit"
              disabled={verify2FA.isPending}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {verify2FA.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Vérification...</> : 'Vérifier'}
            </button>
          </div>
        </motion.form>
      )}

      {step === 'done' && (
        <motion.div
          key="done"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-5"
        >
          <div className="text-center">
            <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-3" />
            <h3 className="text-xl font-semibold text-white">Double authentification activée !</h3>
            <p className="text-white/60 text-sm mt-1">Votre compte est maintenant protégé</p>
          </div>

          {backupCodes.length > 0 && (
            <div>
              <p className="text-white/80 text-sm font-medium mb-2">
                Enregistrez ces codes de secours dans un endroit sûr :
              </p>
              <div className="bg-white/10 border border-white/20 rounded-lg p-4 grid grid-cols-2 gap-1.5">
                {backupCodes.map((code, i) => (
                  <code key={i} className="text-indigo-300 font-mono text-sm text-center py-1 bg-white/5 rounded">
                    {code}
                  </code>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-2">Chaque code de secours ne peut être utilisé qu&apos;une seule fois.</p>
            </div>
          )}

          <a
            href="/dashboard"
            className="block w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all text-center"
          >
            Aller au tableau de bord
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
