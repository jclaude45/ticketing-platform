'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionApi } from '@/lib/api';
import type { SubscriptionPlan, OrganizerSubscription } from '@/types';
import {
  CreditCard, Plus, Pencil, Trash2, RefreshCw, UserCheck,
  Ticket, Users, CheckCircle2, XCircle, Clock, Zap, Infinity,
  ChevronDown, ChevronUp, RotateCcw, ShieldCheck, Calendar,
  Package, Download, Euro, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatLimit(n: number) {
  return n === -1 ? '∞' : n.toLocaleString('fr-FR');
}

function statusChip(status: string) {
  const map: Record<string, string> = {
    ACTIVE:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
    EXPIRED:   'bg-amber-50  text-amber-700  ring-amber-200',
    CANCELLED: 'bg-red-50    text-red-700    ring-red-200',
    SUSPENDED: 'bg-gray-100  text-gray-600   ring-gray-200',
  };
  const labels: Record<string, string> = {
    ACTIVE: 'Actif', EXPIRED: 'Expiré', CANCELLED: 'Annulé', SUSPENDED: 'Suspendu',
  };
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1', map[status] ?? map.SUSPENDED)}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Plan form modal ───────────────────────────────────────────────────────────

interface PlanFormProps {
  plan?: SubscriptionPlan;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}
function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-gray-700">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600')}>
        <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  );
}

function PlanForm({ plan, onClose, onSave, saving }: PlanFormProps) {
  const [form, setForm] = useState({
    name:                 plan?.name                 ?? '',
    description:          plan?.description          ?? '',
    price:                plan?.price                ?? 0,
    maxTickets:           plan?.maxTickets           ?? 200,
    maxBadges:            plan?.maxBadges            ?? 50,
    maxEvents:            plan?.maxEvents            ?? -1,
    showPoweredBy:        plan?.showPoweredBy        ?? true,
    allowBulkExport:      plan?.allowBulkExport      ?? true,
    allowCommunication:   plan?.allowCommunication   ?? false,
    isActive:             plan?.isActive             ?? true,
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const field = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {plan ? 'Modifier le plan' : 'Nouveau plan'}
          </h2>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Nom + description */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du plan *</label>
              <input className={field} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Starter, Pro, Enterprise…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea className={cn(field, 'resize-none')} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Courte description du plan…" />
            </div>
          </div>

          {/* Prix */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prix mensuel (USD) <span className="text-gray-400 font-normal">— 0 = gratuit</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min={0} step={0.01} className={cn(field, 'pl-8')}
                value={form.price} onChange={e => set('price', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* Limites — utilise defaultValue (non contrôlé) pour éviter le blocage
              lors de la saisie : le DOM gère l'affichage intermédiaire librement */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'maxTickets', label: 'Max billets' },
              { key: 'maxBadges',  label: 'Max badges'  },
              { key: 'maxEvents',  label: 'Max événements' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {label} <span className="text-gray-400">(-1 = ∞)</span>
                </label>
                <input
                  type="number"
                  min={-1}
                  className={field}
                  defaultValue={(form as any)[key]}
                  onChange={e => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) set(key, n);
                  }}
                />
              </div>
            ))}
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <Toggle checked={form.allowCommunication} onChange={v => set('allowCommunication', v)}
              label="Communication & Marketing" sub="Campagnes email/SMS/WhatsApp, rappels auto J-7 / J-1" />
            <Toggle checked={form.allowBulkExport} onChange={v => set('allowBulkExport', v)}
              label="Export en lot des billets" sub="Autoriser le téléchargement ZIP / PDF groupé" />
            <Toggle checked={form.showPoweredBy} onChange={v => set('showPoweredBy', v)}
              label='Logo "Powered by ZAYA"' sub="Afficher la signature sur les PDFs" />
            {plan && (
              <Toggle checked={form.isActive} onChange={v => set('isActive', v)}
                label="Plan actif" sub="Un plan inactif ne peut plus être assigné" />
            )}
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3 justify-end flex-shrink-0 border-t border-gray-100 dark:border-gray-800 pt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Annuler
          </button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim() || saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign plan modal ─────────────────────────────────────────────────────────

interface AssignModalProps {
  sub: OrganizerSubscription;
  plans: SubscriptionPlan[];
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}
function AssignModal({ sub, plans, onClose, onSave, saving }: AssignModalProps) {
  const [planId, setPlanId] = useState(sub.planId);
  const [expiresAt, setExpiresAt] = useState(sub.expiresAt ? sub.expiresAt.slice(0, 10) : '');
  const [notes, setNotes] = useState(sub.notes ?? '');
  const [status, setStatus] = useState(sub.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Modifier l'abonnement</h2>
          <p className="text-sm text-gray-500 mt-0.5">{sub.organizer?.firstName} {sub.organizer?.lastName} — {sub.organizer?.email}</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan</label>
            <select
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={planId} onChange={e => setPlanId(e.target.value)}
            >
              {plans.filter(p => p.isActive).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date d'expiration <span className="text-gray-400 font-normal">(vide = sans expiration)</span></label>
            <input type="date"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut</label>
            <select
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={status} onChange={e => setStatus(e.target.value as any)}
            >
              <option value="ACTIVE">Actif</option>
              <option value="SUSPENDED">Suspendu</option>
              <option value="CANCELLED">Annulé</option>
              <option value="EXPIRED">Expiré</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes internes</label>
            <textarea
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Annuler
          </button>
          <button
            onClick={() => onSave({ planId, status, expiresAt: expiresAt || null, notes })}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Toast simple ─────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: 'success' | 'error'; onDone: () => void }) {
  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium max-w-sm',
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
    )}>
      {type === 'success' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onDone} className="opacity-70 hover:opacity-100 ml-2">✕</button>
    </div>
  );
}

