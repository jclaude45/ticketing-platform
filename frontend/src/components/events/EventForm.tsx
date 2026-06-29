'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Loader2, MapPin, Users, Building, Plus, Trash2, Tag } from 'lucide-react';
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

function Field({ label, error, children, required }: {
  label: string; error?: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all';

function toISOString(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

function toLocalDateTime(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

const COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#d97706', '#16a34a', '#0891b2', '#374151'];

function newTariff(): TariffInput {
  return { _key: crypto.randomUUID(), name: '', price: 0, quantity: 100, color: '#4f46e5' };
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
        color: t.color ?? '#4f46e5',
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
        className="space-y-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left column ── */}
          <div className="space-y-5">
            <Field label="Nom de l'événement" error={errors.name?.message} required>
              <input {...register('name')} placeholder="Conférence Tech 2026" className={inputClass} />
            </Field>

            <Field label="Type d'événement" error={errors.type?.message} required>
              <div className="grid grid-cols-3 gap-2">
                {EVENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setValue('type', t.value as any, { shouldValidate: true })}
                    className={cn(
                      'py-2 px-3 rounded-xl border text-xs font-medium transition-all text-center',
                      eventType === t.value
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-indigo-300',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <input type="hidden" {...register('type')} />
            </Field>

            <Field label="Devise de l'événement" error={(errors as any).currency?.message} required>
              <div className="grid grid-cols-5 gap-2">
                {EVENT_CURRENCIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setValue('currency' as any, c.value, { shouldValidate: true })}
                    className={cn(
                      'py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center',
                      currency === c.value
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-indigo-300',
                    )}
                  >
                    {c.value}
                  </button>
                ))}
              </div>
              {currency && (
                <p className="mt-1.5 text-xs text-gray-500">
                  {EVENT_CURRENCIES.find(c => c.value === currency)?.label}
                </p>
              )}
              <input type="hidden" {...register('currency' as any)} />
            </Field>

            <Field label="Description" error={errors.description?.message}>
              <textarea
                {...register('description')}
                rows={3}
                placeholder="Décrivez votre événement..."
                className={cn(inputClass, 'resize-none')}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Date de début" error={errors.startDate?.message} required>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input {...register('startDate')} type="datetime-local" className={cn(inputClass, 'pl-9')} />
                </div>
              </Field>
              <Field label="Date de fin" error={errors.endDate?.message} required>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input {...register('endDate')} type="datetime-local" className={cn(inputClass, 'pl-9')} />
                </div>
              </Field>
            </div>

            <Field label="Lieu" error={errors.venue?.message} required>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input {...register('venue')} placeholder="Grand Convention Center" className={cn(inputClass, 'pl-9')} />
              </div>
            </Field>

            <Field label="Adresse" error={errors.address?.message}>
              <input {...register('address')} placeholder="123 rue Principale (optionnel)" className={inputClass} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Ville" error={errors.city?.message} required>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input {...register('city')} placeholder="Kinshasa" className={cn(inputClass, 'pl-9')} />
                </div>
              </Field>
              <Field label="Pays" error={errors.country?.message} required>
                <input {...register('country')} placeholder="RDC" className={inputClass} />
              </Field>
            </div>

            <Field label="Capacité totale" error={errors.totalCapacity?.message} required>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  {...register('totalCapacity', { valueAsNumber: true })}
                  type="number"
                  min={1}
                  placeholder="500"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </Field>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">
            <Field label="Image de couverture" error={errors.bannerUrl?.message}>
              <FileUpload
                preview={bannerUrl}
                onFileSelect={(_, preview) => setValue('bannerUrl', preview)}
                onClear={() => setValue('bannerUrl', '')}
                label="Ajouter une image de couverture"
                description="Recommandé : 1200×630px, max 5 Mo"
              />
            </Field>

            {bannerUrl && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Aperçu</p>
                <img src={bannerUrl} alt="Cover" className="w-full h-48 object-cover rounded-lg" />
              </motion.div>
            )}

            {/* ── Tarifs ── */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-indigo-500" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tarifs</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTariffs(prev => [...prev, newTariff()])}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter
                </button>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {tariffs.map((t, i) => (
                  <div key={t._key} className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 flex-wrap">
                        {COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => updateTariff(t._key, 'color', c)}
                            className={cn(
                              'w-5 h-5 rounded-full transition-all border-2',
                              t.color === c
                                ? 'border-gray-800 dark:border-white scale-110'
                                : 'border-transparent',
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      {tariffs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTariff(t._key)}
                          className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder={`Nom du tarif ${i + 1} (ex: VIP, Standard, Gratuit)`}
                      value={t.name}
                      onChange={e => updateTariff(t._key, 'name', e.target.value)}
                      className={cn(inputClass, 'py-2')}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                          {currency}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="Prix"
                          value={t.price}
                          onChange={e => updateTariff(t._key, 'price', Number(e.target.value))}
                          className={cn(inputClass, 'pl-12 py-2')}
                        />
                      </div>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                        <input
                          type="number"
                          min={1}
                          placeholder="Places"
                          value={t.quantity}
                          onChange={e => updateTariff(t._key, 'quantity', Number(e.target.value))}
                          className={cn(inputClass, 'pl-9 py-2')}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="px-4 py-2 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800">
                Les tarifs seront disponibles dans l&apos;éditeur de billets pour créer des designs associés.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
          <a
            href="/dashboard/events"
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Annuler
          </a>
          <button type="submit" disabled={saving} className="btn-primary gap-2 min-w-[140px]">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEdit ? 'Enregistrement...' : 'Création...'}
              </>
            ) : isEdit ? (
              'Enregistrer'
            ) : (
              "Créer l'événement"
            )}
          </button>
        </div>
      </motion.form>
    </>
  );
}
