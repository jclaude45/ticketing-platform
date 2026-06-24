'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  User, MoreVertical, Shield, ShieldOff, Trash2,
  Calendar, CheckCircle2, XCircle, Clock, Edit,
  Scan, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeleteController } from '@/hooks/useControllers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';
import type { Controller } from '@/types';

interface Props {
  controllers: Controller[];
  isLoading?: boolean;
}

export function ControllerList({ controllers, isLoading = false }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteController = useDeleteController();

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/controllers/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controllers'] });
      toast.success('Statut mis à jour');
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-gray-200" />
              <div className="space-y-2 flex-1">
                <div className="h-4 rounded bg-gray-200 w-2/3" />
                <div className="h-3 rounded bg-gray-100 w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 rounded bg-gray-100 w-full" />
              <div className="h-3 rounded bg-gray-100 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!controllers.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <Shield className="h-8 w-8 text-gray-400" />
        </div>
        <p className="text-base font-semibold text-gray-700">Aucun contrôleur</p>
        <p className="mt-1 text-sm text-gray-400">
          Créez votre premier agent de contrôle pour commencer à scanner des billets
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <AnimatePresence>
        {controllers.map((ctrl, idx) => {
          const fullName = `${ctrl.user?.firstName ?? ''} ${ctrl.user?.lastName ?? ''}`.trim() || `Contrôleur ${idx + 1}`;
          const initials = fullName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
          const isMenuOpen = openMenuId === ctrl.id;

          return (
            <motion.div
              key={ctrl.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.04 }}
              className={cn(
                'relative rounded-xl border bg-white p-5 shadow-sm transition-all',
                ctrl.isActive ? 'border-gray-200 hover:border-indigo-200 hover:shadow-md' : 'border-gray-200 opacity-70',
              )}
            >
              {/* Status indicator */}
              <span className={cn(
                'absolute right-4 top-4 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                ctrl.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
              )}>
                {ctrl.isActive
                  ? <><CheckCircle2 className="h-3 w-3" /> Actif</>
                  : <><XCircle className="h-3 w-3" /> Inactif</>
                }
              </span>

              {/* Avatar + name */}
              <div className="flex items-center gap-3 mb-4 pr-16">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
                  <p className="text-xs text-gray-400 truncate">{ctrl.user?.email ?? '—'}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Événements</p>
                  <p className="text-base font-bold text-gray-800 mt-0.5">
                    {(ctrl as any).eventsCount ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Scan className="h-3 w-3" /> Scans
                  </p>
                  <p className="text-base font-bold text-gray-800 mt-0.5">
                    {(ctrl as any).totalScans?.toLocaleString('fr-FR') ?? '—'}
                  </p>
                </div>
              </div>

              {/* Last seen */}
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
                <Clock className="h-3.5 w-3.5" />
                {ctrl.lastSeen
                  ? <>Vu {format(new Date(ctrl.lastSeen), "'le' dd MMM 'à' HH:mm", { locale: fr })}</>
                  : 'Jamais connecté'}
              </div>

              {/* Assigned events chips */}
              {(ctrl as any).events?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {(ctrl as any).events.slice(0, 2).map((ev: any) => (
                    <span key={ev.id} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600 font-medium truncate max-w-[120px]">
                      {ev.name}
                    </span>
                  ))}
                  {(ctrl as any).events.length > 2 && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      +{(ctrl as any).events.length - 2}
                    </span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => router.push(`/dashboard/controllers/${ctrl.id}/edit`)}
                  className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
                >
                  <Edit className="h-3.5 w-3.5" /> Modifier
                </button>

                <button
                  onClick={() => toggleActive.mutate({ id: ctrl.id, isActive: !ctrl.isActive })}
                  className={cn(
                    'flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1',
                    ctrl.isActive
                      ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
                  )}
                >
                  {ctrl.isActive
                    ? <><ShieldOff className="h-3.5 w-3.5" /> Désactiver</>
                    : <><Shield className="h-3.5 w-3.5" /> Activer</>
                  }
                </button>

                {/* Delete dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setOpenMenuId(isMenuOpen ? null : ctrl.id)}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  <AnimatePresence>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          transition={{ duration: 0.1 }}
                          className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-gray-200 bg-white shadow-lg py-1"
                        >
                          <button
                            onClick={() => {
                              setConfirmDeleteId(ctrl.id);
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Delete confirm overlay */}
              <AnimatePresence>
                {confirmDeleteId === ctrl.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/95 backdrop-blur-sm p-6 text-center"
                  >
                    <Trash2 className="h-8 w-8 text-red-500" />
                    <p className="text-sm font-semibold text-gray-900">Supprimer {fullName} ?</p>
                    <p className="text-xs text-gray-500">Cette action est irréversible</p>
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 rounded-lg border border-gray-200 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => {
                          deleteController.mutate(ctrl.id);
                          setConfirmDeleteId(null);
                        }}
                        className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        Supprimer
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
