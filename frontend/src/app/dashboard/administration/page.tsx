'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserCog, Users, MapPin, Plus, Trash2, Loader2, Mail, Check, X, Pencil, Clock, ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useWorkspace, PERMISSION_LABELS } from '@/hooks/useWorkspace';
import type { WorkspacePermission } from '@/types';

interface Collaborator {
  id: string;
  email: string;
  name: string | null;
  permission: WorkspacePermission;
  status: 'ACTIVE' | 'PENDING';
  lastLoginAt: string | null;
}

interface Zone { id: string; name: string; color: string; position: number }

const PERMISSIONS: { value: WorkspacePermission; hint: string }[] = [
  { value: 'ADMIN', hint: 'Tout, y compris supprimer des événements et gérer cet onglet Admin' },
  { value: 'MANAGER', hint: 'Événements, équipe, badges, contrôleurs, projet, communication, billets' },
  { value: 'TICKETING', hint: 'Billets, invitations, exports et scan — consulte le reste' },
  { value: 'VIEWER', hint: 'Consulte tout, ne modifie rien' },
];

const unwrap = (res: any) => res?.data?.data ?? res?.data;
const errorMessage = (err: any, fallback: string) => {
  const msg = err?.response?.data?.message;
  return Array.isArray(msg) ? msg[0] : msg ?? fallback;
};

export default function AdministrationPage() {
  const { can } = useWorkspace();
  const [tab, setTab] = useState<'collaborators' | 'zones'>('collaborators');

  if (!can('ADMIN')) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-gray-400" />
        <p className="font-semibold text-gray-900 dark:text-white">Accès réservé aux administrateurs du compte</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
          <UserCog className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin</h1>
          <p className="text-sm text-gray-500">Collaborateurs du compte et zones d&apos;accès des badges</p>
        </div>
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {([
          { key: 'collaborators', label: 'Collaborateurs', icon: Users },
          { key: 'zones', label: "Zones d'accès", icon: MapPin },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-900 dark:text-indigo-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
            )}
          >
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'collaborators' ? <CollaboratorsTab /> : <ZonesTab />}
    </div>
  );
}

// ─── Collaborators ────────────────────────────────────────────────────────────

function CollaboratorsTab() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<WorkspacePermission>('MANAGER');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const { data: collaborators = [], isLoading } = useQuery<Collaborator[]>({
    queryKey: ['account', 'collaborators'],
    queryFn: async () => unwrap(await apiClient.get('/account/collaborators')) ?? [],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['account', 'collaborators'] });

  const invite = useMutation({
    mutationFn: async () => apiClient.post('/account/collaborators', { email: email.trim(), permission }),
    onSuccess: () => {
      toast.success('Invitation envoyée par email');
      setEmail('');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Erreur lors de l'invitation")),
  });

  const update = useMutation({
    mutationFn: async ({ id, permission }: { id: string; permission: WorkspacePermission }) =>
      apiClient.patch(`/account/collaborators/${id}`, { permission }),
    onSuccess: () => { toast.success("Niveau d'accès mis à jour"); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Erreur lors de la mise à jour')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/account/collaborators/${id}`),
    onSuccess: () => { toast.success('Collaborateur retiré'); setConfirmRemove(null); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Erreur lors du retrait')),
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}
        className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Ajouter un collaborateur</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as WorkspacePermission)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {PERMISSIONS.map((p) => <option key={p.value} value={p.value}>{PERMISSION_LABELS[p.value]}</option>)}
          </select>
          <button
            type="submit"
            disabled={invite.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Inviter
          </button>
        </div>
        <p className="text-xs text-gray-500">{PERMISSIONS.find((p) => p.value === permission)?.hint}</p>
        <p className="text-xs text-gray-400">
          La personne se connecte avec son propre compte ZAYA (ou en crée un avec cet email), puis choisit votre
          compte dans « Espaces de travail » du menu de son compte.
        </p>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : collaborators.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">Aucun collaborateur pour le moment.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {collaborators.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{c.name ?? c.email}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-gray-500">
                    {c.name && <span className="truncate">{c.email}</span>}
                    {c.status === 'PENDING' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700">
                        <Clock className="h-3 w-3" /> En attente d&apos;inscription
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={c.permission}
                    onChange={(e) => update.mutate({ id: c.id, permission: e.target.value as WorkspacePermission })}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {PERMISSIONS.map((p) => <option key={p.value} value={p.value}>{PERMISSION_LABELS[p.value]}</option>)}
                  </select>
                  {confirmRemove === c.id ? (
                    <>
                      <button
                        onClick={() => remove.mutate(c.id)}
                        className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Retirer
                      </button>
                      <button onClick={() => setConfirmRemove(null)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Annuler">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(c.id)}
                      title="Retirer l'accès"
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Zones ────────────────────────────────────────────────────────────────────

function ZonesTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: zones = [], isLoading } = useQuery<Zone[]>({
    queryKey: ['account', 'zones'],
    queryFn: async () => unwrap(await apiClient.get('/account/zones')) ?? [],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['account', 'zones'] });

  const create = useMutation({
    mutationFn: async () => apiClient.post('/account/zones', { name: name.trim(), color }),
    onSuccess: () => { toast.success('Zone ajoutée'); setName(''); refresh(); },
    onError: (err) => toast.error(errorMessage(err, "Erreur lors de l'ajout")),
  });

  const update = useMutation({
    mutationFn: async (z: { id: string; name: string; color: string }) =>
      apiClient.patch(`/account/zones/${z.id}`, { name: z.name.trim(), color: z.color }),
    onSuccess: () => { toast.success('Zone mise à jour'); setEditing(null); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Erreur lors de la mise à jour')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/account/zones/${id}`),
    onSuccess: () => { toast.success('Zone supprimée'); setConfirmDelete(null); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Erreur lors de la suppression')),
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
        className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Ajouter une zone</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. PARKING, LOGES, RESTAURATION"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm uppercase text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
            aria-label="Couleur de la zone"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Les zones sont communes à tous vos événements et s&apos;affichent sur les badges d&apos;accréditation.
          Renommer une zone met à jour les accréditations existantes.
        </p>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center gap-3 px-4 py-2.5">
                {editing?.id === z.id ? (
                  <>
                    <input
                      type="color"
                      value={editing.color}
                      onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-gray-300 p-0.5"
                      aria-label="Couleur"
                    />
                    <input
                      value={editing.name}
                      maxLength={30}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm uppercase dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <button onClick={() => update.mutate(editing)} className="rounded p-1.5 text-green-600 hover:bg-green-50" aria-label="Enregistrer">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditing(null)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Annuler">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: z.color }}>
                      {z.name}
                    </span>
                    <span className="flex-1" />
                    {confirmDelete === z.id ? (
                      <>
                        <button
                          onClick={() => remove.mutate(z.id)}
                          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Supprimer
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Annuler">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing({ id: z.id, name: z.name, color: z.color })} title="Modifier"
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(z.id)} title="Supprimer"
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
