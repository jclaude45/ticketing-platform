'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, Plus, Trash2, Ticket, ImageIcon } from 'lucide-react';
import { createEventSchema, type CreateEventFormData, EVENT_TYPES, EVENT_CURRENCIES } from '@/lib/validations';
import { eventsApi, ticketsApi } from '@/lib/api';
import { FileUpload } from '@/components/common/FileUpload';
import { UpgradePlanModal } from '@/components/subscription/UpgradePlanModal';
import type { Event } from '@/types';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface TariffInput {
  _key: string;
  id?: string;
  name: string;
  price: number;
  quantity: number;
  color: string;
}

interface EventFormProps {
  event?: Event;
  isEdit?: boolean;
}

function Field({ label, error, children, required, hint }: {
  label: string; error?: string; children: React.ReactNode; required?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-black dark:text-gray-200">
        {label} {required && <span className="text-gray-400">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Numbered block of the form, in the zaya.live style */
function Section({ n, title, desc, children }: { n: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-gray-200 py-8 dark:border-gray-800">
      <div className="mb-6 flex items-start gap-4">
        <span className="text-3xl font-black leading-none tracking-tight text-black dark:text-white">{n}</span>
        <div>
          <h2 className="text-lg font-bold uppercase tracking-tight text-black dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500">{desc}</p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-black placeholder:text-gray-400 transition-colors focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-white dark:focus:ring-white';

const chipClass = (active: boolean) => cn(
  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
  active
    ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
    : 'border-gray-200 bg-white text-gray-700 hover:border-black dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-white',
);

function toISOString(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

function toLocalDateTime(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

const COLORS = ['#181818', '#707070', '#db2777', '#dc2626', '#d97706', '#16a34a', '#0891b2', '#374151'];

function newTariff(): TariffInput {
  return { _key: crypto.randomUUID(), name: '', price: 0, quantity: 100, color: '#181818' };
}

export function EventForm({ event, isEdit }: EventFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tariffs, setTariffs] = useState<TariffInput[]>(() => {
    const tpls = (event as any)?.ticketTemplates as any[] | undefined;
    if (tpls && tpls.length > 0) {
      return tpls.map((t: any) => ({
        _key: t.id,
        id: t.id,
        name: t.name,
        price: Number(t.price),
        quantity: t.quantity,
        color: t.color ?? '#181818',
      }));
    }
    return [newTariff()];
  });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: event
      ? {
          name: event.name,
          description: event.description,
          type: event.type ?? 'OTHER',
          currency: (event as any).currency ?? 'USD',
          venue: event.venue,
          address: event.address,
          city: event.city,
          country: event.country,
          startDate: toLocalDateTime(event.startDate),
          endDate: toLocalDateTime(event.endDate),
          totalCapacity: event.totalCapacity,
          bannerUrl: event.bannerUrl,
        }
      : { totalCapacity: 100, type: 'OTHER', currency: 'USD' },
  });

  const bannerUrl = watch('bannerUrl');
  const eventType = watch('type');
  const currency = watch('currency') ?? 'USD';
  const previewName = watch('name');
  const previewStart = watch('startDate');
  const previewVenue = watch('venue');
  const previewCity = watch('city');
  const namedTariffs = tariffs.filter(t => t.name.trim());
  const minPrice = namedTariffs.length > 0 ? Math.min(...namedTariffs.map(t => Number(t.price) || 0)) : null;
  const totalSeats = tariffs.reduce((s, t) => s + (Number(t.quantity) || 0), 0);

  const updateTariff = (key: string, field: keyof TariffInput, value: any) =>
    setTariffs(prev => prev.map(t => t._key === key ? { ...t, [field]: value } : t));

  const removeTariff = (key: string) =>
    setTariffs(prev => (prev.length > 1 ? prev.filter(t => t._key !== key) : prev));

  const syncTariffs = async (eventId: string) => {
    const valid = tariffs.filter(t => t.name.trim());
    for (const t of valid) {
      const meta = { name: t.name, price: t.price, currency, quantity: t.quantity, color: t.color };
      if (t.id) {
        await ticketsApi.updateTemplate(eventId, t.id, { meta, customFields: null as any });
      } else {
        await ticketsApi.createTemplate(eventId, { meta, customFields: null as any });
      }
    }
  };

  const onSubmit = async (data: CreateEventFormData) => {
    setSaving(true);
    const payload = {
      ...data,
      startDate: toISOString(data.startDate),
      endDate: toISOString(data.endDate),
    };

    try {
      if (isEdit && event) {
        await eventsApi.update(event.id, payload);
        await syncTariffs(event.id);
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['ticket-templates', event.id] });
        toast.success('Événement mis à jour !');
      } else {
        const res = await eventsApi.create(payload);
        const created = (res.data as any)?.data ?? res.data;
        const eventId = created.id;
        await syncTariffs(eventId);
        queryClient.invalidateQueries({ queryKey: ['events'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['ticket-templates', eventId] });
        toast.success("Événement créé ! Publiez-le pour qu'il apparaisse sur la billetterie.");
        router.push(`/dashboard/events/${eventId}`);
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setUpgradeOpen(true);
      } else {
        toast.error(err?.response?.data?.message ?? 'Erreur lors de la sauvegarde');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <UpgradePlanModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureName="La création d'événements" />

      <motion.form
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
      >
        <div>
          <Section n="01" title="L'essentiel" desc="Le nom et le type de votre événement.">
            <Field label="Nom de l'événement" error={errors.name?.message} required>
              <input {...register('name')} placeholder="Ex : Fally Ipupu en concert" className={cn(inputClass, 'text-lg font-semibold')} />
            </Field>

            <Field label="Type d'événement" error={errors.type?.message} required>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => setValue('type', t.value as any, { shouldValidate: true })} className={chipClass(eventType === t.value)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <input type="hidden" {...register('type')} />
            </Field>

            <Field label="Description" error={errors.description?.message} hint="Elle apparaît dans la rubrique « À propos » de la page de vente.">
              <textarea {...register('description')} rows={4} placeholder="Décrivez votre événement…" className={cn(inputClass, 'resize-y')} />
            </Field>
          </Section>

          <Section n="02" title="Date et lieu" desc="Quand et où se déroule l'événement.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Début" error={errors.startDate?.message} required>
                <input {...register('startDate')} type="datetime-local" className={inputClass} />
              </Field>
              <Field label="Fin" error={errors.endDate?.message} required>
                <input {...register('endDate')} type="datetime-local" className={inputClass} />
              </Field>
            </div>
            <Field label="Lieu" error={errors.venue?.message} required>
              <input {...register('venue')} placeholder="Ex : Show Buzz" className={inputClass} />
            </Field>
            <Field label="Adresse" error={errors.address?.message} hint="Facultatif — utilisée pour le bouton « Ouvrir dans Maps ».">
              <input {...register('address')} placeholder="Ex : 12 avenue de la Justice" className={inputClass} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Ville" error={errors.city?.message} required>
                <input {...register('city')} placeholder="Kinshasa" className={inputClass} />
              </Field>
              <Field label="Pays" error={errors.country?.message} required>
                <input {...register('country')} placeholder="RD Congo" className={inputClass} />
              </Field>
            </div>
          </Section>

          <Section n="03" title="Billetterie" desc="Devise, capacité et tarifs proposés au public.">
            <Field label="Devise" error={(errors as any).currency?.message} required hint={EVENT_CURRENCIES.find(c => c.value === currency)?.label}>
              <div className="flex flex-wrap gap-2">
                {EVENT_CURRENCIES.map(c => (
                  <button key={c.value} type="button" onClick={() => setValue('currency' as any, c.value, { shouldValidate: true })} className={cn(chipClass(currency === c.value), 'min-w-[64px] font-bold')}>
                    {c.value}
                  </button>
                ))}
              </div>
              <input type="hidden" {...register('currency' as any)} />
            </Field>

            <Field
              label="Capacité totale"
              error={errors.totalCapacity?.message}
              required
              hint={totalSeats > 0 ? `Vos tarifs totalisent ${totalSeats.toLocaleString('fr-FR')} places.` : undefined}
            >
              <input {...register('totalCapacity', { valueAsNumber: true })} type="number" min={1} placeholder="500" className={cn(inputClass, 'sm:max-w-[220px]')} />
            </Field>

            <div>
              <p className="mb-2 text-sm font-medium text-black dark:text-gray-200">Tarifs</p>
              <div>
                {tariffs.map((t, i) => (
                  <div key={t._key} className="border-b border-gray-200 py-4 first:border-t dark:border-gray-800">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px_120px_auto] sm:items-end">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Nom du tarif</label>
                        <input
                          type="text"
                          placeholder={i === 0 ? 'Standard' : 'VIP'}
                          value={t.name}
                          onChange={e => updateTariff(t._key, 'name', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Prix ({currency})</label>
                        <input type="number" min={0} step={0.01} value={t.price} onChange={e => updateTariff(t._key, 'price', Number(e.target.value))} className={inputClass} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Places</label>
                        <input type="number" min={1} value={t.quantity} onChange={e => updateTariff(t._key, 'quantity', Number(e.target.value))} className={inputClass} />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTariff(t._key)}
                        disabled={tariffs.length <= 1}
                        aria-label="Supprimer ce tarif"
                        className="flex h-[50px] w-[50px] items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 disabled:pointer-events-none disabled:opacity-0 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Couleur</span>
                      {COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateTariff(t._key, 'color', c)}
                          aria-label={`Couleur ${c}`}
                          className={cn('h-5 w-5 rounded-full border-2 transition-transform', t.color === c ? 'scale-110 border-[#FFDD00]' : 'border-transparent')}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setTariffs(prev => [...prev, newTariff()])}
                className="mt-3 flex items-center gap-2 rounded-full border border-dashed border-gray-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:border-black dark:border-gray-600 dark:text-white"
              >
                <Plus className="h-4 w-4" /> Ajouter un tarif
              </button>
              <p className="mt-2 text-xs text-gray-500">Mettez le prix à 0 pour un tarif gratuit. Chaque tarif aura son design dans l&apos;éditeur de billets.</p>
            </div>
          </Section>

          <Section n="04" title="Visuel" desc="L'affiche montrée sur la billetterie et la page de vente.">
            <Field label="Affiche" error={errors.bannerUrl?.message} hint="Format carré conseillé (1080 × 1080 px), 5 Mo maximum.">
              <FileUpload
                preview={bannerUrl}
                onFileSelect={(_, preview) => setValue('bannerUrl', preview)}
                onClear={() => setValue('bannerUrl', '')}
                label="Ajouter l'affiche"
                description="Glissez une image ici ou cliquez pour choisir"
              />
            </Field>
          </Section>
        </div>

        {/* ── Live preview + actions ── */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="border-b border-gray-200 bg-white py-5 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-gray-400">Aperçu sur la billetterie</p>
            <div className="relative aspect-square overflow-hidden rounded-[18px] bg-[#eee] dark:bg-gray-800">
              {bannerUrl
                ? <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400"><ImageIcon className="h-10 w-10" strokeWidth={1.4} /><span className="text-xs">Votre affiche</span></div>}
            </div>
            <p className="mt-3 truncate text-lg text-black dark:text-white">{previewName || 'Nom de l\'événement'}</p>
            <div className="mt-1 space-y-1 text-[15px] font-light text-gray-500">
              <p>{previewStart ? new Date(previewStart).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Date'}</p>
              <p className="truncate">{[previewVenue, previewCity].filter(Boolean).join(', ') || 'Lieu'}</p>
              <p className="flex items-center gap-1.5">
                <Ticket className="h-4 w-4" />
                {minPrice === null ? 'Aucun tarif' : minPrice === 0 ? 'Gratuit' : `À partir de ${minPrice.toLocaleString('fr-FR')} ${currency}`}
              </p>
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn-primary h-12 w-full gap-2 text-base">
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{isEdit ? 'Enregistrement…' : 'Création…'}</>
            ) : isEdit ? 'Enregistrer' : "Créer l'événement"}
          </button>
          <a
            href={isEdit && event ? `/dashboard/events/${event.id}` : '/dashboard/events'}
            className="block rounded-full border border-gray-200 py-3 text-center text-sm font-medium text-gray-700 transition-colors hover:border-black hover:text-black dark:border-gray-700 dark:text-gray-300 dark:hover:border-white dark:hover:text-white"
          >
            Annuler
          </a>
          {!isEdit && (
            <p className="text-center text-xs text-gray-500">L&apos;événement est créé en brouillon : vous le publierez quand tout sera prêt.</p>
          )}
        </aside>
      </motion.form>
    </>
  );
}
