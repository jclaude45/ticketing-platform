'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Calendar, Loader2, MapPin, Users, Building } from 'lucide-react';
import { createEventSchema, type CreateEventFormData, EVENT_TYPES } from '@/lib/validations';
import { useCreateEvent, useUpdateEvent } from '@/hooks/useEvents';
import { FileUpload } from '@/components/common/FileUpload';
import { UpgradePlanModal } from '@/components/subscription/UpgradePlanModal';
import type { Event } from '@/types';
import { cn } from '@/lib/utils';

interface EventFormProps {
  event?: Event;
  isEdit?: boolean;
}

function Field({
  label, error, children, required,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
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

const inputClass = 'w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all';

// Convert a local datetime-local string to an ISO string for the API
function toISOString(local: string): string {
  if (!local) return '';
  // datetime-local format: "2026-06-20T14:00" — treat as local time
  return new Date(local).toISOString();
}

// Convert an ISO string to datetime-local format for the input
function toLocalDateTime(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 16); // "2026-06-20T14:00"
}

export function EventForm({ event, isEdit }: EventFormProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(event?.id ?? '');
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: event
      ? {
          name: event.name,
          description: event.description,
          type: event.type ?? 'OTHER',
          venue: event.venue,
          address: event.address,
          city: event.city,
          country: event.country,
          startDate: toLocalDateTime(event.startDate),
          endDate: toLocalDateTime(event.endDate),
          totalCapacity: event.totalCapacity,
          bannerUrl: event.bannerUrl,
        }
      : { totalCapacity: 100, type: 'OTHER' },
  });

  const bannerUrl  = watch('bannerUrl');
  const eventType  = watch('type');

  const onSubmit = (data: CreateEventFormData) => {
    const payload = {
      ...data,
      startDate: toISOString(data.startDate),
      endDate: toISOString(data.endDate),
    };
    if (isEdit && event) {
      updateEvent.mutate(payload);
    } else {
      createEvent.mutate(payload, {
        onError: (err: any) => {
          if (err?.response?.status === 403) setUpgradeOpen(true);
        },
      });
    }
  };

  const isPending = isEdit ? updateEvent.isPending : createEvent.isPending;

  return (
    <>
    <UpgradePlanModal
      open={upgradeOpen}
      onClose={() => setUpgradeOpen(false)}
      featureName="La création d'événements"
    />
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
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
                    'flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all',
                    eventType === t.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-indigo-300 hover:bg-indigo-50/50',
                  )}
                >
                  <span className="text-lg leading-none">{t.emoji}</span>
                  <span className="text-center leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
            <input type="hidden" {...register('type')} />
          </Field>

          <Field label="Description" error={errors.description?.message}>
            <textarea
              {...register('description')}
              rows={4}
              placeholder="Décrivez votre événement..."
              className={cn(inputClass, 'resize-none')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date de début" error={errors.startDate?.message} required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  {...register('startDate')}
                  type="datetime-local"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </Field>
            <Field label="Date de fin" error={errors.endDate?.message} required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  {...register('endDate')}
                  type="datetime-local"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </Field>
          </div>

          <Field label="Lieu" error={errors.venue?.message} required>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                {...register('venue')}
                placeholder="Grand Convention Center"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
          </Field>

          <Field label="Adresse" error={errors.address?.message}>
            <input {...register('address')} placeholder="123 rue Principale (optionnel)" className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Ville" error={errors.city?.message} required>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  {...register('city')}
                  placeholder="Paris"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </Field>
            <Field label="Pays" error={errors.country?.message} required>
              <input {...register('country')} placeholder="France" className={inputClass} />
            </Field>
          </div>

          <Field label="Capacité" error={errors.totalCapacity?.message} required>
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

        {/* Right column — cover image */}
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
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
        <a
          href="/dashboard/events"
          className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Annuler
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary gap-2 min-w-[120px]"
        >
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{isEdit ? 'Enregistrement...' : 'Création...'}</>
          ) : (
            isEdit ? 'Enregistrer' : "Créer l'événement"
          )}
        </button>
      </div>
    </motion.form>
    </>
  );
}
