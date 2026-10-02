'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Loader2, Mail, Save, Scan, Shield, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient, eventsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ControllerDetail {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  invitationPending?: boolean;
  controllerEvents: { eventId: string; event: { id: string; name: string; status: string; startDate: string } }[];
  _count?: { scanValidations: number };
}

interface EventOption {
  id: string;
  name: string;
  startDate?: string;
}

/** Edit a controller: name, access on/off, assigned events. The email is the login, it stays. */
export default function EditControllerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: controller, isLoading, isError } = useQuery({
    queryKey: ['controllers', id, 'detail'],
    queryFn: async () => {
      const res = await apiClient.get(`/controllers/${id}`);
      return ((res.data as any)?.data ?? res.data) as ControllerDetail;
    },
  });

  const { data: published = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', 'published'],
    queryFn: async () => {
      const res = await eventsApi.list({ status: 'PUBLISHED', limit: 100 });
      return ((res.data as any)?.data?.data ?? []) as EventOption[];
    },
  });

  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [eventIds, setEventIds] = useState<string[]>([]);

  useEffect(() => {
    if (!controller) return;
    setName(controller.name);
    setIsActive(controller.isActive);
    setEventIds(controller.controllerEvents.map((ce) => ce.eventId));
  }, [controller]);

  // Published events, plus the ones already assigned even if no longer published
  const events = useMemo(() => {
    const list = [...published];
    for (const ce of controller?.controllerEvents ?? []) {
      if (!list.some((e) => e.id === ce.event.id)) list.push(ce.event);
    }
    return list;
  }, [published, controller]);

  const toggleEvent = (eventId: string) =>
    setEventIds((ids) => (ids.includes(eventId) ? ids.filter((e) => e !== eventId) : [...ids, eventId]));

  const save = useMutation({
    mutationFn: async () => {
      if (!controller) return;
      const before = controller.controllerEvents.map((ce) => ce.eventId);
      await apiClient.patch(`/controllers/${id}`, { name: name.trim(), isActive });
      await Promise.all([
        ...eventIds.filter((e) => !before.includes(e)).map((eventId) => apiClient.post(`/controllers/${id}/events`, { eventId })),
        ...before.filter((e) => !eventIds.includes(e)).map((eventId) => apiClient.delete(`/controllers/${id}/events/${eventId}`)),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controllers'] });
      toast.success('Contrôleur mis à jour');
      router.push('/dashboard/controllers');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur lors de la mise à jour'),
  });

  const canSave = name.trim().length > 0 && eventIds.length > 0 && !save.isPending;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      <div>
        <button
          onClick={() => router.push('/dashboard/controllers')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux contrôleurs
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Modifier le contrôleur</h1>
            <p className="text-sm text-gray-500">Nom, accès à l&apos;application et événements assignés</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : isError || !controller ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Contrôleur introuvable ou accès refusé.
        </div>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) save.mutate();
          }}
        >
          {/* Identity */}
          <div className="border-b border-gray-200 bg-white py-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-500" />
              Identité
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
                  'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
                  name.trim() ? 'border-gray-200' : 'border-red-300 bg-red-50',
                )}
              />
              {!name.trim() && <p className="mt-1 text-xs text-red-500">Le nom est obligatoire</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (identifiant de connexion)</label>
              <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                <Mail className="h-4 w-4 text-gray-400" />
                {controller.email}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Scan className="h-3.5 w-3.5" />
              {(controller._count?.scanValidations ?? 0).toLocaleString('fr-FR')} scan(s) effectué(s)
            </div>
          </div>

          {/* Access */}
          <div className="border-b border-gray-200 bg-white py-6">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-gray-900">Accès à l&apos;application</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isActive
                    ? 'Le contrôleur peut se connecter et scanner.'
                    : 'Le contrôleur ne peut plus se connecter.'}
                  {controller.invitationPending && ' Invitation pas encore acceptée.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive((v) => !v)}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
                  isActive ? 'bg-emerald-500' : 'bg-gray-300',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                    isActive ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </label>
          </div>

          {/* Events */}
          <div className="border-b border-gray-200 bg-white py-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              Événements assignés
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Le contrôleur ne verra que les événements sélectionnés dans l&apos;application mobile
            </p>
            {eventIds.length === 0 && <p className="mb-3 text-xs text-red-500">Assignez au moins un événement</p>}
            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des événements…
              </div>
            ) : !events.length ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                Aucun événement publié disponible
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {events.map((ev) => {
                  const checked = eventIds.includes(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => toggleEvent(ev.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
                        checked ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      <div
                        className={cn(
                          'h-4 w-4 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                          checked ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300',
                        )}
                      >
                        {checked && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={cn('text-sm font-medium truncate', checked ? 'text-indigo-700' : 'text-gray-800')}>{ev.name}</p>
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
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/controllers')}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
