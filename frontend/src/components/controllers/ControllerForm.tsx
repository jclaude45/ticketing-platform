'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Loader2, User, Mail, Phone, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { eventsApi } from '@/lib/api';

const schema = z.object({
  firstName:  z.string().min(2, 'Minimum 2 caractères'),
  lastName:   z.string().min(2, 'Minimum 2 caractères'),
  email:      z.string().email('Email invalide'),
  phone:      z.string().optional(),
  password:   z.string().min(8, 'Minimum 8 caractères'),
  eventIds:   z.array(z.string()).min(1, 'Assignez au moins un événement'),
});

export type ControllerFormData = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<ControllerFormData>;
  onSubmit: (data: ControllerFormData) => void;
  isLoading?: boolean;
  submitLabel?: string;
  /** En mode édition, ne pas afficher le champ mot de passe */
  editMode?: boolean;
}

export function ControllerForm({
  defaultValues,
  onSubmit,
  isLoading = false,
  submitLabel = 'Créer le contrôleur',
  editMode = false,
}: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ControllerFormData>({
    resolver: zodResolver(
      editMode
        ? schema.omit({ password: true }).extend({ password: z.string().optional() })
        : schema,
    ) as any,
    defaultValues: { eventIds: [], ...defaultValues },
  });

  const selectedEvents = watch('eventIds') ?? [];

  // Fetch published events for assignment
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events', 'published'],
    queryFn: async () => {
      const res = await eventsApi.list({ status: 'PUBLISHED', limit: 100 });
      return (res.data as any)?.data ?? [];
    },
  });

  const toggleEvent = (id: string) => {
    const next = selectedEvents.includes(id)
      ? selectedEvents.filter((e) => e !== id)
      : [...selectedEvents, id];
    setValue('eventIds', next, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* Identity */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-indigo-500" />
          Identité du contrôleur
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { name: 'firstName' as const, label: 'Prénom', placeholder: 'Jean' },
            { name: 'lastName'  as const, label: 'Nom',    placeholder: 'Dupont' },
          ].map((f) => (
            <div key={f.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input
                {...register(f.name)}
                placeholder={f.placeholder}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
                  'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
                  errors[f.name] ? 'border-red-300 bg-red-50' : 'border-gray-200',
                )}
              />
              {errors[f.name] && (
                <p className="mt-1 text-xs text-red-500">{errors[f.name]?.message}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Mail className="h-4 w-4 text-indigo-500" />
          Coordonnées &amp; accès
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                {...register('email')}
                type="email"
                placeholder="agent@example.com"
                className={cn(
                  'w-full rounded-lg border pl-9 pr-3 py-2 text-sm transition-colors',
                  'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
                  errors.email ? 'border-red-300 bg-red-50' : 'border-gray-200',
                )}
              />
            </div>
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Téléphone <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                {...register('phone')}
                type="tel"
                placeholder="+33 6 00 00 00 00"
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {!editMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe <span className="text-red-500">*</span>
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="Minimum 8 caractères"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
                  'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
                  errors.password ? 'border-red-300 bg-red-50' : 'border-gray-200',
                )}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Le contrôleur utilisera ces identifiants sur l'application mobile
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Event assignment */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          Événements assignés
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Le contrôleur ne verra que les événements sélectionnés dans l'application mobile
        </p>

        {errors.eventIds && (
          <p className="mb-3 text-xs text-red-500">{errors.eventIds.message as string}</p>
        )}

        {eventsLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des événements…
          </div>
        ) : !eventsData?.length ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
            <Calendar className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Aucun événement publié disponible</p>
            <p className="text-xs text-gray-400 mt-1">
              Publiez d'abord un événement pour l'assigner à ce contrôleur
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {eventsData.map((ev: any) => {
              const checked = selectedEvents.includes(ev.id);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => toggleEvent(ev.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
                    checked
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  {/* Checkbox visual */}
                  <div className={cn(
                    'h-4 w-4 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                    checked ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300',
                  )}>
                    {checked && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={cn('text-sm font-medium truncate', checked ? 'text-indigo-700' : 'text-gray-800')}>
                      {ev.name}
                    </p>
                    {ev.startDate && (
                      <p className="text-xs text-gray-400 truncate">
                        {new Date(ev.startDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedEvents.length > 0 && (
          <p className="mt-3 text-xs text-indigo-600 font-medium">
            {selectedEvents.length} événement{selectedEvents.length > 1 ? 's' : ''} sélectionné{selectedEvents.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