function errMsg(e: any): string {
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(' · ');
  return msg ?? e?.message ?? 'Erreur inconnue';
}

export default function SubscriptionsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'plans' | 'organizers'>('plans');
  const [planModal, setPlanModal] = useState<'create' | SubscriptionPlan | null>(null);
  const [assignModal, setAssignModal] = useState<OrganizerSubscription | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => subscriptionApi.listPlans().then(r => r.data.data),
  });
  const plans = plansData ?? [];

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ['subscription-organizers'],
    queryFn: () => subscriptionApi.listSubscriptions().then(r => r.data.data),
    enabled: tab === 'organizers',
  });
  const subscriptions = subsData ?? [];

  // Plan mutations
  const createPlanMut = useMutation({
    mutationFn: (data: any) => subscriptionApi.createPlan(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-plans'] });
      setPlanModal(null);
      notify('Plan créé avec succès');
    },
    onError: (e: any) => notify(`Erreur création : ${errMsg(e)}`, 'error'),
  });
  const updatePlanMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => subscriptionApi.updatePlan(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-plans'] });
      setPlanModal(null);
      notify('Plan mis à jour');
    },
    onError: (e: any) => notify(`Erreur mise à jour : ${errMsg(e)}`, 'error'),
  });
  const deletePlanMut = useMutation({
    mutationFn: (id: string) => subscriptionApi.deletePlan(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subscription-plans'] }); notify('Plan supprimé'); },
    onError: (e: any) => notify(`Erreur suppression : ${errMsg(e)}`, 'error'),
  });

  // Subscription mutations
  const updateSubMut = useMutation({
    mutationFn: ({ organizerId, data }: { organizerId: string; data: any }) =>
      subscriptionApi.updateSubscription(organizerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-organizers'] });
      setAssignModal(null);
      notify('Abonnement mis à jour');
    },
    onError: (e: any) => notify(`Erreur : ${errMsg(e)}`, 'error'),
  });
  const resetQuotaMut = useMutation({
    mutationFn: (organizerId: string) => subscriptionApi.resetQuota(organizerId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subscription-organizers'] }); notify('Quotas remis à zéro'); },
    onError: (e: any) => notify(`Erreur : ${errMsg(e)}`, 'error'),
  });

  const savingPlan = createPlanMut.isPending || updatePlanMut.isPending;
  const savingSub = updateSubMut.isPending;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Abonnements</h1>
            <p className="text-sm text-gray-500">Gérer les plans et les quotas des organisateurs</p>
          </div>
        </div>
        {tab === 'plans' && (
          <button
            onClick={() => setPlanModal('create')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nouveau plan
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {(['plans', 'organizers'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t === 'plans' ? 'Plans tarifaires' : 'Organisateurs'}
          </button>
        ))}
      </div>

      {/* ── Plans tab ── */}
      {tab === 'plans' && (
        <div>
          {plansLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucun plan créé. Commencez par ajouter un plan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map(plan => (
                <div key={plan.id} className={cn(
                  'relative bg-white dark:bg-gray-900 rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md',
                  plan.isActive ? 'border-gray-200 dark:border-gray-800' : 'border-dashed border-gray-300 dark:border-gray-700 opacity-60',
                )}>
                  {!plan.isActive && (
                    <span className="absolute top-3 right-3 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Inactif</span>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                      {plan.description && <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {plan.price > 0
                        ? <p className="text-lg font-bold text-indigo-600">${plan.price.toFixed(2)}<span className="text-xs font-normal text-gray-400">/mois</span></p>
                        : <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Gratuit</span>
                      }
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {[
                      { icon: <Ticket className="h-3.5 w-3.5" />, label: 'Billets', val: plan.maxTickets },
                      { icon: <Users  className="h-3.5 w-3.5" />, label: 'Badges',  val: plan.maxBadges  },
                      { icon: <Calendar className="h-3.5 w-3.5" />, label: 'Événements', val: plan.maxEvents },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-gray-500">{r.icon} {r.label}</span>
                        <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                          {r.val === -1 ? <Infinity className="h-4 w-4 text-indigo-500" /> : r.val.toLocaleString('fr-FR')}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm pt-1 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500">Logo ZAYA</span>
                      {plan.showPoweredBy
                        ? <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Affiché</span>
                        : <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Masqué</span>
                      }
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500"><Mail className="h-3.5 w-3.5" /> Communication</span>
                      {plan.allowCommunication
                        ? <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Activée</span>
                        : <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Désactivée</span>
                      }
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500"><Download className="h-3.5 w-3.5" /> Export en lot</span>
                      {plan.allowBulkExport
                        ? <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Autorisé</span>
                        : <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Bloqué</span>
                      }
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                    <button
                      onClick={() => setPlanModal(plan)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Modifier
                    </button>
                    <button
                      onClick={() => { if (confirm(`Supprimer le plan "${plan.name}" ?`)) deletePlanMut.mutate(plan.id); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Organizers tab ── */}
      {tab === 'organizers' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          {subsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <UserCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucun abonnement actif. Assignez un plan à un organisateur.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {subscriptions.map(sub => {
                const isExpanded = expandedOrg === sub.id;
                const ticketPct = sub.plan.maxTickets === -1 ? 0 : Math.min(100, (sub.ticketsUsed / sub.plan.maxTickets) * 100);
                const badgePct  = sub.plan.maxBadges  === -1 ? 0 : Math.min(100, (sub.badgesUsed  / sub.plan.maxBadges)  * 100);

                return (
                  <div key={sub.id}>
                    <div
                      className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => setExpandedOrg(isExpanded ? null : sub.id)}
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {(sub.organizer?.firstName?.[0] ?? '?').toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {sub.organizer?.firstName} {sub.organizer?.lastName}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{sub.organizer?.email}</p>
                      </div>

                      {/* Plan badge */}
                      <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2.5 py-1 rounded-full">
                        <Zap className="h-3 w-3" />{sub.plan.name}
                      </span>

                      {/* Status */}
                      <div className="hidden sm:block">{statusChip(sub.status)}</div>

                      {/* Usage quick */}
                      <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
                        <span>{sub.ticketsUsed} / {formatLimit(sub.plan.maxTickets)} billets</span>
                        <span>{sub.badgesUsed} / {formatLimit(sub.plan.maxBadges)} badges</span>
                      </div>

                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-5 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                          {/* Ticket quota */}
                          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Ticket className="h-3.5 w-3.5" />Billets générés</span>
                              <span className="text-xs font-bold text-gray-900 dark:text-white">{sub.ticketsUsed} / {formatLimit(sub.plan.maxTickets)}</span>
                            </div>
                            {sub.plan.maxTickets !== -1 && (
                              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all', ticketPct > 90 ? 'bg-red-500' : ticketPct > 70 ? 'bg-amber-500' : 'bg-indigo-500')}
                                  style={{ width: `${ticketPct}%` }}
                                />
                              </div>
                            )}
                            {sub.plan.maxTickets === -1 && <p className="text-xs text-indigo-500 flex items-center gap-1"><Infinity className="h-3 w-3" /> Illimité</p>}
                          </div>

                          {/* Badge quota */}
                          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Users className="h-3.5 w-3.5" />Badges générés</span>
                              <span className="text-xs font-bold text-gray-900 dark:text-white">{sub.badgesUsed} / {formatLimit(sub.plan.maxBadges)}</span>
                            </div>
                            {sub.plan.maxBadges !== -1 && (
                              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all', badgePct > 90 ? 'bg-red-500' : badgePct > 70 ? 'bg-amber-500' : 'bg-purple-500')}
                                  style={{ width: `${badgePct}%` }}
                                />
                              </div>
                            )}
                            {sub.plan.maxBadges === -1 && <p className="text-xs text-indigo-500 flex items-center gap-1"><Infinity className="h-3 w-3" /> Illimité</p>}
                          </div>
                        </div>

                        {/* Meta */}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />
                            Depuis le {format(new Date(sub.startsAt), 'd MMM yyyy', { locale: fr })}
                          </span>
                          {sub.expiresAt && (
                            <span className="flex items-center gap-1">
                              {new Date(sub.expiresAt) < new Date()
                                ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                                : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                              Expire le {format(new Date(sub.expiresAt), 'd MMM yyyy', { locale: fr })}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            Communication : {sub.plan.allowCommunication ? <span className="text-emerald-600">Activée</span> : <span className="text-red-500">Désactivée</span>}
                          </span>
                          <span className="flex items-center gap-1">
                            Logo ZAYA : {sub.plan.showPoweredBy ? <span className="text-amber-600">Affiché</span> : <span className="text-emerald-600">Masqué</span>}
                          </span>
                          {sub.notes && <span className="italic">{sub.notes}</span>}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setAssignModal(sub)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Modifier l'abonnement
                          </button>
                          <button
                            onClick={() => { if (confirm('Remettre les compteurs à zéro ?')) resetQuotaMut.mutate(sub.organizerId); }}
                            disabled={resetQuotaMut.isPending}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Remettre quotas à zéro
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {planModal && (
        <PlanForm
          plan={planModal === 'create' ? undefined : planModal}
          onClose={() => setPlanModal(null)}
          onSave={(data) => {
            if (planModal === 'create') {
              // isActive n'est pas dans CreatePlanDto (forbidNonWhitelisted=true côté backend)
              const { isActive: _ignored, ...createPayload } = data;
              createPlanMut.mutate(createPayload);
            } else {
              updatePlanMut.mutate({ id: (planModal as SubscriptionPlan).id, data });
            }
          }}
          saving={savingPlan}
        />
      )}

      {assignModal && (
        <AssignModal
          sub={assignModal}
          plans={plans}
          onClose={() => setAssignModal(null)}
          onSave={(data) => updateSubMut.mutate({ organizerId: assignModal.organizerId, data })}
          saving={savingSub}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
