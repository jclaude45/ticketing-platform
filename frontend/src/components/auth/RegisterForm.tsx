'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { authField, authButton } from '@/components/site/AuthShell';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { registerSchema, type RegisterFormData } from '@/lib/validations';
import { useRegister } from '@/hooks/useAuth';
import { SITE_URL } from '@/components/site/site-config';

function PasswordStrength({ password }: { password: string }) {
  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const labels = ['', 'Faible', 'Moyen', 'Bien', 'Fort'];
  const colors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= strength ? colors[strength] : 'bg-[#e5e5e5]'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs ${strength >= 3 ? 'text-green-700' : strength >= 2 ? 'text-yellow-700' : 'text-red-600'}`}>
        {labels[strength]}
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const register_mutation = useRegister();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch('password', '');

  const onSubmit = (data: RegisterFormData) => {
    register_mutation.mutate({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-7"
    >
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm text-[#707070]">Prénom</label>
          <div className="relative">
            <input
              {...register('firstName')}
              type="text"
              autoComplete="given-name"
              placeholder="Jean"
              suppressHydrationWarning
              className={`${authField}`}
            />
          </div>
          {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
        </div>
        <div>
          <label className="block text-sm text-[#707070]">Nom</label>
          <div className="relative">
            <input
              {...register('lastName')}
              type="text"
              autoComplete="family-name"
              placeholder="Claude"
              suppressHydrationWarning
              className={`${authField}`}
            />
          </div>
          {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm text-[#707070]">Adresse e-mail</label>
        <div className="relative">
          <input
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            suppressHydrationWarning
            className={`${authField}`}
          />
        </div>
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label className="block text-sm text-[#707070]">Mot de passe</label>
        <div className="relative">
          <input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Créez un mot de passe fort"
            suppressHydrationWarning
            className={`${authField} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[#9a9a9a] hover:text-black transition-colors" aria-label="Afficher ou masquer le mot de passe"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrength password={password} />
        {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <div>
        <label className="block text-sm text-[#707070]">Confirmer le mot de passe</label>
        <div className="relative">
          <input
            {...register('confirmPassword')}
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Répétez votre mot de passe"
            suppressHydrationWarning
            className={`${authField} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[#9a9a9a] hover:text-black transition-colors" aria-label="Afficher ou masquer le mot de passe"
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>}
      </div>

      <label className="flex items-start gap-3 text-sm leading-snug text-[#333]">
        <input type="checkbox" {...register('acceptTerms')} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-black" />
        <span>
          J’accepte les{' '}
          <a href={`${SITE_URL}/cgu`} target="_blank" rel="noopener noreferrer" className="font-semibold text-black underline underline-offset-2">conditions générales d’utilisation</a>,
          les{' '}
          <a href={`${SITE_URL}/cgv`} target="_blank" rel="noopener noreferrer" className="font-semibold text-black underline underline-offset-2">conditions générales de vente</a>{' '}
          et la{' '}
          <a href={`${SITE_URL}/politique-de-confidentialite`} target="_blank" rel="noopener noreferrer" className="font-semibold text-black underline underline-offset-2">politique de confidentialité</a>.
        </span>
      </label>
      {errors.acceptTerms && <p className="-mt-2 text-sm text-red-600">{errors.acceptTerms.message}</p>}

      <button
        type="submit"
        disabled={register_mutation.isPending}
        className={`${authButton} mt-4`}
      >
        {register_mutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Création du compte...</>
        ) : (
          'Créer un compte'
        )}
      </button>
    </motion.form>
  );
}
