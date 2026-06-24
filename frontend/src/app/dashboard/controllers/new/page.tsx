'use client';

import { useCreateController } from '@/hooks/useControllers';
import { ControllerForm, type ControllerFormData } from '@/components/controllers/ControllerForm';
import { Shield, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export default function NewControllerPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();

  // The create mutation — sends to /controllers then assigns events
  const create = useMutation({
    mutationFn: async (data: ControllerFormData) => {
      // 1) Create the controller account
      const res = await apiClient.post('/controllers', {
        firstName: data.firstName,
        lastName:  data.lastName,
        email:     data.email,
        phone:     data.phone,
        password:  data.password,
      });
      const controllerId = (res.data as any)?.data?.id ?? (res.data as any)?.id;

      // 2) Assign to selected events
      if (controllerId && data.eventIds?.length) {
        await Promise.all(
          data.eventIds.map((eventId) =>
            apiClient.post(`/controllers/${controllerId}/assign`, { eventId }),
          ),
        );
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controllers'] });
      toast.success('Contrôleur créé avec succès !');
      router.push('/dashboard/controllers');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la création');
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
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
            <h1 className="text-xl font-bold text-gray-900">Nouveau contrôleur</h1>
            <p className="text-sm text-gray-500">
              L'agent pourra se connecter à l'application mobile et scanner les billets
            </p>
          </div>
        </div>
      </div>

      <ControllerForm
        onSubmit={(data) => create.mutate(data)}
        isLoading={create.isPending}
        submitLabel="Créer le contrôleur"
      />
    </div>
  );
}
