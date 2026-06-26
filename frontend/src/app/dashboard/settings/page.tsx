'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  User, Lock, Shield, Bell, Key, ChevronRight,
  Eye, EyeOff, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Camera,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authApi, apiClient, resolveMediaUrl } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

// ── Schemas ───────────────────────────────────────────────────────────────────
const profileSchema = z.object({
  firstName: z.string().min(2, 'Minimum 2 caractères'),
  lastName: z.string().min(2, 'Minimum 2 caractères'),
  email: z.string().email('Email invalide'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Requis'),
  newPassword: z.string().min(8, 'Minimum 8 caractères').regex(/[A-Z]/, 'Une majuscule requise').regex(/[0-9]/, 'Un chiffre requis'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

type ProfileData = z.infer<typeof profileSchema>;
type PasswordData = z.infer<typeof passwordSchema>;

// ── Section tabs ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'security', label: 'Sécurité', icon: Lock },
  { id: '2fa', label: 'Double auth.', icon: Shield },
  { id: 'keys', label: 'Clés RSA', icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const;
type TabId = typeof TABS[number]['id'];

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image trop volumineuse (max 5 Mo)');
      return;
    }
    const formData = new FormData();
    formData.append('avatar', file);
    setAvatarLoading(true);
    try {
      const res = await authApi.uploadAvatar(formData);
      const updated = (res.data as any)?.data ?? res.data;
      setUser(updated);
      toast.success('Photo de profil mise à jour');
    } catch {
      toast.error('Erreur lors du téléchargement');
    } finally {
      setAvatarLoading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // ── Profile form ─────────────────────────────────────────────────────────
  const profileForm = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
    },
  });

  const updateProfile = useMutation({
    mutationFn: ({ firstName, lastName }: ProfileData) =>
      authApi.updateProfile({ firstName, lastName }),
    onSuccess: (res) => {
      const updated = (res.data as any)?.data ?? res.data;
      setUser(updated);
      toast.success('Profil mis à jour');
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  // ── Password form ─────────────────────────────────────────────────────────
  const passwordForm = useForm<PasswordData>({
    resolver: zodResolver(passwordSchema),
  });

  const changePassword = useMutation({
    mutationFn: (data: PasswordData) =>
      apiClient.patch('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    onSuccess: () => {
      toast.success('Mot de passe modifié');
      passwordForm.reset();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message ?? 'Mot de passe actuel incorrect'),
  });

  // ── 2FA toggle ────────────────────────────────────────────────────────────
  const setup2FA = useMutation({
    mutationFn: () => authApi.setupTwoFactor(),
    onSuccess: () => {
      window.location.href = '/auth/setup-2fa';
    },
  });

  const disable2FA = useMutation({
    mutationFn: (code: string) => authApi.disableTwoFactor(code),
    onSuccess: () => {
      toast.success('Double authentification désactivée');
      if (user) setUser({ ...user, twoFactorEnabled: false });
    },
    onError: () => toast.error('Code invalide'),
  });

  // ── RSA key rotation ──────────────────────────────────────────────────────
  const rotateKeys = useMutation({
    mutationFn: () => apiClient.post('/users/rotate-keys'),
    onSuccess: () => toast.success('Clés RSA-4096 régénérées — vos nouveaux billets utiliseront ces clés'),
    onError: () => toast.error('Erreur lors de la rotation des clés'),
  });

  // ── Notifications prefs ───────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState({
    emailOnScan: true,
    emailOnEventFull: true,
    emailOnFraud: true,
    emailWeeklyReport: false,
  });

  const saveNotifs = useMutation({
    mutationFn: () => apiClient.patch('/auth/settings', { notifications: notifPrefs }),
    onSuccess: () => toast.success('Préférences sauvegardées'),
    onError: () => toast.error('Erreur'),
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gérez votre compte et vos préférences</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar tabs */}
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:w-52 lg:flex-shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left whitespace-nowrap transition-all',
                  activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {tab.label}
                {activeTab === tab.id && (
                  <ChevronRight className="ml-auto h-4 w-4 text-indigo-400 hidden lg:block" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">

          {/* ── PROFIL ─────────────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Informations personnelles</h2>
              <p className="text-sm text-gray-500 mb-6">Votre nom et email publics</p>

              {/* Avatar */}
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="relative h-16 w-16 rounded-full flex-shrink-0 overflow-hidden group focus:outline-none"
                  title="Changer la photo de profil"
                >
                  {user?.avatar ? (
                    <img
                      src={resolveMediaUrl(user.avatar)}
                      alt="Avatar"
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : (
                    <div className="h-full w-full rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600">
                      {user?.firstName?.[0]?.toUpperCase()}{user?.lastName?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {avatarLoading
                      ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                      : <Camera className="h-5 w-5 text-white" />
                    }
                  </div>
                </button>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarLoading}
                    className="text-xs text-indigo-600 mt-1 hover:underline disabled:opacity-50"
                  >
                    {avatarLoading ? 'Chargement...' : 'Changer la photo de profil'}
                  </button>
                </div>
              </div>

              <form onSubmit={profileForm.handleSubmit((d) => updateProfile.mutate(d))} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    { name: 'firstName' as const, label: 'Prénom' },
                    { name: 'lastName' as const, label: 'Nom' },
                  ].map((f) => (
                    <div key={f.name}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                      <input
                        {...profileForm.register(f.name)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                      {profileForm.formState.errors[f.name] && (
                        <p className="text-xs text-red-500 mt-1">{profileForm.formState.errors[f.name]?.message}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    value={user?.email ?? ''}
                    readOnly
                    type="email"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">L'email ne peut pas être modifié ici.</p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={updateProfile.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    {updateProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sauvegarder
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── SÉCURITÉ ────────────────────────────────────────────────── */}
          {activeTab === 'security' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Changer le mot de passe</h2>
              <p className="text-sm text-gray-500 mb-6">Utilisez un mot de passe fort d'au moins 8 caractères</p>

              <form onSubmit={passwordForm.handleSubmit((d) => changePassword.mutate(d))} className="space-y-4">
                {[
                  { name: 'currentPassword' as const, label: 'Mot de passe actuel', show: showCurrent, toggle: () => setShowCurrent((v) => !v) },
                  { name: 'newPassword' as const, label: 'Nouveau mot de passe', show: showNew, toggle: () => setShowNew((v) => !v) },
                  { name: 'confirmPassword' as const, label: 'Confirmer le mot de passe', show: showConfirm, toggle: () => setShowConfirm((v) => !v) },
                ].map((f) => (
                  <div key={f.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    <div className="relative">
                      <input
                        {...passwordForm.register(f.name)}
                        type={f.show ? 'text' : 'password'}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                      <button type="button" onClick={f.toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {f.show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors[f.name] && (
                      <p className="text-xs text-red-500 mt-1">{passwordForm.formState.errors[f.name]?.message}</p>
                    )}
                  </div>
                ))}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={changePassword.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    {changePassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Modifier le mot de passe
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── 2FA ─────────────────────────────────────────────────────── */}
          {activeTab === '2fa' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Double authentification (2FA)</h2>
                  <p className="text-sm text-gray-500 mt-1">Sécurisez votre compte avec une application TOTP (Google Authenticator, Authy…)</p>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', user?.twoFactorEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                  {user?.twoFactorEnabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {user?.twoFactorEnabled ? 'Activée' : 'Désactivée'}
                </span>
              </div>

              {!user?.twoFactorEnabled ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                    <p className="text-sm text-amber-800 font-medium">Votre compte n'est pas protégé par la 2FA</p>
                    <p className="text-xs text-amber-600 mt-1">Nous recommandons fortement d'activer la double authentification pour protéger l'accès à vos événements.</p>
                  </div>
                  <button
                    onClick={() => setup2FA.mutate()}
                    disabled={setup2FA.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                  >
                    {setup2FA.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    Activer la 2FA
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                    <p className="text-sm text-emerald-800 font-medium">Double authentification active</p>
                    <p className="text-xs text-emerald-600 mt-1">Votre compte est protégé. Un code TOTP est requis à chaque connexion.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Code de vérification (pour désactiver)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="000000"
                        maxLength={6}
                        className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm font-mono tracking-widest focus:border-red-400 focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val.length === 6) disable2FA.mutate(val);
                          }
                        }}
                      />
                      <button
                        onClick={(e) => {
                          const input = (e.currentTarget.previousSibling as HTMLInputElement);
                          if (input.value.length === 6) disable2FA.mutate(input.value);
                        }}
                        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Désactiver
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CLÉS RSA ─────────────────────────────────────────────────── */}
          {activeTab === 'keys' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Clés cryptographiques RSA-4096</h2>
              <p className="text-sm text-gray-500 mb-6">Ces clés signent chaque QR Code de billet. La rotation révoque les anciens QR codes générés.</p>

              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Paire de clés active</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                  </div>
                  <p className="text-xs text-gray-500">RSA-4096 · Générée à l'inscription · Stockée chiffrée en AES-256</p>
                </div>

                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Attention — Action irréversible</p>
                      <p className="text-xs text-red-600 mt-1">
                        La rotation génère une nouvelle paire de clés. Les QR codes des billets déjà imprimés avec les anciennes clés deviendront invalides à la prochaine vérification.
                        Effectuez cette rotation uniquement si vous soupçonnez une compromission.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (confirm('Confirmer la rotation des clés RSA ? Les billets existants seront régénérés.')) {
                      rotateKeys.mutate();
                    }
                  }}
                  disabled={rotateKeys.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                >
                  {rotateKeys.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Effectuer la rotation des clés
                </button>
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ────────────────────────────────────────────── */}
          {activeTab === 'notifications' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Notifications par email</h2>
              <p className="text-sm text-gray-500 mb-6">Choisissez les événements pour lesquels vous souhaitez être notifié</p>

              <div className="divide-y divide-gray-100">
                {[
                  { key: 'emailOnScan' as const, label: 'Alerte scan', desc: 'Notifié à chaque validation de billet' },
                  { key: 'emailOnEventFull' as const, label: 'Événement complet', desc: 'Notifié quand la capacité est atteinte' },
                  { key: 'emailOnFraud' as const, label: 'Tentative de fraude', desc: 'Alerte immédiate sur les QR codes frauduleux' },
                  { key: 'emailWeeklyReport' as const, label: 'Rapport hebdomadaire', desc: 'Résumé de l\'activité chaque lundi' },
                ].map((pref) => (
                  <div key={pref.key} className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{pref.label}</p>
                      <p className="text-xs text-gray-500">{pref.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifPrefs((p) => ({ ...p, [pref.key]: !p[pref.key] }))}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                        notifPrefs[pref.key] ? 'bg-indigo-600' : 'bg-gray-200'
                      )}
                    >
                      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', notifPrefs[pref.key] ? 'translate-x-6' : 'translate-x-1')} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <button
                  onClick={() => saveNotifs.mutate()}
                  disabled={saveNotifs.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {saveNotifs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Sauvegarder les préférences
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
