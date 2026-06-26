'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ticket, Loader2, Plus, Trash2,
  Users, Hash, CheckCircle2, Sparkles, AlertTriangle, Upload, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';
import { UpgradePlanModal } from '@/components/subscription/UpgradePlanModal';

// ── CSV helpers ───────────────────────────────────────────────────────────────
function parseCSV(text: string): Array<{ holderName: string; holderEmail: string }> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // Skip header row if it starts with "nom" or "name" (case-insensitive)
  const dataLines = lines[0]?.toLowerCase().match(/^(nom|name|pr[eé]nom|participant)/) ? lines.slice(1) : lines;
  return dataLines
    .map(line => {
      const sep = line.includes(';') ? ';' : ',';
      const parts = line.split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''));
      return { holderName: parts[0] ?? '', holderEmail: parts[1] ?? '' };
    })
    .filter(h => h.holderName.length > 0);
}

const CSV_TEMPLATE = 'Nom Complet,Email\nJean Dupont,jean@example.com\nMarie Martin,marie@example.com\n';

function downloadCSVTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'modele-participants.csv' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Types & Schema ────────────────────────────────────────────────────────────
const holderSchema = z.object({
  holderName:  z.string().optional(),
  holderEmail: z.string().email('Email invalide').optional().or(z.literal('')),
});

const schema = z.object({
  templateId: z.string().min(1, 'Sélectionnez un template'),
  mode: z.enum(['count', 'named']),
  count: z.coerce.number().int().min(1).max(10000),
  holders: z.array(holderSchema).optional(),
});

type FormData = z.infer<typeof schema>;

const QUICK_COUNTS = [50, 100, 250, 500, 1000, 2000, 5000];

interface Props {
  eventId: string;
}

