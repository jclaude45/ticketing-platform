'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  FileText,
  Archive,
  Grid2x2,
  ChevronDown,
  Loader2,
  Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { UpgradePlanModal } from '@/components/subscription/UpgradePlanModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  action: () => Promise<void>;
}

interface ExportOptionsProps {
  eventId: string;
  /** IDs de billets sélectionnés (pour la ré-impression partielle) */
  selectedTicketIds?: string[];
  /** Nombre total de billets de l'événement */
  totalTickets?: number;
  className?: string;
}

type ExportStatus = 'idle' | 'loading';

// ─── Decode arraybuffer errors (axios returns buffer when responseType='arraybuffer') ───

function decodeApiError(err: any): string {
  if (err?.response?.status === 403) {
    return "L'export en lot n'est pas disponible dans votre abonnement actuel. Contactez votre administrateur pour souscrire à un plan supérieur.";
  }
  const data = err?.response?.data;
  if (data instanceof ArrayBuffer) {
    try {
      const json = JSON.parse(new TextDecoder().decode(data));
      return Array.isArray(json.message) ? json.message.join(' ') : (json.message ?? 'Erreur — réessayez');
    } catch {
      /* fall through */
    }
  }
  return data?.message ?? err?.message ?? 'Erreur — réessayez';
}

// ─── Helper : déclenche le téléchargement d'un blob ──────────────────────────

