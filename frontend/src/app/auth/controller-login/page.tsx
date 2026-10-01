'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Lock, Eye, EyeOff, Loader2, ScanLine } from 'lucide-react';
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

  const inputCls =
    'w-full pl-10 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/zaya-logo.svg" alt="ZAYA" className="w-16 h-16 rounded-2xl shadow-2xl mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Espace contrôleur</h1>
          <p className="text-indigo-200 mt-2">Connectez-vous pour contrôler les entrées</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-5 sm:p-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className={`${inputCls} pr-4`}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputCls} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            Se connecter
          </button>
          <p className="text-xs text-white/50 text-center">
            Utilisez l&apos;email de votre invitation et le mot de passe choisi à l&apos;activation
            (ou votre mot de passe ZAYA si vous aviez déjà un compte).
          </p>
        </form>
        <p className="text-center text-indigo-200 text-sm mt-6">
          Vous êtes organisateur ?{' '}
          <a href="/auth/login" className="text-indigo-300 hover:text-white font-semibold underline underline-offset-2 transition-colors">
            Connexion organisateur
          </a>
        </p>
      </div>
    </div>
  );
}
