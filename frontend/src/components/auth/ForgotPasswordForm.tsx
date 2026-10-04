'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validations';
import { useForgotPassword } from '@/hooks/useAuth';
import { authButton, authField } from '@/components/site/AuthShell';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const forgotPassword = useForgotPassword();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    forgotPassword.mutate(data.email, {
      onSuccess: () => setSent(true),
    });
  };

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <CheckCircle2 className="h-12 w-12 text-black" strokeWidth={1.5} />
        <p className="text-xl font-semibold text-black">E-mail envoyé</p>
        <p className="text-[#555]">
          Si un compte existe pour <span className="font-semibold text-black">{getValues('email')}</span>, vous allez recevoir un lien
          pour choisir un nouveau mot de passe.
        </p>
        <p className="text-sm text-[#707070]">Pensez à regarder dans vos courriers indésirables.</p>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <div>
        <label className="mb-1.5 block text-sm text-[#707070]">Adresse e-mail</label>
        <input {...register('email')} type="email" autoComplete="email" placeholder="vous@exemple.com" className={authField} />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <button type="submit" disabled={forgotPassword.isPending} className={`${authButton} mt-4`}>
        {forgotPassword.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours...</> : 'Envoyer le lien'}
      </button>
    </motion.form>
  );
}
