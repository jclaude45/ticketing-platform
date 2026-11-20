'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ClipboardList, Loader2, Plus, QrCode, RefreshCw, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DEFAULT_TIME_ZONE, isoToWall, wallToIso, zoneCity } from '@/lib/timezone';

export type FieldType = 'CHOICE' | 'TEXT' | 'YESNO';
export interface FormOption { id: string; label: string; limit?: number | null }
export interface FormField {
  id: string; type: FieldType; label: string; help?: string | null; required: boolean;
  options?: FormOption[]; templateIds?: string[];
}
export interface GuestForm {
  enabled: boolean; deadline: string | null; intro: string | null;
  askPhone: 'HIDDEN' | 'OPTIONAL' | 'REQUIRED'; fields: FormField[];
  /** Shared link: the same QR on every paper invitation, whoever opens it signs up */
  openEnabled?: boolean; openTemplateId?: string | null; openLimit?: number | null;
  openUrl?: string | null; openCount?: number;
}

const TYPE_LABELS: Record<FieldType, string> = { CHOICE: 'Liste de choix', YESNO: 'Oui / Non', TEXT: 'Texte libre' };
/** Ready-made questions: the organizer adjusts them */
const PRESETS: { label: string; make: () => Omit<FormField, 'id'> }[] = [
  { label: 'Taille de t-shirt', make: () => ({ type: 'CHOICE', label: 'Taille de t-shirt', required: true, options: ['S', 'M', 'L', 'XL', 'XXL'].map(opt) }) },
  { label: 'Table / place', make: () => ({ type: 'CHOICE', label: 'Table', required: true, options: [opt('Table 1', 10), opt('Table 2', 10)] }) },
  { label: 'Boisson', make: () => ({ type: 'CHOICE', label: 'Boisson', required: false, options: ['Eau', 'Jus', 'Soda', 'Vin', 'Bière'].map(opt) }) },
  { label: 'Repas', make: () => ({ type: 'CHOICE', label: 'Repas', required: false, options: ['Viande', 'Poisson', 'Végétarien'].map(opt) }) },
  { label: 'Allergies', make: () => ({ type: 'TEXT', label: 'Allergies ou régime alimentaire', required: false }) },
];

const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
function opt(label: string, limit?: number): FormOption { return { id: newId(), label, limit: limit ?? null }; }

const input = 'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none';

/**
 * The confirmation form of an event's invitations: when on, each guest gets a link to confirm
 * (and answer these questions) before receiving their ticket.
 */
