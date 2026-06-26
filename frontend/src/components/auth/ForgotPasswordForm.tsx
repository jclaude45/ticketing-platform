'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, Mail } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validations';
import { useForgotPassword } from '@/hooks/useAuth';

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
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-4"
      >
        <CheckCircle className="h-16 w-16 text-green-400 mx-auto" />
        <h3 className="text-xl font-semibold text-white">Email envoyé !</h3>
        <p className="text-white/60 text-sm">
          Nous avons envoyé un lien de réinitialisation à <span className="text-indigo-300 font-medium">{getValues('email')}</span>
        </p>
        <p className="text-white/40 text-xs">Vérifiez votre dossier spam si vous ne le voyez pas.</p>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
    >
      <div>
        <label className="block text-sm font-medium text-white/80 mb-1.5">Adresse e-mail</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            {...register('email')}
            type="email"
            placeholder="you@example.com"
            className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
          />
        </div>
        {errors.email && <p className="mt-1 text-sm text-red-300">{errors.email.message}</p>}
      </div>

      <button
        type="submit"
        disabled={forgotPassword.isPending}
        className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {forgotPassword.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours...</>
        ) : (
          'Envoyer le lien'
        )}
      </button>
    </motion.form>
  );
}
