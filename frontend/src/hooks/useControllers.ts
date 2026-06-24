'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { controllersApi } from '@/lib/api';
import type { CreateControllerData, FilterState } from '@/types';

export function useControllers(filters?: FilterState & { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['controllers', filters],
    queryFn: async () => {
      const res = await controllersApi.list(filters);
      // TransformInterceptor wraps as { data: { data: [], meta: {} } }
      return (res.data as any)?.data ?? res.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useController(id: string) {
  return useQuery({
    queryKey: ['controllers', id],
    queryFn: async () => {
      const res = await controllersApi.get(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateController() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateControllerData) => controllersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controllers'] });
      toast.success('Controller created successfully!');
      router.push('/dashboard/controllers');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Failed to create controller');
    },
  });
}

export function useDeleteController() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => controllersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controllers'] });
      toast.success('Controller removed');
    },
    onError: () => toast.error('Failed to remove controller'),
  });
}

export function useAssignControllerEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ controllerId, eventId }: { controllerId: string; eventId: string }) =>
      controllersApi.assignEvent(controllerId, eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controllers'] });
      toast.success('Controller assigned to event');
    },
    onError: () => toast.error('Failed to assign controller'),
  });
}
