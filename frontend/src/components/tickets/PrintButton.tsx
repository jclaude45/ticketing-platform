'use client';

import { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { printPDFBlob } from '@/lib/print';
import toast from 'react-hot-toast';
import { UpgradePlanModal } from '@/components/subscription/UpgradePlanModal';

function decodeApiError(err: any): string {
  if (err?.response?.status === 403) {
    return "L'export en lot n'est pas disponible dans votre abonnement actuel. Contactez votre administrateur pour souscrire à un plan supérieur.";
  }
  const data = err?.response?.data;
  if (data instanceof ArrayBuffer) {
    try {
      const json = JSON.parse(new TextDecoder().decode(data));
      return Array.isArray(json.message) ? json.message.join(' ') : (json.message ?? "Erreur lors de la préparation de l'impression");
    } catch {
      /* fall through */
    }
  }
  return data?.message ?? err?.message ?? "Erreur lors de la préparation de l'impression";
}

interface PrintButtonProps {
  /** Single ticket: eventId + ticketId */
  eventId: string;
  ticketId?: string;
  /** Bulk: list of ticket IDs (uses pdf-grouped/selection endpoint) */
  ticketIds?: string[];
  /** Button label */
  label?: string;
  /** Visual variant */
  variant?: 'default' | 'icon' | 'ghost';
  className?: string;
}

export function PrintButton({
  eventId,
  ticketId,
  ticketIds,
  label = 'Imprimer',
  variant = 'default',
  className,
}: PrintButtonProps) {
  const [loading, setLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const handlePrint = async () => {
    setLoading(true);
    const toastId = toast.loading('Préparation à l\'impression…');
    try {
      let buffer: ArrayBuffer;

      if (ticketId) {
        // Single ticket PDF
        const res = await apiClient.request<ArrayBuffer>({
          method: 'GET',
          url: `/events/${eventId}/tickets/${ticketId}/export/pdf`,
          responseType: 'arraybuffer',
        });
        buffer = res.data;
      } else {
        // Bulk PDF (selection or all tickets of event)
        const ids = ticketIds ?? [];
        const res = await apiClient.request<ArrayBuffer>({
          method: 'POST',
          url: `/events/${eventId}/tickets/export/pdf-grouped/selection`,
          data: { ticketIds: ids },
          responseType: 'arraybuffer',
        });
        buffer = res.data;
      }

      const blob = new Blob([buffer], { type: 'application/pdf' });
      toast.dismiss(toastId);
      toast.success('Impression lancée');
      printPDFBlob(blob);
    } catch (err: any) {
      toast.dismiss(toastId);
      if (err?.response?.status === 403) {
        setUpgradeOpen(true);
      } else {
        toast.error(decodeApiError(err), { duration: 5000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const buttonEl = variant === 'icon' ? (
    <button
      onClick={handlePrint}
      disabled={loading}
      title={label}
      className={cn(
        'rounded p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all disabled:opacity-40',
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
    </button>
  ) : variant === 'ghost' ? (
    <button
      onClick={handlePrint}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700',
        'hover:bg-gray-100 transition-colors disabled:opacity-50',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      {label}
    </button>
  ) : (
    <button
      onClick={handlePrint}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2',
        'text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      {label}
    </button>
  );

  return (
    <>
      {buttonEl}
      <UpgradePlanModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        featureName="L'export en lot des billets"
      />
    </>
  );
}