export function GenerateTicketsForm({ eventId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [generatedIds, setGeneratedIds] = useState<string[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch templates ─────────────────────────────────────────────────────
  const { data: templates = [], isLoading: tplLoading } = useQuery({
    queryKey: ['ticket-templates', eventId],
    queryFn: async () => {
      const res = await apiClient.get(`/events/${eventId}/templates`);
      return (res.data as any)?.data ?? [];
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'count', count: 100, holders: [] },
  });

  const mode = watch('mode');
  const count = watch('count');
  const templateId = watch('templateId');
  const holders = watch('holders') ?? [];
  // Only rows with an actual name produce a ticket
  const namedCount = holders.filter((h) => h.holderName && h.holderName.trim().length > 0).length;

  const selectedTemplate = templates.find((t: any) => t.id === templateId);

  // ── Generate mutation ────────────────────────────────────────────────────
  const generate = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: Record<string, unknown> = { templateId: data.templateId };
      // Drop empty rows so blank holders never inflate the ticket count
      const validHolders = (data.holders ?? []).filter(
        (h) => h.holderName && h.holderName.trim().length > 0,
      );
      if (data.mode === 'named') {
        if (validHolders.length === 0) {
          throw new Error('Ajoutez au moins un participant nommé.');
        }
        payload.holders = validHolders;
      } else {
        payload.count = data.count;
      }
      return apiClient.post(`/events/${eventId}/tickets/generate`, payload);
    },
    onSuccess: (res) => {
      const payload = (res.data as any)?.data;
      const count = payload?.count ?? 0;
      const ids: string[] = (payload?.tickets ?? []).map((t: any) => t.id);
      setGeneratedCount(count);
      setGeneratedIds(ids);
      setStep(3);
      // ['tickets', eventId]  — refreshes the ticket list
      // ['events', eventId]   — refreshes event in the events-list cache
      // ['event', eventId]    — refreshes the single-event query powering the capacity banner
      queryClient.invalidateQueries({ queryKey: ['tickets', eventId], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['events', eventId], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['event', eventId], refetchType: 'all' });
    },
    onError: (err: any) => {
      if (err?.response?.status === 403) {
        setUpgradeOpen(true);
      } else {
        toast.error(err?.response?.data?.message ?? 'Erreur lors de la génération');
      }
    },
  });

  const addHolder = () => {
    setValue('holders', [...holders, { holderName: '', holderEmail: '' }]);
  };

  const removeHolder = (i: number) => {
    setValue('holders', holders.filter((_, idx) => idx !== i));
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error('Aucun participant trouvé dans le fichier CSV.');
        return;
      }
      setValue('holders', [...holders, ...parsed]);
      toast.success(`${parsed.length} participant(s) importé(s)`);
    };
    reader.readAsText(file, 'UTF-8');
    // Reset so the same file can be re-imported if needed
    e.target.value = '';
  };

  // ── Step 3 — Success ─────────────────────────────────────────────────────
  if (step === 3) {
    return (
      <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 rounded-xl border border-emerald-200 bg-emerald-50 p-10 text-center"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-emerald-900">
            {generatedCount.toLocaleString('fr-FR')} billets générés !
          </h2>
          <p className="mt-2 text-sm text-emerald-700">
            Chaque billet est signé cryptographiquement avec RSA-4096.
            Les QR codes sont prêts à être scannés.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => router.push(`/dashboard/events/${eventId}/tickets`)}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            Voir les billets
          </button>
          <button
            onClick={() => {
              setStep(1);
              setGeneratedCount(0);
              setGeneratedIds([]);
            }}
            className="rounded-lg border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Générer d'autres billets
          </button>
          <button
            onClick={async () => {
              try {
                // Export only the tickets just generated (by their IDs) — not all event tickets.
                const res = await apiClient.request<ArrayBuffer>({
                  method: 'POST',
                  url: `/events/${eventId}/tickets/export/pdf-grouped/selection`,
                  data: { ticketIds: generatedIds },
                  responseType: 'arraybuffer',
                });
                const blob = new Blob([res.data], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = Object.assign(document.createElement('a'), {
                  href: url, download: `tickets-${eventId}.pdf`,
                });
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
              } catch (err: any) {
                if (err?.response?.status === 403) {
                  setUpgradeOpen(true);
                } else {
                  const d = err?.response?.data;
                  let msg = "Erreur lors de l'export PDF";
                  if (d instanceof ArrayBuffer) {
                    try { msg = JSON.parse(new TextDecoder().decode(d))?.message ?? msg; } catch { /* */ }
                  } else if (d?.message) {
                    msg = d.message;
                  }
                  toast.error(msg, { duration: 5000 });
                }
              }
            }}
            className="rounded-lg border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Exporter PDF
          </button>
        </div>
      </motion.div>
      <UpgradePlanModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        featureName="La génération ou l'export de billets"
      />
    </>
    );
  }

  return (
    <>
    <form onSubmit={handleSubmit((d) => generate.mutate(d))} className="space-y-6">

      {/* Progress steps */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: 'Template' },
          { n: 2, label: 'Quantité' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
              step >= s.n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400',
            )}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span className={cn('text-sm font-medium', step >= s.n ? 'text-gray-900' : 'text-gray-400')}>
              {s.label}
            </span>
            {i < 1 && <div className={cn('h-px w-8 flex-shrink-0', step > s.n ? 'bg-indigo-400' : 'bg-gray-200')} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1 : Template selection ─────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                1. Choisir le type de billet
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Sélectionnez le template qui définit le design et le prix des billets
              </p>

              {errors.templateId && (
                <p className="mb-3 text-xs text-red-500">{errors.templateId.message}</p>
              )}

              {tplLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement des templates…
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
                  <Ticket className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Aucun template de billet</p>
                  <a href={`/dashboard/events/${eventId}/tickets/template`} className="text-xs text-indigo-600 hover:underline mt-1 block">
                    Créer un template d'abord →
                  </a>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {templates.map((tpl: any) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setValue('templateId', tpl.id, { shouldValidate: true })}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                        templateId === tpl.id
                          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300',
                      )}
                    >
                      {/* Color swatch */}
                      <div
                        className="h-10 w-10 flex-shrink-0 rounded-lg shadow-sm"
                        style={{ backgroundColor: tpl.color ?? '#6366f1' }}
                      />
                      <div className="min-w-0">
                        <p className={cn('text-sm font-semibold', templateId === tpl.id ? 'text-indigo-700' : 'text-gray-800')}>
                          {tpl.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {Number(tpl.price ?? 0).toFixed(2)} {tpl.currency} · {tpl.availableCount?.toLocaleString('fr-FR') ?? '—'} disponibles
                        </p>
                        {tpl.description && (
                          <p className="text-xs text-gray-400 mt-1 truncate">{tpl.description}</p>
                        )}
                      </div>
                      {templateId === tpl.id && (
                        <CheckCircle2 className="h-4 w-4 text-indigo-600 ml-auto flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {selectedTemplate && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                  <span className="text-sm text-indigo-700">
                    <span className="font-semibold">{selectedTemplate.name}</span> sélectionné ·{' '}
                    {selectedTemplate.availableCount?.toLocaleString('fr-FR')} billets disponibles
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!templateId}
                onClick={() => setStep(2)}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                Suivant →
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2 : Quantity / Holders ──────────────────────────────── */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">

            {/* Mode selector */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">2. Mode de génération</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'count', icon: <Hash className="h-5 w-5" />, label: 'Par quantité', desc: 'Générer N billets anonymes' },
                  { value: 'named', icon: <Users className="h-5 w-5" />, label: 'Nominatifs', desc: 'Un billet par participant nommé' },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setValue('mode', m.value as 'count' | 'named')}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all',
                      mode === m.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', mode === m.value ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500')}>
                      {m.icon}
                    </div>
                    <div>
                      <p className={cn('text-sm font-semibold', mode === m.value ? 'text-indigo-700' : 'text-gray-800')}>{m.label}</p>
                      <p className="text-xs text-gray-400">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Count mode */}
            {mode === 'count' && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Nombre de billets à générer
                </label>

                {/* Quick select */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {QUICK_COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setValue('count', n)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                        count === n ? 'bg-indigo-600 text-white shadow-sm' : 'border border-gray-200 text-gray-600 hover:border-indigo-300',
                      )}
                    >
                      {n.toLocaleString('fr-FR')}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <input
                    {...register('count')}
                    type="number"
                    min={1}
                    max={10000}
                    className={cn(
                      'w-40 rounded-lg border px-3 py-2 text-sm text-center font-mono font-bold focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
                      errors.count ? 'border-red-300' : 'border-gray-200',
                    )}
                  />
                  <span className="text-sm text-gray-500">billets anonymes</span>
                </div>
                {errors.count && <p className="mt-1 text-xs text-red-500">{errors.count.message}</p>}

                {/* Warning for large batches */}
                {count > 1000 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      La génération de {count.toLocaleString('fr-FR')} billets peut prendre quelques secondes.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Named mode */}
            {mode === 'named' && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                {/* Hidden CSV file input */}
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleCSVImport}
                />

                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Participants nominatifs</label>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {namedCount} billet{namedCount > 1 ? 's' : ''} à créer
                      {holders.length > namedCount && (
                        <span className="text-amber-500"> · {holders.length - namedCount} ligne(s) vide(s) ignorée(s)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={downloadCSVTemplate}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                      title="Télécharger un modèle CSV"
                    >
                      <Download className="h-3.5 w-3.5" /> Modèle CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => csvInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" /> Importer CSV
                    </button>
                    <button
                      type="button"
                      onClick={addHolder}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Ajouter
                    </button>
                  </div>
                </div>

                {/* CSV format hint */}
                <div className="mb-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
                  Format CSV : <code className="font-mono text-gray-700">Nom Complet, Email</code> — une ligne par participant. Séparateur <code className="font-mono">,</code> ou <code className="font-mono">;</code>. L&apos;email est optionnel.
                </div>

                {holders.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
                    <Users className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">Aucun participant ajouté</p>
                    <button type="button" onClick={addHolder} className="mt-2 text-xs text-indigo-600 hover:underline">
                      Ajouter le premier participant
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {holders.map((_, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                        <span className="text-xs text-gray-400 w-6 text-center font-mono">{i + 1}</span>
                        <input
                          {...register(`holders.${i}.holderName`)}
                          placeholder="Nom complet"
                          className="flex-1 min-w-0 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                        />
                        <input
                          {...register(`holders.${i}.holderEmail`)}
                          placeholder="Email (optionnel)"
                          className="flex-1 min-w-0 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeHolder(i)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Summary before generate */}
            {(mode === 'count' ? count > 0 : namedCount > 0) && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">Récapitulatif</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-indigo-700">
                      <li>Template : <span className="font-medium">{selectedTemplate?.name}</span></li>
                      <li>Quantité : <span className="font-medium">{(mode === 'count' ? count : namedCount).toLocaleString('fr-FR')} billet{(mode === 'count' ? count : namedCount) > 1 ? 's' : ''}</span></li>
                      <li>Numérotation : <span className="font-mono font-medium">EVT…-000001 → EVT…-{String(mode === 'count' ? count : namedCount).padStart(6, '0')}</span></li>
                      <li>Signature : <span className="font-medium">RSA-4096 par billet</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                ← Retour
              </button>
              <button
                type="submit"
                disabled={generate.isPending || (mode === 'named' && namedCount === 0)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm"
              >
                {generate.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Génération en cours…</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Générer les billets</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
    <UpgradePlanModal
      open={upgradeOpen}
      onClose={() => setUpgradeOpen(false)}
      featureName="La génération ou l'export de billets"
    />
    </>
  );
}
