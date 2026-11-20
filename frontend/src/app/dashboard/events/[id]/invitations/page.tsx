'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrintPayment, isPrintPaymentError } from '@/components/billing/usePrintPayment';
import {
  ArrowLeft, Mail, Plus, Trash2, Upload, Download, Loader2, Send, FileSpreadsheet,
  CheckCircle2, AlertTriangle, RotateCw, UserPlus, Clock, XCircle, QrCode, Users, Search, Settings2, ClipboardList, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient, communicationApi, eventsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GuestFormEditor, type GuestForm } from '@/components/invitations/GuestFormEditor';
import { ImportPreview, invitableLines, type PreviewGuest } from '@/components/invitations/ImportPreview';
import type { Contact } from '@/components/communication/MailingLists';

// ── Types ─────────────────────────────────────────────────────────────────────

/** NONE: paper invitation (printed QR code, no e-mail) */
type EmailStatus = 'PENDING' | 'SENT' | 'FAILED' | 'NONE' | 'HELD';

interface Invitation {
  id: string;
  serialNumber: string;
  holderName: string | null;
  holderEmail: string | null;
  holderPhone: string | null;
  status: 'PENDING' | 'VALID' | 'USED' | 'CANCELLED' | 'FRAUDULENT' | 'INVITED';
  checkedInAt: string | null;
  createdAt: string;
  template: { id: string; name: string };
  emailStatus: EmailStatus;
  emailSentAt: string | null;
  delivery: 'EMAIL' | 'PAPER';
  /** The guest's answer on their confirmation page */
  response: { status: 'CONFIRMED' | 'DECLINED'; respondedAt: string; updatedAt: string; answers: { fieldId: string; label: string; value: string }[] } | null;
}

interface GuestIssue { row?: number; name: string; email: string; reason: string }

interface SendResult {
  created: number;
  /** Past the day's 200 new addresses: they go out automatically on the following days */
  held?: number;
  skipped: GuestIssue[];
  errors: GuestIssue[];
}

interface GuestRow { name: string; email: string }