export function GuestFormEditor({ eventId, form, templates, timeZone = DEFAULT_TIME_ZONE, capacityAvailable = 0 }: {
  eventId: string; form: GuestForm | undefined; templates: { id: string; name: string; capacityPool?: boolean }[];
  /** Seats of the capacity left by the tariffs, offered to the shared QR */
  capacityAvailable?: number;
  /** The event's zone: the deadline is typed in its time */
  timeZone?: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<GuestForm | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (form && !dirty) setDraft({ ...form, fields: form.fields ?? [] });
  }, [form, dirty]);

  const save = useMutation({
    mutationFn: async (f: GuestForm) => apiClient.put(`/events/${eventId}/invitations/form`, {
      enabled: f.enabled,
      deadline: f.deadline || null,
      intro: f.intro?.trim() || null,
      askPhone: f.askPhone,
      fields: f.fields.map((x) => ({
        ...x,
        options: x.type === 'CHOICE' ? x.options?.map((o) => ({ ...o, limit: o.limit || null })) : undefined,
      })),
      openEnabled: !!f.openEnabled,
      openTemplateId: f.openTemplateId || null,
      openLimit: f.openLimit || null,
    }),
    onSuccess: () => {
      toast.success('Formulaire enregistré');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['guest-form', eventId] });
      queryClient.invalidateQueries({ queryKey: ['invitations', eventId] });
    },
    onError: (err: any) => {
      const m = err?.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m ?? "Impossible d'enregistrer le formulaire");
    },
  });

  if (!draft) return null;
  const update = (patch: Partial<GuestForm>) => { setDraft({ ...draft, ...patch }); setDirty(true); };
  const setField = (i: number, patch: Partial<FormField>) =>
    update({ fields: draft.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const move = (i: number, by: number) => {
    const fields = [...draft.fields];
    const [f] = fields.splice(i, 1);
    fields.splice(i + by, 0, f);
    update({ fields });
  };
  const add = (f: Omit<FormField, 'id'>) => update({ fields: [...draft.fields, { ...f, id: newId() }] });

  return (
    <div className="flex flex-col gap-5">
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Confirmation de présence</h2>
            <p className="text-sm text-gray-500">
              {draft.enabled
                ? 'Chaque invité reçoit un lien : il confirme, répond à vos questions, puis reçoit son billet.'
                : 'Désactivée : chaque invité reçoit directement son billet.'}
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
          Demander une confirmation
        </label>
      </div>

      {/* The questions also serve sign-ups through the shared QR */}
      {(draft.enabled || draft.openEnabled) && (
        <div className="mt-5 flex flex-col gap-5 border-t border-gray-100 pt-5 dark:border-gray-800">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Date limite de réponse</span>
              <input type="datetime-local" value={isoToWall(draft.deadline, timeZone)}
                onChange={(e) => update({ deadline: e.target.value ? wallToIso(e.target.value, timeZone) || null : null })} className={input} />
              <span className="mt-1 block text-xs text-gray-500">
                Heure de {zoneCity(timeZone)}. Vide : jusqu&apos;au début de l&apos;événement. Avant cette date, l&apos;invité peut modifier ou décliner.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Téléphone de l&apos;invité</span>
              <select value={draft.askPhone} onChange={(e) => update({ askPhone: e.target.value as GuestForm['askPhone'] })} className={input}>
                <option value="OPTIONAL">Facultatif</option>
                <option value="REQUIRED">Obligatoire</option>
                <option value="HIDDEN">Ne pas demander</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Texte d&apos;accueil <span className="font-normal text-gray-400">(optionnel)</span></span>
            <textarea value={draft.intro ?? ''} onChange={(e) => update({ intro: e.target.value })} maxLength={1000} rows={2}
              placeholder="Merci de confirmer votre présence et de choisir votre taille de t-shirt." className={input} />
          </label>

          {/* Questions */}
          <div className="flex flex-col gap-3">
            {draft.fields.map((f, i) => (
              <div key={f.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} maxLength={120} placeholder="Question" className={cn(input, 'flex-1 font-medium')} />
                  <select value={f.type} onChange={(e) => {
                    const type = e.target.value as FieldType;
                    setField(i, { type, options: type === 'CHOICE' ? (f.options?.length ? f.options : [opt('Choix 1')]) : undefined });
                  }} className={cn(input, 'sm:w-44')}>
                    {(Object.keys(TYPE_LABELS) as FieldType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <IconButton label="Monter" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></IconButton>
                    <IconButton label="Descendre" disabled={i === draft.fields.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></IconButton>
                    <IconButton label="Supprimer" danger onClick={() => update({ fields: draft.fields.filter((_, idx) => idx !== i) })}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                </div>

                {f.type === 'CHOICE' && (
                  <div className="mt-3 flex flex-col gap-2 sm:pl-4">
                    {f.options!.map((o, j) => (
                      <div key={o.id} className="flex gap-2">
                        <input value={o.label} maxLength={80} placeholder={`Choix ${j + 1}`}
                          onChange={(e) => setField(i, { options: f.options!.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })}
                          className={cn(input, 'flex-1')} />
                        <input type="number" min={1} value={o.limit ?? ''} placeholder="Places : illimité"
                          onChange={(e) => setField(i, { options: f.options!.map((x, k) => (k === j ? { ...x, limit: e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : null } : x)) })}
                          className={cn(input, 'w-36')} title="Nombre maximum d'invités pouvant choisir cette option" />
                        <IconButton label="Retirer ce choix" danger disabled={f.options!.length === 1}
                          onClick={() => setField(i, { options: f.options!.filter((_, k) => k !== j) })}><Trash2 className="h-4 w-4" /></IconButton>
                      </div>
                    ))}
                    <button type="button" onClick={() => setField(i, { options: [...f.options!, opt(`Choix ${f.options!.length + 1}`)] })}
                      className="inline-flex items-center gap-1 self-start text-sm font-medium text-indigo-600 hover:underline">
                      <Plus className="h-4 w-4" /> Ajouter un choix
                    </button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                    Réponse obligatoire
                  </label>
                  {templates.length > 1 && (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      Pour :
                      {templates.map((t) => {
                        const on = !!f.templateIds?.includes(t.id);
                        return (
                          <button key={t.id} type="button"
                            onClick={() => setField(i, { templateIds: on ? f.templateIds!.filter((x) => x !== t.id) : [...(f.templateIds ?? []), t.id] })}
                            className={cn('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30' : 'border-gray-300 dark:border-gray-600')}>
                            {t.name}
                          </button>
                        );
                      })}
                      {!f.templateIds?.length && <span className="text-xs text-gray-400">(toutes les catégories)</span>}
                    </span>
                  )}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => add({ type: 'CHOICE', label: '', required: false, options: [opt('Choix 1')] })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900 dark:hover:bg-indigo-900/20">
                <Plus className="h-4 w-4" /> Ajouter une question
              </button>
              <span className="text-xs text-gray-400">ou :</span>
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => add(p.make())}
                  className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:border-indigo-400 dark:border-gray-600 dark:text-gray-300">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </section>

      <SharedLink eventId={eventId} draft={draft} update={update} templates={templates} saved={form} dirty={dirty} capacityAvailable={capacityAvailable} />

      {dirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
          <span className="mr-auto text-sm text-gray-600 dark:text-gray-400">Modifications non enregistrées</span>
          <button type="button" onClick={() => { setDirty(false); setDraft(form ? { ...form } : null); }} className="text-sm text-gray-500 hover:underline">
            Annuler
          </button>
          <button type="button" onClick={() => save.mutate(draft)} disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

/** The same QR for every paper invitation: whoever scans it signs up (up to a number of places) */
function SharedLink({ eventId, draft, update, templates, saved, dirty, capacityAvailable }: {
  eventId: string; draft: GuestForm; update: (p: Partial<GuestForm>) => void;
  templates: { id: string; name: string; capacityPool?: boolean }[]; saved: GuestForm | undefined; dirty: boolean;
  capacityAvailable: number;
}) {
  // The capacity left by the tariffs: its hidden category once made, CAPACITY before that
  const pool = templates.find((t) => t.capacityPool);
  const queryClient = useQueryClient();
  const regenerate = useMutation({
    mutationFn: async () => apiClient.post(`/events/${eventId}/invitations/form/open-link/regenerate`),
    onSuccess: () => {
      toast.success('Nouveau lien créé : les anciens QR ne fonctionnent plus');
      queryClient.invalidateQueries({ queryKey: ['guest-form', eventId] });
    },
    onError: () => toast.error('Impossible de régénérer le lien'),
  });
  const downloadQr = async () => {
    try {
      const res = await apiClient.get(`/events/${eventId}/invitations/form/open-link/qr`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'qr-invitation.png' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Impossible de télécharger le QR');
    }
  };
  const live = saved?.openEnabled && saved.openUrl;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <QrCode className="mt-0.5 h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">QR commun d&apos;inscription</h2>
            <p className="text-sm text-gray-500">
              Le même QR sur toutes vos invitations papier ou vos affiches : quiconque le scanne s&apos;inscrit (nom, e-mail, vos questions) et reçoit son billet.
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={!!draft.openEnabled} onChange={(e) => update({ openEnabled: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
          Activer
        </label>
      </div>
      {draft.openEnabled && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Catégorie des invitations *</span>
            <select value={draft.openTemplateId ?? ''} onChange={(e) => update({ openTemplateId: e.target.value || null })} className={input}>
              <option value="">Choisir…</option>
              <option value={pool?.id ?? 'CAPACITY'}>Capacité d&apos;accueil — {capacityAvailable} place(s) hors tarifs</option>
              {templates.filter((t) => !t.capacityPool).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Inscriptions maximum</span>
            <input type="number" min={1} value={draft.openLimit ?? ''} placeholder="Jusqu'aux places de la catégorie"
              onChange={(e) => update({ openLimit: e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : null })} className={input} />
          </label>
        </div>
      )}
      {draft.openEnabled && live && !dirty && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/50">
          <p className="text-gray-600 dark:text-gray-400">
            {saved!.openCount ?? 0} inscrit(s){saved!.openLimit ? ` sur ${saved!.openLimit}` : ''} par ce QR
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={saved!.openUrl!} onFocus={(e) => e.target.select()} className={cn(input, 'min-w-0 flex-1 font-mono text-xs')} />
            <button type="button" onClick={() => { navigator.clipboard?.writeText(saved!.openUrl!); toast.success('Lien copié'); }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium hover:border-indigo-400 dark:border-gray-600">Copier</button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={downloadQr} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline">
              <QrCode className="h-4 w-4" /> Télécharger le QR (PNG)
            </button>
            <button type="button" disabled={regenerate.isPending}
              onClick={() => { if (window.confirm('Créer un nouveau lien ? Les QR déjà imprimés ne fonctionneront plus.')) regenerate.mutate(); }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 disabled:opacity-50">
              <RefreshCw className="h-4 w-4" /> Régénérer le lien
            </button>
          </div>
        </div>
      )}
      {draft.openEnabled && dirty && <p className="mt-3 text-xs text-gray-500">Enregistrez pour obtenir le lien et son QR.</p>}
    </section>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cn('rounded-lg border border-gray-200 px-2.5 py-2 text-gray-400 transition-colors disabled:opacity-30 dark:border-gray-700',
        danger ? 'hover:border-red-200 hover:text-red-500' : 'hover:border-indigo-200 hover:text-indigo-600')}>
      {children}
    </button>
  );
}
