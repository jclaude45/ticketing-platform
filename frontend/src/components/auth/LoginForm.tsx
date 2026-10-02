'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { authField, authButton } from '@/components/site/AuthShell';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { loginSchema, type LoginFormData } from '@/lib/validations';
import { useLogin } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const { requires2FA } = useAuthStore();
  const login = useLogin();

  // Clear any stale refresh token cookie on mount (prevents "Access denied" from old sessions)
  useEffect(() => {
    axios.post(`${BASE_URL}/auth/clear-session`, {}, { withCredentials: true }).catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormData) => {
    login.mutate(data);
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8"
    >
      {!requires2FA ? (
        <>
          <div>
            <label className="block text-sm text-[#707070]">
              Adresse e-mail
            </label>
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
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm text-[#707070]">Mot de passe</label>
              <a
                href="/auth/forgot-password"
                className="text-xs text-[#707070] underline underline-offset-2 hover:text-black"
              >
                Mot de passe oublié ?
              </a>
            </div>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
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
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4"
        >
          <div className="text-center">
            <ShieldCheck className="h-12 w-12 text-black mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-black font-semibold">Authentification à deux facteurs</p>
            <p className="text-[#555] text-sm mt-1">Entrez le code à 6 chiffres de votre application d&apos;authentification</p>
          </div>
          <div>
            <input
              {...register('totpCode')}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="w-full rounded-2xl border border-[#9a9a9a] py-3 text-center text-2xl tracking-[0.4em] text-black placeholder:text-[#c4c4c4] focus:border-black focus:outline-none focus:ring-0"
            />
            {errors.totpCode && (
              <p className="mt-1 text-sm text-red-600 text-center">{errors.totpCode.message}</p>
            )}
          </div>
        </motion.div>
      )}

      <button
        type="submit"
        disabled={login.isPending}
        className={`${authButton} mt-4`}
      >
        {login.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connexion en cours...
          </>
        ) : requires2FA ? (
          'Vérifier le code'
        ) : (
          'Se connecter'
        )}
      </button>
    </motion.form>
  );
}
