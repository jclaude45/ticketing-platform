'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { eventsApi } from '@/lib/api';
import { useEventsStore } from '@/store/events.store';
import type { CreateEventData } from '@/types';

export function useEvents() {
  const { filters, currentPage, pageSize } = useEventsStore();

  // Normalise status to uppercase to match Prisma EventStatus enum (DRAFT, PUBLISHED, …).
  // Guards against stale lowercase values that would cause a Prisma 500.
  const normalisedFilters = {
    ...filters,
    status: filters.status ? filters.status.toUpperCase() : '',
  };

  return useQuery({
    queryKey: ['events', normalisedFilters, currentPage, pageSize],
    queryFn: async () => {
      const res = await eventsApi.list({ ...normalisedFilters, page: currentPage, limit: pageSize });
      // Backend wraps every response via TransformInterceptor:
      //   { success, statusCode, data: { data: events[], meta: {...} }, timestamp }
      // We flatten to PaginatedResponse<Event> so the page can access data.data, data.total, etc.
      const payload = (res.data as any).data as { data: import('@/types').Event[]; meta: { total: number; page: number; limit: number; totalPages: number } };
      return {
        data: payload.data,
        total: payload.meta.total,
        page: payload.meta.page,
        limit: payload.meta.limit,
        totalPages: payload.meta.totalPages,
      };
    },
    // Always refetch on mount regardless of staleness. Combined with refetchType:'all' in
    // mutations, this guarantees the new event is in cache before the list even mounts.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['events', id],
    queryFn: async () => {
      const res = await eventsApi.get(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEventData) => eventsApi.create(data),
    onSuccess: (res) => {
      // refetchType:'all' fetches the list immediately even though it's not mounted —
      // so fresh data is already in cache when the user navigates back to events.
      queryClient.invalidateQueries({ queryKey: ['events'], refetchType: 'all' });
      toast.success('Event created successfully!');
      router.push(`/dashboard/events/${res.data.data.id}`);
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Failed to create event');
    },
  });
}

export function useUpdateEvent(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<CreateEventData>) => eventsApi.update(id, data),
    onSuccess: (res) => {
      queryClient.setQueryData(['events', id], res.data.data);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event updated successfully!');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Failed to update event');
    },
  });
}

export function useDeleteEvent() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eventsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event deleted successfully!');
      router.push('/dashboard/events');
    },
    onError: () => toast.error('Failed to delete event'),
  });
}

export function usePublishEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eventsApi.publish(id),
    onSuccess: (res) => {
      const event = res.data.data;
      queryClient.setQueryData(['events', event.id], event);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event published!');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Failed to publish event');
    },
  });
}

export function useCancelEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eventsApi.cancel(id),
    onSuccess: (res) => {
      const event = res.data.data;
      queryClient.setQueryData(['events', event.id], event);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event cancelled');
    },
    onError: () => toast.error('Failed to cancel event'),
  });
}
