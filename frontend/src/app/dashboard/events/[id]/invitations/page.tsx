'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Mail, Plus, Trash2, Upload, Download, Loader2, Send, FileSpreadsheet,
  CheckCircle2, AlertTriangle, RotateCw, UserPlus, Clock, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient, eventsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type EmailStatus = 'PENDING' | 'SENT' | 'FAILED';

interface Invitation {
  id: string;
  serialNumber: string;
  holderName: string | null;
  holderEmail: string | null;
  status: 'PENDING' | 'VALID' | 'USED' | 'CANCELLED' | 'FRAUDULENT';
  checkedInAt: string | null;
  createdAt: string;
  template: { id: string; name: string };
  emailStatus: EmailStatus;
  emailSentAt: string | null;
}

interface GuestIssue { row?: number; name: string; email: string; reason: string }

interface SendResult {
  created: number;
  skipped: GuestIssue[];
  errors: GuestIssue[];
}

interface GuestRow { name: string; email: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const unwrap = (res: any) => res?.data?.data ?? res?.data;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvitationsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'manual' | 'import'>('manual');
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<GuestRow[]>([{ name: '', email: '' }]);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => unwrap(await eventsApi.get(eventId)),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['ticket-templates', eventId],
    queryFn: async () => unwrap(await apiClient.get(`/events/${eventId}/templates`)) ?? [],
  });

  const { data: invitations = [], isLoading: listLoading } = useQuery<Invitation[]>({
    queryKey: ['invitations', eventId],
    queryFn: async () => unwrap(await apiClient.get(`/events/${eventId}/invitations`)) ?? [],
    // Emails go out in the background — poll while some are still pending
    refetchInterval: (query) =>
      (query.state.data ?? []).some((i) => i.emailStatus === 'PENDING') ? 4000 : false,
  });

  const selectedTemplate = templates.find((t: any) => t.id === templateId);
  const validRows = rows.filter((r) => r.name.trim() && EMAIL_RE.test(r.email.trim()));
  const invalidRows = rows.filter((r) => (r.name.trim() || r.email.trim()) && !(r.name.trim() && EMAIL_RE.test(r.email.trim())));

  const onSent = (data: SendResult) => {
    setResult(data);
    if (data.created > 0) {
      toast.success(`${data.created} invitation(s) en cours d'envoi`);
      setRows([{ name: '', email: '' }]);
      setFile(null);
    } else {
      toast.error('Aucune invitation envoyée');
    }
    queryClient.invalidateQueries({ queryKey: ['invitations', eventId] });
    queryClient.invalidateQueries({ queryKey: ['ticket-templates', eventId] });
    queryClient.invalidateQueries({ queryKey: ['tickets', eventId], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['event', eventId], refetchType: 'all' });
  };

  const onError = (err: any) => {
    const msg = err?.response?.data?.message;
    toast.error(Array.isArray(msg) ? msg[0] : msg ?? err?.message ?? "Erreur lors de l'envoi");
  };

  const sendManual = useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.post(`/events/${eventId}/invitations`, {
        templateId,
        message: message.trim() || undefined,
        guests: validRows.map((r) => ({ name: r.name.trim(), email: r.email.trim() })),
      })) as SendResult,
    onSuccess: onSent,
    onError,
  });

  const sendImport = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('file', file!);
      form.append('templateId', templateId);
      if (message.trim()) form.append('message', message.trim());
      return unwrap(await apiClient.post(`/events/${eventId}/invitations/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })) as SendResult;
    },
    onSuccess: onSent,
    onError,
  });

  const resend = useMutation({
    mutationFn: async (ticketId: string) =>
      apiClient.post(`/events/${eventId}/invitations/${ticketId}/resend`),
    onSuccess: () => {
      toast.success('Invitation renvoyée');
      queryClient.invalidateQueries({ queryKey: ['invitations', eventId] });
    },
    onError,
  });

  const downloadTemplate = async () => {
    try {
      const res = await apiClient.get(`/events/${eventId}/invitations/import/template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'modele-invites.xlsx' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Impossible de télécharger le modèle');
    }
  };

  const pickFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|csv)$/i)) {
      toast.error('Seuls les fichiers .xlsx et .csv sont acceptés');
      return;
    }
    setFile(f);
    setResult(null);
  };

  const updateRow = (i: number, patch: Partial<GuestRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const sending = sendManual.isPending || sendImport.isPending;
  const guestCount = mode === 'manual' ? validRows.length : null;
  const notEnoughSeats = selectedTemplate && guestCount !== null && guestCount > selectedTemplate.availableCount;
  const canSend = !!templateId && !sending && !notEnoughSeats && (
    mode === 'manual' ? validRows.length > 0 && invalidRows.length === 0 : !!file
  );
  const isCancelled = event?.status === 'CANCELLED';

  const sentCount = invitations.filter((i) => i.status !== 'CANCELLED').length;
  const usedCount = invitations.filter((i) => i.status === 'USED').length;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;événement
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
            <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Invitations</h1>
            {event?.name && <p className="text-sm text-gray-500">{event.name}</p>}
          </div>
        </div>
      </div>

      {isCancelled ? (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
          <p className="font-semibold text-gray-900 dark:text-white">Événement annulé</p>
          <p className="text-sm text-gray-500 mt-1">Il n&apos;est pas possible d&apos;envoyer des invitations.</p>
        </div>
      ) : (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-5 flex flex-col gap-5">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Chaque invité reçoit par email un billet gratuit avec QR code, à présenter à l&apos;entrée.
          </p>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Catégorie de billet *</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Choisir une catégorie…</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id} disabled={t.availableCount <= 0}>
                  {t.name} — {t.availableCount} place(s) disponible(s)
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600">
                Aucune catégorie : créez d&apos;abord un type de billet pour cet événement.
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-500">Une invitation utilise une place de cette catégorie.</p>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Message personnel <span className="font-normal text-gray-400">(optionnel)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Nous serions ravis de vous compter parmi nous…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1 w-fit">
            {([
              { key: 'manual', label: 'Ajouter des invités', icon: UserPlus },
              { key: 'import', label: 'Importer un fichier Excel', icon: FileSpreadsheet },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setMode(tab.key); setResult(null); }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === tab.key
                    ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'manual' ? (
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => {
                const emailBad = row.email.trim() !== '' && !EMAIL_RE.test(row.email.trim());
                return (
                  <div key={i} className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      placeholder="Nom complet"
                      className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="flex flex-1 gap-2">
                      <input
                        value={row.email}
                        onChange={(e) => updateRow(i, { email: e.target.value })}
                        placeholder="email@exemple.com"
                        type="email"
                        className={cn(
                          'flex-1 rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none',
                          emailBad ? 'border-red-400 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-indigo-500',
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setRows((prev) => (prev.length === 1 ? [{ name: '', email: '' }] : prev.filter((_, idx) => idx !== i)))}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
                        aria-label="Retirer cet invité"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, { name: '', email: '' }])}
                className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Ajouter un invité
              </button>
              {invalidRows.length > 0 && (
                <p className="text-xs text-red-600">Chaque invité doit avoir un nom et un email valide.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                  dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400',
                )}
              >
                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Glissez votre fichier ici ou cliquez pour choisir</p>
                    <p className="text-xs text-gray-500 mt-1">.xlsx ou .csv — colonnes « Nom » et « Email » (500 invités max)</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
                />
              </div>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-indigo-600 hover:underline"
              >
                <Download className="h-4 w-4" />
                Télécharger le modèle Excel
              </button>
            </div>
          )}

          {notEnoughSeats && (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Seulement {selectedTemplate.availableCount} place(s) disponible(s) dans cette catégorie.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canSend}
              onClick={() => (mode === 'manual' ? sendManual.mutate() : sendImport.mutate())}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {mode === 'manual'
                ? `Envoyer ${validRows.length > 0 ? validRows.length : ''} invitation${validRows.length > 1 ? 's' : ''}`
                : 'Importer et envoyer'}
            </button>
          </div>

          {result && <ResultPanel result={result} />}
        </div>
      )}

      {/* Sent invitations */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-5 py-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Invitations envoyées</h2>
          <span className="text-xs text-gray-500">{sentCount} invité(s) · {usedCount} présent(s)</span>
        </div>
        {listLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : invitations.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">Aucune invitation envoyée pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-2 font-medium">Invité</th>
                  <th className="px-5 py-2 font-medium">Catégorie</th>
                  <th className="px-5 py-2 font-medium">Email</th>
                  <th className="px-5 py-2 font-medium">Billet</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{inv.holderName}</p>
                      <p className="text-xs text-gray-500">{inv.holderEmail}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{inv.template?.name}</td>
                    <td className="px-5 py-3"><EmailBadge status={inv.emailStatus} /></td>
                    <td className="px-5 py-3"><TicketBadge status={inv.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {inv.status !== 'CANCELLED' && inv.emailStatus !== 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => resend.mutate(inv.id)}
                          disabled={resend.isPending && resend.variables === inv.id}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50"
                        >
                          {resend.isPending && resend.variables === inv.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCw className="h-3.5 w-3.5" />}
                          Renvoyer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: SendResult }) {
  const issues = [
    ...result.errors.map((e) => ({ ...e, kind: 'error' as const })),
    ...result.skipped.map((e) => ({ ...e, kind: 'skipped' as const })),
  ];
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        {result.created} invitation(s) créée(s)
        {result.skipped.length > 0 && <span className="text-gray-500 font-normal">· {result.skipped.length} ignorée(s)</span>}
        {result.errors.length > 0 && <span className="text-red-600 font-normal">· {result.errors.length} erreur(s)</span>}
      </p>
      {issues.length > 0 && (
        <ul className="mt-3 max-h-48 overflow-y-auto space-y-1">
          {issues.map((e, i) => (
            <li key={i} className={cn('text-xs', e.kind === 'error' ? 'text-red-600' : 'text-gray-600 dark:text-gray-400')}>
              {e.row ? `Ligne ${e.row} — ` : ''}{e.name !== '-' ? e.name : ''}{e.email ? ` (${e.email})` : ''} : {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmailBadge({ status }: { status: EmailStatus }) {
  const map = {
    PENDING: { label: 'En cours', icon: Clock, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
    SENT: { label: 'Envoyé', icon: CheckCircle2, cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
    FAILED: { label: 'Échec', icon: AlertTriangle, cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  }[status] ?? { label: status, icon: Clock, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', map.cls)}>
      <map.icon className="h-3 w-3" />
      {map.label}
    </span>
  );
}

function TicketBadge({ status }: { status: Invitation['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    VALID: { label: 'Valide', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400' },
    PENDING: { label: 'En attente', cls: 'bg-gray-100 text-gray-600' },
    USED: { label: 'Présent(e)', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
    CANCELLED: { label: 'Annulé', cls: 'bg-gray-100 text-gray-500 line-through' },
    FRAUDULENT: { label: 'Frauduleux', cls: 'bg-red-50 text-red-700' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', m.cls)}>{m.label}</span>;
}
