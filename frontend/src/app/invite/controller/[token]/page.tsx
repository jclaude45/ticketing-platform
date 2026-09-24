'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Shield, Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const schema = z.object({
  password:  z.string().min(8, 'Minimum 8 caractères'),
  confirm:   z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm'],
});

type FormData = z.infer<typeof schema>;

interface InvitationInfo {
  name: string;
  email: string;
  organizerName: string;
}

export default function AcceptControllerInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [info, setInfo]         = useState<InvitationInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);
  const [showPwd, setShowPwd]   = useState(false);
  const [showConf, setShowConf] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!token) return;
    axios.get<{ data: InvitationInfo }>(`${BASE_URL}/controllers/invitations/${token}`)
      .then(res => setInfo(res.data.data))
      .catch(() => setError('Invitation introuvable ou expirée.'))
      .finally(() => setLoading(false));
  }, [token]);

  const onSubmit = async (data: FormData) => {
    try {
      await axios.post(`${BASE_URL}/controllers/invitations/${token}/accept`, {
        password: data.password,
      });
      setSuccess(true);
      toast.success('Compte activé ! Vous pouvez maintenant vous connecter.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Une erreur est survenue.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation invalide</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Compte activé !</h1>
          <p className="text-sm text-gray-500 mb-6">
            Votre compte contrôleur est maintenant actif. Connectez-vous sur l'application mobile ZAYA pour scanner les billets.
          </p>
          <p className="text-xs text-gray-400">Email : {info?.email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 mb-4">
            <Shield className="h-7 w-7 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bienvenue sur ZAYA !</h1>
          <p className="mt-2 text-sm text-gray-500">
            <strong>{info?.organizerName}</strong> vous a invité(e) comme contrôleur de billets.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 rounded-lg bg-indigo-50 px-4 py-3">
            <p className="text-sm font-medium text-indigo-900">{info?.name}</p>
            <p className="text-xs text-indigo-600">{info?.email}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Créer un mot de passe <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Minimum 8 caractères"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmer le mot de passe <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  {...register('confirm')}
                  type={showConf ? 'text' : 'password'}
                  placeholder="Répétez le mot de passe"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={() => setShowConf(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm && (
                <p className="mt-1 text-xs text-red-500">{errors.confirm.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Activer mon compte
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Vous utiliserez cet email et ce mot de passe pour vous connecter sur l'application mobile ZAYA.
        </p>
      </div>
    </div>
  );
}
