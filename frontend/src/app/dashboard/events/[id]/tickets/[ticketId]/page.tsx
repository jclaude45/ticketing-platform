'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft, Ticket, CheckCircle2, XCircle, Clock,
  AlertTriangle, User, Mail, Calendar, MapPin,
  Ban, Download, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { PrintButton } from '@/components/tickets/PrintButton';
import toast from 'react-hot-toast';

type TicketStatus = 'VALID' | 'USED' | 'CANCELLED' | 'PENDING' | 'FRAUDULENT';

const STATUS_CONFIG: Record<TicketStatus, { label: string; icon: React.ReactNode; chip: string }> = {
  VALID:      { label: 'Valide',      icon: <CheckCircle2 className="h-4 w-4" />, chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  USED:       { label: 'Utilisé',     icon: <Ticket className="h-4 w-4" />,       chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
  CANCELLED:  { label: 'Annulé',      icon: <XCircle className="h-4 w-4" />,      chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  PENDING:    { label: 'En attente',  icon: <Clock className="h-4 w-4" />,        chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  FRAUDULENT: { label: 'Frauduleux',  icon: <AlertTriangle className="h-4 w-4" />, chip: 'bg-rose-50 text-rose-800 ring-1 ring-rose-300' },
};

export default function TicketDetailPage() {
  const { id: eventId, ticketId } = useParams<{ id: string; ticketId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: ticket, isLoading, refetch } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const res = await apiClient.get(`/events/${eventId}/tickets/${ticketId}`);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const handleCancel = async () => {
    if (!confirm(`Annuler le billet ${ticket?.serialNumber} ? Cette action est irréversible.`)) return;
    setCancelling(true);
    try {
      await apiClient.post(`/events/${eventId}/tickets/${ticketId}/cancel`);
      toast.success('Billet annulé');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['tickets', eventId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Impossible d'annuler ce billet");
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await apiClient.request<ArrayBuffer>({
        method: 'GET',
        url: `/events/${eventId}/tickets/${ticketId}/export/pdf`,
        responseType: 'arraybuffer',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `ticket-${ticket?.serialNumber ?? ticketId}.pdf`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur lors du téléchargement');
    } finally {
      setDownloading(false);
    }
  };

  const statusCfg = ticket ? STATUS_CONFIG[ticket.status as TicketStatus] : null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux billets
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Détail du billet</h1>
            {ticket?.serialNumber && (
              <code className="mt-1 block font-mono text-sm font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md w-fit">
                {ticket.serialNumber}
              </code>
            )}
          </div>

          {!isLoading && statusCfg && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', statusCfg.chip)}>
              {statusCfg.icon}
              {statusCfg.label}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-100 bg-white p-6 h-32" />
          ))}
        </div>
      ) : !ticket ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <Ticket className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500">Billet introuvable</p>
        </div>
      ) : (
        <>
          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {downloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Télécharger PDF
            </button>

            <PrintButton eventId={eventId} ticketId={ticketId} />

            {ticket.status !== 'CANCELLED' && ticket.status !== 'USED' && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {cancelling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Annuler le billet
              </button>
            )}
          </div>

          {/* Event info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">Événement</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Nom</p>
                  <p className="text-sm font-medium text-gray-800">{ticket.event?.name ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Lieu</p>
                  <p className="text-sm font-medium text-gray-800">
                    {ticket.event?.venue ?? '—'}
                    {ticket.event?.city && `, ${ticket.event.city}`}
                  </p>
                </div>
              </div>
              {ticket.event?.startDate && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Date</p>
                    <p className="text-sm font-medium text-gray-800">
                      {format(new Date(ticket.event.startDate), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Ticket className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Tarif</p>
                  <div className="flex items-center gap-2">
                    {ticket.template?.color && (
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ticket.template.color }} />
                    )}
                    <p className="text-sm font-medium text-gray-800">{ticket.template?.name ?? '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Holder info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">Titulaire</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Nom</p>
                  <p className="text-sm font-medium text-gray-800">{ticket.holderName ?? <span className="text-gray-400 italic">Non renseigné</span>}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-sm font-medium text-gray-800">{ticket.holderEmail ?? <span className="text-gray-400 italic">Non renseigné</span>}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-400 text-xs font-bold flex items-center justify-center">€</div>
                <div>
                  <p className="text-xs text-gray-400">Prix</p>
                  <p className="text-sm font-medium text-gray-800">
                    {Number(ticket.price ?? 0).toFixed(2)} {ticket.currency}
                  </p>
                </div>
              </div>
              {ticket.purchasedAt && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Acheté le</p>
                    <p className="text-sm font-medium text-gray-800">
                      {format(new Date(ticket.purchasedAt), 'dd MMM yyyy', { locale: fr })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* QR Code */}
          {ticket.qrCode && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">QR Code</h2>
              <div className="flex items-center gap-6">
                <img
                  src={ticket.qrCode}
                  alt="QR Code"
                  className="h-32 w-32 rounded-lg border border-gray-100 shadow-sm"
                />
                <div className="text-sm text-gray-500">
                  <p>Scanner ce code à l'entrée de l'événement pour valider le billet.</p>
                  {ticket.status === 'USED' && ticket.checkedInAt && (
                    <p className="mt-2 text-emerald-600 font-medium">
                      Scanné le {format(new Date(ticket.checkedInAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
                    </p>
                  )}
                  {ticket.status === 'CANCELLED' && (
                    <p className="mt-2 text-red-600 font-medium">Ce billet a été annulé et n'est plus valide.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Scan history */}
          {ticket.scanValidations?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">
                Historique des scans ({ticket.scanValidations.length})
              </h2>
              <ul className="divide-y divide-gray-50">
                {ticket.scanValidations.map((scan: any) => (
                  <li key={scan.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {scan.controller?.name ?? 'Contrôleur inconnu'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {format(new Date(scan.scannedAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
                      </p>
                    </div>
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      scan.result === 'VALID'
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-red-50 text-red-700 ring-1 ring-red-200',
                    )}>
                      {scan.result === 'VALID' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {scan.result}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
