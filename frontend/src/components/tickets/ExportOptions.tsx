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
  CheckCircle2,
  AlertCircle,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';

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

type ExportStatus = 'idle' | 'loading' | 'success' | 'error';

// ─── Helper : déclenche le téléchargement d'un blob ──────────────────────────

async function downloadBlob(
  url: string,
  filename: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<void> {
  const response = await apiClient.request<ArrayBuffer>({
    method,
    url,
    data: body,
    responseType: 'arraybuffer',
  });

  const blob = new Blob([response.data], {
    type: method === 'GET' && filename.endsWith('.zip')
      ? 'application/zip'
      : 'application/pdf',
  });

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
  const [statusMap, setStatusMap] = useState<Record<string, ExportStatus>>({});

  const hasSelection = selectedTicketIds.length > 0;

  const setStatus = (id: string, status: ExportStatus) => {
    setStatusMap((prev) => ({ ...prev, [id]: status }));
    if (status !== 'loading') {
      setTimeout(() => setStatusMap((prev) => ({ ...prev, [id]: 'idle' })), 3000);
    }
  };

  const runExport = async (option: ExportOption) => {
    if (activeExport) return;
    setActiveExport(option.id);
    setStatus(option.id, 'loading');
    try {
      await option.action();
      setStatus(option.id, 'success');
    } catch {
      setStatus(option.id, 'error');
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
      description: `Tous les billets (${totalTickets}) en grille 2×2 sur A4 — idéal pour l'impression en masse`,
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
                  const status = statusMap[option.id] ?? 'idle';
                  const isLoading = status === 'loading';
                  const isSuccess = status === 'success';
                  const isError = status === 'error';
                  const isDisabled = !!activeExport && activeExport !== option.id;

                  return (
                    <li key={option.id}>
                      <button
                        onClick={() => {
                          runExport(option);
                          setOpen(false);
                        }}
                        disabled={isLoading || isDisabled}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left',
                          'transition-all duration-150',
                          isDisabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-gray-50 active:bg-gray-100',
                          isLoading && 'bg-indigo-50',
                        )}
                      >
                        {/* Icon */}
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                            isSuccess
                              ? 'bg-green-100 text-green-600'
                              : isError
                              ? 'bg-red-100 text-red-600'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                          ) : isSuccess ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isError ? (
                            <AlertCircle className="h-4 w-4" />
                          ) : (
                            option.icon
                          )}
                        </span>

                        {/* Text */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {option.label}
                            </span>
                            {option.badge && (
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                  option.badgeColor ?? 'bg-gray-100 text-gray-600',
                                )}
                              >
                                {option.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                            {isLoading
                              ? 'Génération en cours…'
                              : isSuccess
                              ? 'Téléchargement démarré ✓'
                              : isError
                              ? 'Erreur — réessayez'
                              : option.description}
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
    </div>
  );
}
