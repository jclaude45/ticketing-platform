'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ticketsApi } from '@/lib/api';
import type { TemplateMeta, TemplatePayload } from '@/lib/api';
import { downloadFile } from '@/lib/utils';
import type { GenerateTicketsData, FilterState } from '@/types';

export function useTickets(eventId: string, filters?: FilterState & { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['tickets', eventId, filters],
    queryFn: async () => {
      const res = await ticketsApi.list(eventId, filters);
      return res.data;
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['tickets', 'single', id],
    queryFn: async () => {
      const res = await ticketsApi.get(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useGenerateTickets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateTicketsData) => ticketsApi.generate(data),
    onSuccess: (res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', variables.eventId], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['events', variables.eventId], refetchType: 'all' });
      toast.success(`${res.data.data.count} tickets generated successfully!`);
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Failed to generate tickets');
    },
  });
}

export function useCancelTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket cancelled');
    },
    onError: () => toast.error('Failed to cancel ticket'),
  });
}

export function useExportTicketsPdf(eventId: string) {
  return useMutation({
    mutationFn: () => ticketsApi.exportPdf(eventId),
    onSuccess: (res) => {
      const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
      downloadFile(blob, `tickets-${eventId}.pdf`);
      toast.success('PDF exported!');
    },
    onError: () => toast.error('Failed to export PDF'),
  });
}

export function useExportTicketsCsv(eventId: string) {
  return useMutation({
    mutationFn: () => ticketsApi.exportCsv(eventId),
    onSuccess: (res) => {
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
      downloadFile(blob, `tickets-${eventId}.csv`);
      toast.success('CSV exported!');
    },
    onError: () => toast.error('Failed to export CSV'),
  });
}

export function useTicketTemplates(eventId: string) {
  return useQuery({
    queryKey: ['ticket-templates', eventId],
    queryFn: async () => {
      const res = await ticketsApi.getTemplates(eventId);
      return (res.data as any)?.data ?? [];
    },
    enabled: !!eventId,
  });
}

export function useTicketTemplate(eventId: string, templateId?: string) {
  return useQuery({
    queryKey: ['ticket-template', eventId, templateId],
    queryFn: async () => {
      const res = await ticketsApi.getTemplate(eventId, templateId as string);
      return (res.data as any)?.data ?? null;
    },
    enabled: !!eventId && !!templateId && templateId !== 'new',
  });
}

// Save a specific template. When `templateId` is provided we update it; otherwise a new
// template is created. The mutation result carries the (possibly new) template id so the
// caller can navigate to its edit URL.
export function useSaveTicketTemplate(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      meta,
      customFields,
    }: {
      templateId?: string;
      meta: TemplateMeta;
      customFields: TemplatePayload['customFields'];
    }) => {
      const payload: TemplatePayload = { meta, customFields };
      const res = templateId
        ? await ticketsApi.updateTemplate(eventId, templateId, payload)
        : await ticketsApi.createTemplate(eventId, payload);
      return (res.data as any)?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-templates', eventId] });
      queryClient.invalidateQueries({ queryKey: ['ticket-template', eventId] });
      toast.success('Template enregistré !');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Échec de l\'enregistrement'),
  });
}

export function useDeleteTemplate(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (templateId: string) => ticketsApi.deleteTemplate(eventId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-templates', eventId] });
      toast.success('Template supprimé');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Suppression impossible'),
  });
}
