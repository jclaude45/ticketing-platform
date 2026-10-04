'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validations';
import { useResetPassword } from '@/hooks/useAuth';
import { authButton, authField } from '@/components/site/AuthShell';

export function ResetPasswordForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const resetPassword = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    resetPassword.mutate({ token, password: data.password });
  };

  if (!token) {
    return (
      <div className="space-y-3">
        <p className="text-xl font-semibold text-black">Lien incomplet</p>
        <p className="text-[#555]">Ce lien de réinitialisation est incomplet ou a expiré. Demandez-en un nouveau.</p>
        <a href="/auth/forgot-password" className={`${authButton} mt-6`}>Recevoir un nouveau lien</a>
      </div>
    );
  }

  const fields = [
    { name: 'password' as const, label: 'Nouveau mot de passe', placeholder: 'Au moins 8 caractères', show: showPassword, toggle: () => setShowPassword(v => !v) },
    { name: 'confirmPassword' as const, label: 'Confirmer le mot de passe', placeholder: 'Répétez le mot de passe', show: showConfirm, toggle: () => setShowConfirm(v => !v) },
  ];

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      {fields.map(f => (
        <div key={f.name}>
          <label className="mb-1.5 block text-sm text-[#707070]">{f.label}</label>
          <div className="relative">
            <input
              {...register(f.name)}
              type={f.show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={f.placeholder}
              className={`${authField} pr-10`}
            />
            <button type="button" onClick={f.toggle} aria-label="Afficher ou masquer le mot de passe" className="absolute right-1 top-1/2 -translate-y-1/2 text-[#9a9a9a] transition-colors hover:text-black">
              {f.show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors[f.name] && <p className="mt-1 text-sm text-red-600">{errors[f.name]?.message}</p>}
        </div>
      ))}

      <button type="submit" disabled={resetPassword.isPending} className={`${authButton} mt-4`}>
        {resetPassword.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Réinitialisation...</> : 'Choisir ce mot de passe'}
      </button>
    </motion.form>
  );
}