async function downloadBlob(
  url: string,
  fallbackFilename: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<void> {
  const response = await apiClient.request<ArrayBuffer>({
    method,
    url,
    data: body,
    responseType: 'arraybuffer',
    timeout: 600_000, // 10 min — large batched exports can take several minutes
  });

  // Use Content-Type from server (may be PDF or ZIP depending on ticket count)
  const contentType = (response.headers['content-type'] as string | undefined)
    ?? 'application/pdf';

  // Derive filename from Content-Disposition header when available
  const disposition = response.headers['content-disposition'] as string | undefined;
  let filename = fallbackFilename;
  if (disposition) {
    const match = /filename="?([^";\n]+)"?/i.exec(disposition);
    if (match?.[1]) filename = match[1];
  } else if (contentType.includes('zip') && !filename.endsWith('.zip')) {
    filename = filename.replace(/\.pdf$/, '.zip');
  }

  const blob = new Blob([response.data], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ExportOptions({
  eventId,
  selectedTicketIds = [],
  totalTickets = 0,
  className,
}: ExportOptionsProps) {
  const [open, setOpen] = useState(false);
  const [activeExport, setActiveExport] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const hasSelection = selectedTicketIds.length > 0;

  const runExport = async (option: ExportOption) => {
    if (activeExport) return;
    setActiveExport(option.id);
    const toastId = toast.loading(`Export en cours — ${option.label}…`);
    try {
      await option.action();
      toast.success('Téléchargement démarré !', { id: toastId });
    } catch (err: any) {
      console.error('[ExportOptions] export failed:', err?.response?.status, err?.message, err?.response?.data);
      if (err?.response?.status === 403) {
        toast.dismiss(toastId);
        setUpgradeOpen(true);
      } else {
        const msg = decodeApiError(err);
        toast.error(msg || 'Erreur export — voir console', { id: toastId, duration: 20000 });
      }
    } finally {
      setActiveExport(null);
    }
  };

  // ─── Export options definitions ──────────────────────────────────────────

  const options: ExportOption[] = [
    // ── 4 par page — tous les billets (option mise en avant) ──────────────
    {
      id: 'grouped-all',
      label: '4 billets par page',
      description: totalTickets > 200
        ? `${totalTickets} billets → ZIP de ${Math.ceil(totalTickets / 200)} lots de 200 (PDF par lot)`
        : `${totalTickets} billets en grille 2×2 sur A4 — idéal pour l'impression en masse`,
      badge: 'Recommandé',
      badgeColor: 'bg-indigo-100 text-indigo-700',
      icon: <Grid2x2 className="h-5 w-5" />,
      action: () =>
        downloadBlob(
          `/events/${eventId}/tickets/export/pdf-grouped`,
          `billets-4-par-page-${eventId}.pdf`,
        ),
    },

    // ── 4 par page — sélection ─────────────────────────────────────────────
    ...(hasSelection
      ? [
          {
            id: 'grouped-selection',
            label: `4 par page — sélection (${selectedTicketIds.length})`,
            description: 'Ré-imprimer uniquement les billets sélectionnés, 4 par page',
            badge: `${selectedTicketIds.length} billets`,
            badgeColor: 'bg-amber-100 text-amber-700',
            icon: <Grid2x2 className="h-5 w-5 text-amber-600" />,
            action: () =>
              downloadBlob(
                `/events/${eventId}/tickets/export/pdf-grouped/selection`,
                `selection-billets-${eventId}.pdf`,
                'POST',
                { ticketIds: selectedTicketIds },
              ),
          } as ExportOption,
        ]
      : []),

    // ── PDF individuel ─────────────────────────────────────────────────────
    {
      id: 'pdf-bulk',
      label: 'PDF groupé (1 billet / page)',
      description: 'Un billet par page A4, format standard avec tous les détails',
      icon: <FileText className="h-5 w-5" />,
      action: async () => {
        // Uses the bulk endpoint with all ticket IDs
        await downloadBlob(
          `/events/${eventId}/tickets/export/pdf-bulk`,
          `billets-${eventId}.pdf`,
        );
      },
    },

    // ── ZIP ────────────────────────────────────────────────────────────────
    {
      id: 'zip',
      label: 'Archive ZIP',
      description: 'Un fichier PDF par billet, compressés dans une archive .zip',
      icon: <Archive className="h-5 w-5" />,
      action: () =>
        downloadBlob(
          `/events/${eventId}/tickets/export/zip`,
          `billets-${eventId}.zip`,
        ),
    },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={cn('relative inline-block text-left', className)}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5',
          'text-sm font-medium text-gray-700 shadow-sm transition-all duration-150',
          'hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
          open && 'border-indigo-300 bg-indigo-50 text-indigo-700',
        )}
      >
        <Download className="h-4 w-4" />
        Exporter
        <ChevronDown
          className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Click-outside overlay */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className={cn(
                'absolute right-0 z-20 mt-2 w-96 origin-top-right',
                'rounded-xl border border-gray-200 bg-white shadow-xl',
                'ring-1 ring-black ring-opacity-5',
              )}
            >
              {/* Header */}
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4 text-gray-400" />
                  <p className="text-sm font-semibold text-gray-900">Options d'export</p>
                </div>
                {totalTickets > 0 && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {totalTickets} billet{totalTickets > 1 ? 's' : ''} disponible{totalTickets > 1 ? 's' : ''}
                    {hasSelection && ` · ${selectedTicketIds.length} sélectionné${selectedTicketIds.length > 1 ? 's' : ''}`}
                  </p>
                )}
              </div>

              {/* Options list */}
              <ul className="divide-y divide-gray-50 p-2">
                {options.map((option) => {
                  const isActive = activeExport === option.id;
                  const isDisabled = !!activeExport && !isActive;

                  return (
                    <li key={option.id}>
                      <button
                        onClick={() => {
                          setOpen(false);
                          runExport(option);
                        }}
                        disabled={!!activeExport}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left',
                          'transition-all duration-150',
                          isDisabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-gray-50 active:bg-gray-100',
                          isActive && 'bg-indigo-50',
                        )}
                      >
                        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                          {isActive
                            ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                            : option.icon}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{option.label}</span>
                            {option.badge && (
                              <span className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                option.badgeColor ?? 'bg-gray-100 text-gray-600',
                              )}>
                                {option.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                            {isActive ? 'Génération en cours…' : option.description}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Footer hint */}
              <div className="border-t border-gray-100 px-4 py-2.5">
                <p className="text-xs text-gray-400">
                  Les PDFs contiennent des QR codes cryptographiquement signés (RSA-4096).
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <UpgradePlanModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        featureName="L'export en lot des billets"
      />
    </div>
  );
}
