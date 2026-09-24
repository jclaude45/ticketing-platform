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

  // Invite mutation — sends invitation email, controller sets their own password
  const create = useMutation({
    mutationFn: async (data: ControllerFormData) => {
      return apiClient.post('/controllers/invite', {
        name:     `${data.firstName} ${data.lastName}`.trim(),
        email:    data.email,
        eventIds: data.eventIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controllers'] });
      toast.success('Invitation envoyée ! Le contrôleur recevra un email pour activer son compte.');
      router.push('/dashboard/controllers');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de l\'envoi de l\'invitation');
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
            <h1 className="text-xl font-bold text-gray-900">Inviter un contrôleur</h1>
            <p className="text-sm text-gray-500">
              Un email d'invitation sera envoyé — le contrôleur créera son propre mot de passe
            </p>
          </div>
        </div>
      </div>

      <ControllerForm
        onSubmit={(data) => create.mutate(data)}
        isLoading={create.isPending}
        submitLabel="Envoyer l'invitation"
      />
    </div>
  );
}
