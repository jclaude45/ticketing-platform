'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, ScanLine } from 'lucide-react';
import { AuthShell, authButton, authField } from '@/components/site/AuthShell';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api';
import { setTokens } from '@/lib/auth';
import { useAuthStore } from '@/store/auth.store';

export default function ControllerLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setUser, setAuthenticated } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/controller-login', { email: email.trim(), password });
      const data = (res.data as any)?.data ?? res.data;
      setTokens({ accessToken: data.accessToken });
      setUser(data.user);
      setAuthenticated(true);
      queryClient.clear();
      router.push('/controle');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Espace contrôleur"
      subtitle="Connectez-vous pour contrôler les entrées de vos événements."
      headline="Chaque entrée, contrôlée en une seconde."
      footer={
        <p>
          Vous êtes organisateur ?{' '}
          <a href="/auth/login" className="font-semibold text-black underline underline-offset-4">Connexion organisateur</a>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="mb-1.5 block text-sm text-[#707070]">Adresse e-mail</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            className={authField}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-[#707070]">Mot de passe</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`${authField} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[#9a9a9a] transition-colors hover:text-black"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className={`${authButton} mt-4`}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-5 w-5" />}
          Se connecter
        </button>
        <p className="text-sm text-[#707070]">
          Utilisez l&apos;e-mail de votre invitation et le mot de passe choisi à l&apos;activation
          (ou votre mot de passe ZAYA si vous aviez déjà un compte).
        </p>
      </form>
    </AuthShell>
  );
}