type Tab = 'guests' | 'invite' | 'settings';
type GuestFilter = 'all' | 'confirmed' | 'waiting' | 'declined' | 'present' | 'issues';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Invite on the event's capacity left by the tariffs rather than on a tariff */
const CAPACITY = 'CAPACITY';
const unwrap = (res: any) => res?.data?.data ?? res?.data;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvitationsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Opens on the guest list once there are invitations, on "Inviter" before
  const [tab, setTab] = useState<Tab | null>(null);
  const [guestFilter, setGuestFilter] = useState<GuestFilter>('all');
  const [guestQuery, setGuestQuery] = useState('');
  const [mode, setMode] = useState<'manual' | 'import' | 'contacts'>('manual');
  // Lines ticked in the imported file or the contacts
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // Contacts mode: the people of one of the organizer's events, or of all of them
  const [contactEvent, setContactEvent] = useState('');
  // PAPER: printed with a QR code, the address is optional and nothing is e-mailed
  const [delivery, setDelivery] = useState<'EMAIL' | 'PAPER'>('EMAIL');
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<GuestRow[]>([{ name: '', email: '' }]);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  // Imported file: its lines are shown first, the organizer then invites all, some or one
  const [preview, setPreview] = useState<PreviewGuest[] | null>(null);
  const [invitedLines, setInvitedLines] = useState<Set<number>>(new Set());
  // Read by a retry after paying: only the lines not invited yet go again
  const invitedRef = useRef(invitedLines);
  invitedRef.current = invitedLines;
  const shownRef = useRef<PreviewGuest[] | null>(null);
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

  // Everyone who left an e-mail on the organizer's events: buyers, sign-ups, guests, shop
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['comm-contacts'],
    queryFn: async () => unwrap(await communicationApi.getContacts()) ?? [],
    enabled: mode === 'contacts',
  });
  const contactEvents = useMemo(() => {
    const byId = new Map<string, string>();
    contacts.forEach((c) => c.events.forEach((e) => byId.set(e.id, e.name)));
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [contacts]);
  const contactGuests = useMemo<PreviewGuest[]>(() => {
    const invited = new Set(invitations.filter((i) => i.status !== 'CANCELLED').map((i) => i.holderEmail?.toLowerCase()));
    return contacts
      .filter((c) => !contactEvent || c.events.some((e) => e.id === contactEvent))
      .map((c) => ({
        name: [c.firstName, c.lastName].filter(Boolean).join(' '),
        email: c.email,
        phone: c.phone ?? '',
        issue: invited.has(c.email) ? 'Déjà invité(e)'
          : c.bounced ? 'Adresse en erreur'
          : c.unsubscribed && delivery === 'EMAIL' ? 'S’est désinscrit(e)'
          : null,
      }));
  }, [contacts, contactEvent, invitations, delivery]);

  const { data: guestForm } = useQuery<GuestForm>({
    queryKey: ['guest-form', eventId],
    queryFn: async () => unwrap(await apiClient.get(`/events/${eventId}/invitations/form`)),
  });

  const download = async (path: string, filename: string, failure: string) => {
    try {
      const res = await apiClient.get(`/events/${eventId}/invitations/${path}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(failure);
    }
  };
  const exportResponses = () => download('responses/export', 'reponses-invites.xlsx', "Impossible d'exporter les réponses");

  // Seats of the capacity left by the tariffs: invitations can draw on them instead of a tariff
  const { data: capacity } = useQuery<{ available: number; templateId: string | null }>({
    queryKey: ['invitation-capacity', eventId],
    queryFn: async () => unwrap(await apiClient.get(`/events/${eventId}/invitations/capacity`)),
  });
  const tariffs = templates.filter((t: any) => !t.capacityPool);
  const selectedTemplate = templateId === CAPACITY
    ? { availableCount: capacity?.available ?? 0 }
    : templates.find((t: any) => t.id === templateId);
  const paper = delivery === 'PAPER';
  const rowOk = (r: GuestRow) => !!r.name.trim() && (EMAIL_RE.test(r.email.trim()) || (paper && !r.email.trim()));
  const validRows = rows.filter(rowOk);
  const invalidRows = rows.filter((r) => (r.name.trim() || r.email.trim()) && !rowOk(r));

  const onSent = (data: SendResult) => {
    setResult(data);
    if (data.created > 0) {
      toast.success(paper
        ? `${data.created} invitation(s) papier créée(s) : téléchargez leurs QR pour les imprimer`
        : `${data.created} invitation(s) en cours d'envoi`);
      if (!paper && data.held) toast(heldNotice(data.held), { duration: 10000 });
      setRows([{ name: '', email: '' }]);
      setFile(null);
    } else {
      toast.error('Aucune invitation envoyée');
    }
    queryClient.invalidateQueries({ queryKey: ['invitations', eventId] });
    queryClient.invalidateQueries({ queryKey: ['ticket-templates', eventId] });
    queryClient.invalidateQueries({ queryKey: ['invitation-capacity', eventId] });
    queryClient.invalidateQueries({ queryKey: ['tickets', eventId], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['event', eventId], refetchType: 'all' });
  };

  const { ask: askPayment, dialog: paymentDialog } = usePrintPayment();
  // Invitations count against the print quota: beyond it, pay then send again
  const onError = (err: any, retry?: () => void) => {
    const q = isPrintPaymentError(err);
    if (q && retry) {
      askPayment(q, retry);
      return;
    }
    const msg = err?.response?.data?.message;
    toast.error(Array.isArray(msg) ? msg[0] : msg ?? err?.message ?? "Erreur lors de l'envoi");
  };

  const sendManual = useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.post(`/events/${eventId}/invitations`, {
        templateId,
        message: message.trim() || undefined,
        delivery,
        guests: validRows.map((r) => ({ name: r.name.trim(), ...(r.email.trim() && { email: r.email.trim() }) })),
      })) as SendResult,
    onSuccess: onSent,
    onError: (err: any) => onError(err, () => sendManual.mutate()),
  });

  const loadPreview = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append('file', f);
      form.append('delivery', delivery);
      return (unwrap(await apiClient.post(`/events/${eventId}/invitations/import/preview`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })) as { guests: PreviewGuest[] }).guests;
    },
    onSuccess: (guests) => { setPreview(guests); setInvitedLines(new Set()); setPicked(new Set()); },
    onError: (err: any) => { setPreview(null); onError(err); },
  });

  // Paper or e-mail changes what a line needs (an address or not): read the file again
  useEffect(() => {
    if (file && mode === 'import') loadPreview.mutate(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery]);

  // The ticked lines, 2000 per request (the server's batch limit): one request, so one
  // print-quota payment, for a whole file's selection
  const sendImport = useMutation({
    mutationFn: async (picked: number[]) => {
      const shown = shownRef.current!;
      const indexes = picked.filter((i) => !invitedRef.current.has(i));
      const total: SendResult = { created: 0, skipped: [], errors: [] };
      for (let k = 0; k < indexes.length; k += 2000) {
        const chunk = indexes.slice(k, k + 2000);
        const res = unwrap(await apiClient.post(`/events/${eventId}/invitations`, {
          templateId,
          message: message.trim() || undefined,
          delivery,
          guests: chunk.map((i) => {
            const g = shown[i];
            return { name: g.name, ...(g.email && { email: g.email }), ...(g.phone && { phone: g.phone.slice(0, 30) }) };
          }),
        })) as SendResult;
        total.created += res.created;
        total.held = (total.held ?? 0) + (res.held ?? 0);
        total.skipped.push(...res.skipped);
        total.errors.push(...res.errors);
        // Lines the server took: everything sent but what it reported back
        const refused = new Set([...res.skipped, ...res.errors].map((e) => e.email));
        setInvitedLines((s) => { const n = new Set(s); chunk.forEach((i) => { if (!shown[i].email || !refused.has(shown[i].email)) n.add(i); }); return n; });
      }
      return total;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.created > 0) {
        toast.success(paper
          ? `${data.created} invitation(s) papier créée(s) : téléchargez leurs QR pour les imprimer`
          : `${data.created} invitation(s) en cours d'envoi`);
      if (!paper && data.held) toast(heldNotice(data.held), { duration: 10000 });
      } else {
        toast.error('Aucune invitation envoyée');
      }
      queryClient.invalidateQueries({ queryKey: ['invitations', eventId] });
      queryClient.invalidateQueries({ queryKey: ['ticket-templates', eventId] });
      queryClient.invalidateQueries({ queryKey: ['invitation-capacity', eventId] });
      queryClient.invalidateQueries({ queryKey: ['tickets', eventId], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['event', eventId], refetchType: 'all' });
    },
    onError: (err: any, indexes) => onError(err, () => sendImport.mutate(indexes)),
  });

  const resend = useMutation({
    mutationFn: async (ticketId: string) =>
      apiClient.post(`/events/${eventId}/invitations/${ticketId}/resend`),
    onSuccess: (_, ticketId) => {
      const inv = invitations.find((i) => i.id === ticketId);
      toast.success(inv?.status === 'INVITED' ? 'Lien de confirmation renvoyé' : 'Invitation renvoyée');
      queryClient.invalidateQueries({ queryKey: ['invitations', eventId] });
    },
    onError: (err: any) => onError(err),
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
    setPreview(null);
    setPicked(new Set());
    loadPreview.mutate(f);
  };

  const updateRow = (i: number, patch: Partial<GuestRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const sending = sendManual.isPending || sendImport.isPending;
  // The lines the organizer picks from: the imported file, or their contacts
  const shown = mode === 'contacts' ? contactGuests : mode === 'import' ? preview : null;
  shownRef.current = shown;
  const isCancelled = event?.status === 'CANCELLED';

  const sentCount = invitations.filter((i) => i.status !== 'CANCELLED').length;
  const usedCount = invitations.filter((i) => i.status === 'USED').length;
  const waitingCount = invitations.filter((i) => i.status === 'INVITED').length;
  const confirmedCount = invitations.filter((i) => i.response?.status === 'CONFIRMED' && i.status !== 'CANCELLED').length;
  const declinedCount = invitations.filter((i) => i.response?.status === 'DECLINED').length;
  const asksConfirmation = !!guestForm?.enabled || waitingCount > 0 || confirmedCount + declinedCount > 0;

  const activeTab = tab ?? (listLoading ? null : invitations.length ? 'guests' : isCancelled ? 'guests' : 'invite');
  const chosen = shown ? invitableLines(shown, invitedLines, picked) : [];
  const inviteCount = mode === 'manual' ? validRows.length : chosen.length;
  const seatsLeft = templateId ? selectedTemplate?.availableCount ?? 0 : undefined;
  // Why the main button is greyed, said in the bar
  const blocker = !templateId ? 'Choisissez la catégorie des invitations'
    : seatsLeft !== undefined && inviteCount > seatsLeft ? `${inviteCount} invité(s) pour ${seatsLeft} place(s) disponible(s)`
    : mode === 'manual' && invalidRows.length > 0 ? (paper ? 'Chaque invité doit avoir un nom ; l’e-mail, s’il est rempli, doit être valide' : 'Chaque invité doit avoir un nom et un e-mail valide')
    : inviteCount === 0 ? (mode === 'manual' ? 'Ajoutez au moins un invité' : 'Cochez les personnes à inviter')
    : null;
  const submit = () => {
    if (mode === 'manual') sendManual.mutate();
    else sendImport.mutate(chosen);
  };
  const switchMode = (m: typeof mode) => { setMode(m); setResult(null); setInvitedLines(new Set()); setPicked(new Set()); };

  const q = guestQuery.trim().toLowerCase();
  const shownInvitations = invitations.filter((i) =>
    (guestFilter === 'all' ? true
      : guestFilter === 'confirmed' ? i.response?.status === 'CONFIRMED' && i.status !== 'CANCELLED'
      : guestFilter === 'waiting' ? i.status === 'INVITED'
      : guestFilter === 'declined' ? i.response?.status === 'DECLINED'
      : guestFilter === 'present' ? i.status === 'USED'
      : i.emailStatus === 'FAILED' || i.emailStatus === 'HELD')
    && (!q || `${i.holderName ?? ''} ${i.holderEmail ?? ''} ${i.holderPhone ?? ''}`.toLowerCase().includes(q)));
  const toFix = invitations.filter((i) => i.status !== 'CANCELLED' && (i.emailStatus === 'FAILED' || i.emailStatus === 'HELD')).length;
  const stats: { key: GuestFilter; label: string; value: number; show: boolean }[] = [
    { key: 'all', label: 'Invités', value: sentCount, show: true },
    { key: 'confirmed', label: 'Confirmés', value: confirmedCount, show: asksConfirmation },
    { key: 'waiting', label: 'En attente de réponse', value: waitingCount, show: asksConfirmation },
    { key: 'declined', label: 'Déclinés', value: declinedCount, show: asksConfirmation },
    { key: 'present', label: 'Présents', value: usedCount, show: true },
    { key: 'issues', label: 'Envoi à revoir', value: toFix, show: toFix > 0 },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
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
        {!isCancelled && activeTab !== 'invite' && (
          <button type="button" onClick={() => setTab('invite')}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
            <UserPlus className="h-4 w-4" /> Inviter des personnes
          </button>
        )}
      </div>

      {/* Key figures: each opens the guest list filtered on it */}
      {invitations.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.filter((s) => s.show).map((s) => (
            <button key={s.key} type="button" onClick={() => { setTab('guests'); setGuestFilter(s.key); }}
              className={cn('rounded-xl border p-3 text-left transition-colors',
                activeTab === 'guests' && guestFilter === s.key
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 bg-white hover:border-indigo-300 dark:border-gray-800 dark:bg-gray-900',
                s.key === 'issues' && 'border-amber-300 dark:border-amber-800')}>
              <p className={cn('text-2xl font-bold', s.key === 'issues' ? 'text-amber-600' : 'text-gray-900 dark:text-white')}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 dark:border-gray-800">
        {([
          { key: 'guests', label: `Invités${sentCount ? ` (${sentCount})` : ''}`, icon: Users },
          ...(!isCancelled ? [{ key: 'invite', label: 'Inviter', icon: Send }] : []),
          { key: 'settings', label: 'Paramètres', icon: Settings2 },
        ] as { key: Tab; label: string; icon: typeof Users }[]).map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
              activeTab === t.key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {isCancelled && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-6 text-center">
          <XCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="font-semibold text-gray-900 dark:text-white">Événement annulé</p>
          <p className="text-sm text-gray-500 mt-1">Il n&apos;est plus possible d&apos;envoyer des invitations.</p>
        </div>
      )}

      {/* ── Guests ─────────────────────────────────────────── */}
      {activeTab === 'guests' && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {listLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : invitations.length === 0 ? (
            <div className="p-10 text-center">
              <Mail className="mx-auto h-8 w-8 text-gray-300 mb-3" />
              <p className="font-medium text-gray-900 dark:text-white">Aucune invitation pour le moment</p>
              {!isCancelled && (
                <button type="button" onClick={() => setTab('invite')} className="mt-3 text-sm font-medium text-indigo-600 hover:underline">
                  Inviter vos premiers invités
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 dark:border-gray-800 p-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} placeholder="Rechercher un invité…"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                {guestFilter !== 'all' && (
                  <button type="button" onClick={() => setGuestFilter('all')}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {stats.find((s) => s.key === guestFilter)?.label} <X className="h-3 w-3" />
                  </button>
                )}
                <button type="button" onClick={() => download('qr.zip', 'qr-invitations.zip', 'Impossible de télécharger les QR')}
                  title="Une image QR par invitation, à placer sur les invitations papier"
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
                  <QrCode className="h-4 w-4" /> QR (ZIP)
                </button>
                <button type="button" onClick={exportResponses} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
                  <Download className="h-4 w-4" /> Exporter
                </button>
              </div>
              {guestForm && <ChoiceTotals form={guestForm} invitations={invitations} />}
              {shownInvitations.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-500">Aucun invité ne correspond.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-5 py-2 font-medium">Invité</th>
                        <th className="px-5 py-2 font-medium">Catégorie</th>
                        <th className="px-5 py-2 font-medium">Envoi</th>
                        <th className="px-5 py-2 font-medium">{asksConfirmation ? 'Réponse' : 'Billet'}</th>
                        <th className="px-5 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {shownInvitations.map((inv) => (
                        <tr key={inv.id}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900 dark:text-white">{inv.holderName}</p>
                            <p className="text-xs text-gray-500">{inv.holderEmail}{inv.holderPhone ? ` · ${inv.holderPhone}` : ''}</p>
                            {inv.response?.status === 'CONFIRMED' && inv.response.answers.length > 0 && (
                              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                {inv.response.answers.map((a) => `${a.label} : ${a.value}`).join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{inv.template?.name}</td>
                          <td className="px-5 py-3"><EmailBadge status={inv.emailStatus} /></td>
                          <td className="px-5 py-3"><TicketBadge status={inv.status} response={inv.response?.status} /></td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            {(inv.status === 'INVITED' || inv.status === 'VALID') && (
                              <button type="button" title="QR de cette invitation (PNG)"
                                onClick={() => download(`${inv.id}/qr`, `qr-${(inv.holderName ?? 'invite').replace(/[\s/\\:*?"<>|]+/g, '-')}.png`, 'Impossible de télécharger le QR')}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
                                <QrCode className="h-3.5 w-3.5" /> QR
                              </button>
                            )}
                            {inv.status !== 'CANCELLED' && inv.emailStatus !== 'PENDING' && inv.holderEmail && (
                              <button
                                type="button"
                                onClick={() => resend.mutate(inv.id)}
                                disabled={resend.isPending && resend.variables === inv.id}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50"
                              >
                                {resend.isPending && resend.variables === inv.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <RotateCw className="h-3.5 w-3.5" />}
                                {inv.status === 'INVITED' ? 'Renvoyer le lien' : inv.emailStatus === 'HELD' ? 'Envoyer' : 'Renvoyer'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Invite ─────────────────────────────────────────── */}
      {activeTab === 'invite' && !isCancelled && (
        <div className="flex flex-col gap-5">
          {/* Step 1: how */}
          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 flex flex-col gap-5">
            <StepTitle n={1} title="Comment inviter ?" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                { key: 'EMAIL', label: 'Par e-mail', icon: Mail, text: guestForm?.enabled ? 'Un lien pour confirmer, puis le billet une fois confirmé.' : 'Le billet avec son QR code, directement.' },
                { key: 'PAPER', label: 'Invitations papier', icon: QrCode, text: 'Un QR par invité à imprimer ; l’e-mail est facultatif, rien n’est envoyé.' },
              ] as const).map((d) => (
                <button key={d.key} type="button" onClick={() => { setDelivery(d.key); setResult(null); }}
                  className={cn('flex items-start gap-3 rounded-xl border p-4 text-left transition-colors',
                    delivery === d.key ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 hover:border-indigo-300 dark:border-gray-700')}>
                  <d.icon className={cn('mt-0.5 h-5 w-5', delivery === d.key ? 'text-indigo-600' : 'text-gray-400')} />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white">{d.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{d.text}</span>
                  </span>
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Catégorie de billet *</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Choisir…</option>
                <option value={CAPACITY} disabled={!capacity?.available}>
                  Capacité d&apos;accueil de l&apos;événement — {capacity?.available ?? 0} place(s) hors tarifs
                </option>
                {tariffs.length > 0 && (
                  <optgroup label="Tarifs">
                    {tariffs.map((t: any) => (
                      <option key={t.id} value={t.id} disabled={t.availableCount <= 0}>
                        {t.name} — {t.availableCount} place(s) disponible(s)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="mt-1.5 text-xs text-gray-500">
                {templateId === CAPACITY
                  ? "Les invitations prennent les places de la capacité d'accueil que vos tarifs n'utilisent pas. Elles ne sont jamais mises en vente."
                  : 'Une invitation utilise une place de ce tarif.'}
              </p>
            </div>

            {!paper && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Message personnel <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="Nous serions ravis de vous compter parmi nous…"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            )}

            {!paper && <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
              <ClipboardList className="h-3.5 w-3.5" />
              Confirmation de présence : <strong className="font-medium text-gray-700 dark:text-gray-300">{guestForm?.enabled ? 'demandée' : 'non demandée'}</strong>
              <button type="button" onClick={() => setTab('settings')} className="text-indigo-600 hover:underline">Modifier</button>
            </p>}
          </section>

          {/* Step 2: who */}
          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 flex flex-col gap-4">
            <StepTitle n={2} title="Qui inviter ?" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { key: 'manual', label: 'Saisir des invités', icon: UserPlus },
                { key: 'import', label: 'Importer un fichier', icon: FileSpreadsheet },
                { key: 'contacts', label: 'Mes contacts', icon: Users },
              ] as const).map((m) => (
                <button key={m.key} type="button" onClick={() => switchMode(m.key)}
                  className={cn('inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    mode === m.key ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-gray-200 text-gray-600 hover:border-indigo-300 dark:border-gray-700 dark:text-gray-400')}>
                  <m.icon className="h-4 w-4" /> {m.label}
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
                          placeholder={paper ? 'e-mail (facultatif)' : 'email@exemple.com'}
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
                  Ajouter une ligne
                </button>
              </div>
            ) : mode === 'contacts' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                    Les personnes qui ont laissé leur e-mail sur vos événements : achats, inscriptions, invitations, boutique.
                  </p>
                  <select
                    value={contactEvent}
                    onChange={(e) => { setContactEvent(e.target.value); setInvitedLines(new Set()); setPicked(new Set()); }}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Tous mes événements</option>
                    {contactEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                {contactsLoading ? (
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" />
                ) : contactGuests.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun contact pour le moment : ils apparaissent dès que des personnes achètent un billet, s’inscrivent ou commandent sur vos événements.</p>
                ) : (
                  <ImportPreview
                    key={contactEvent}
                    counted="contact(s)"
                    guests={contactGuests}
                    invited={invitedLines}
                    paper={paper}
                    canInvite={!!seatsLeft}
                    sending={sendImport.isPending}
                    selected={picked}
                    setSelected={setPicked}
                    onInvite={(indexes) => sendImport.mutate(indexes)}
                  />
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
                    'cursor-pointer rounded-xl border-2 border-dashed text-center transition-colors',
                    preview ? 'p-4' : 'p-8',
                    dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400',
                  )}
                >
                  {loadPreview.isPending ? <Loader2 className="mx-auto h-7 w-7 text-gray-400 mb-2 animate-spin" /> : !preview && <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />}
                  {file ? (
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}<span className="block text-xs font-normal text-gray-500 mt-1">Cliquez pour choisir un autre fichier</span></p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Glissez votre fichier ici ou cliquez pour choisir</p>
                      <p className="text-xs text-gray-500 mt-1">.xlsx ou .csv — colonnes « Nom » et « Email »{paper ? ' (e-mail facultatif)' : ''} — vous verrez la liste avant d’envoyer</p>
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
                {!preview && (
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-indigo-600 hover:underline"
                  >
                    <Download className="h-4 w-4" />
                    Télécharger le modèle Excel
                  </button>
                )}
                {preview && (
                  <ImportPreview
                    guests={preview}
                    invited={invitedLines}
                    paper={paper}
                    canInvite={!!seatsLeft}
                    sending={sendImport.isPending}
                    selected={picked}
                    setSelected={setPicked}
                    onInvite={(indexes) => sendImport.mutate(indexes)}
                  />
                )}
              </div>
            )}

            {result && <ResultPanel result={result} onShowGuests={() => { setTab('guests'); setGuestFilter('all'); }} />}
          </section>

          {/* One action for every way of choosing guests */}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 pl-4 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
            <p className={cn('mr-auto text-sm', blocker ? 'text-gray-500' : 'text-gray-900 dark:text-white')}>
              {blocker ?? `${inviteCount} invité(s) · ${templateId === CAPACITY ? "Capacité d'accueil" : selectedTemplate?.name ?? ''} · ${paper ? 'papier' : 'par e-mail'}`}
            </p>
            <button
              type="button"
              disabled={!!blocker || sending}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {inviteCount === 0
                ? (paper ? 'Créer les invitations papier' : 'Envoyer les invitations')
                : paper
                ? `Créer ${inviteCount} invitation${inviteCount > 1 ? 's' : ''} papier`
                : `Envoyer ${inviteCount} invitation${inviteCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Settings ───────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <GuestFormEditor eventId={eventId} form={guestForm} timeZone={event?.timeZone} capacityAvailable={capacity?.available ?? 0}
          templates={templates.map((t: any) => ({ id: t.id, name: t.capacityPool ? "Capacité d'accueil" : t.name, capacityPool: !!t.capacityPool }))} />
      )}

      {paymentDialog}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 font-semibold text-gray-900 dark:text-white">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{n}</span>
      {title}
    </h2>
  );
}

function ResultPanel({ result, onShowGuests }: { result: SendResult; onShowGuests: () => void }) {
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
        {result.created > 0 && (
          <button type="button" onClick={onShowGuests} className="ml-auto text-xs font-medium text-indigo-600 hover:underline">Suivre les invités →</button>
        )}
      </p>
      {!!result.held && <p className="mt-2 text-gray-600 dark:text-gray-400">{heldNotice(result.held)}</p>}
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

const heldNotice = (n: number) =>
  `${n} invitation(s) en attente : pour protéger la réception de vos e-mails, 200 nouvelles adresses partent au plus par jour. Les suivantes partent automatiquement les jours suivants.`;

function EmailBadge({ status }: { status: EmailStatus }) {
  const map = {
    PENDING: { label: 'En cours', icon: Clock, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
    SENT: { label: 'Envoyé', icon: CheckCircle2, cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
    FAILED: { label: 'Échec', icon: AlertTriangle, cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
    HELD: { label: 'En attente', icon: Clock, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
    NONE: { label: 'Papier', icon: QrCode, cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  }[status] ?? { label: status, icon: Clock, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', map.cls)}>
      <map.icon className="h-3 w-3" />
      {map.label}
    </span>
  );
}

/** How many confirmed guests took each option of the choice questions, against its places */
function ChoiceTotals({ form, invitations }: { form: GuestForm; invitations: Invitation[] }) {
  const choices = (form.fields ?? []).filter((f) => f.type === 'CHOICE');
  if (!choices.length) return null;
  const confirmed = invitations.filter((i) => i.response?.status === 'CONFIRMED' && i.status !== 'CANCELLED');
  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
      {choices.map((f) => (
        <div key={f.id} className="text-sm">
          <p className="font-medium text-gray-900 dark:text-white">{f.label}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {f.options!.map((o) => {
              const n = confirmed.filter((i) => i.response!.answers.some((a) => a.fieldId === f.id && a.value === o.label)).length;
              const full = !!o.limit && n >= o.limit;
              return (
                <span key={o.id} className={cn('rounded-full px-2.5 py-0.5 text-xs', full ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}>
                  {o.label} : <strong>{n}</strong>{o.limit ? ` / ${o.limit}` : ''}{full ? ' · complet' : ''}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TicketBadge({ status, response }: { status: Invitation['status']; response?: 'CONFIRMED' | 'DECLINED' }) {
  if (response === 'DECLINED') return <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Décliné</span>;
  if (status === 'VALID' && response === 'CONFIRMED') {
    return <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400">Confirmé</span>;
  }
  const map: Record<string, { label: string; cls: string }> = {
    INVITED: { label: 'En attente de réponse', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
    VALID: { label: 'Valide', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400' },
    PENDING: { label: 'En attente', cls: 'bg-gray-100 text-gray-600' },
    USED: { label: 'Présent(e)', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
    CANCELLED: { label: 'Annulé', cls: 'bg-gray-100 text-gray-500 line-through' },
    FRAUDULENT: { label: 'Frauduleux', cls: 'bg-red-50 text-red-700' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', m.cls)}>{m.label}</span>;
}
