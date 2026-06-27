'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import {
  ArrowLeft, MapPin, Calendar, Clock, Users, Ticket,
  CheckCircle2, Loader2, X, AlertCircle,
  Plus, Minus, ShoppingCart, Phone, CreditCard, Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TicketVisual, ExportPDFButton, type TicketData } from '@/components/billetterie/TicketCard';

interface TicketTemplate {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  quantity: number;
  availableCount: number;
  color: string;
}

interface PublicEvent {
  id: string;
  name: string;
  description?: string;
  venue: string;
  address?: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  bannerUrl?: string;
  totalCapacity: number;
  minPrice: number | null;
  soldOut: boolean;
  ticketTemplates: TicketTemplate[];
  organizer: { firstName: string; lastName: string };
  _count: { tickets: number };
}

interface PurchasedTicket {
  ticketId: string;
  serialNumber: string;
  templateName: string;
  price: number;
  currency: string;
  qrCode?: string;
}

interface PurchaseResult {
  eventName: string;
  holderName: string;
  holderEmail: string;
  tickets: PurchasedTicket[];
  total: number;
  currency: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Quantity stepper ─────────────────────────────────────────────────────────

function QtyButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

// ─── Mobile Money waiting screen ─────────────────────────────────────────────

function MobileMoneyWaiting({
  reference, holderName, holderEmail, total, currency, eventName,
  onSuccess, onCancel,
}: {
  reference: string;
  holderName: string;
  holderEmail: string;
  total: number;
  currency: string;
  eventName: string;
  onSuccess: (result: PurchaseResult) => void;
  onCancel: () => void;
}) {
  const [dots, setDots] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const dotsInterval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(dotsInterval);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await publicApi.getPaymentStatus(reference);
        const d = (res.data as any).data ?? res.data;
        if (d.status === 'COMPLETED') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onSuccess({
            eventName,
            holderName,
            holderEmail,
            tickets: Array.isArray(d.tickets) ? d.tickets : [],
            total,
            currency,
          });
        } else if (d.status === 'FAILED' || d.status === 'CANCELLED') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onCancel();
        }
      } catch {
        // ignore transient errors, keep polling
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [reference, holderName, holderEmail, total, currency, eventName, onSuccess, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 px-6 py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">Validez sur votre téléphone</h2>
          <p className="text-indigo-100 text-sm">
            Une demande de paiement de <strong>{total.toFixed(2)} {currency}</strong> a été envoyée à votre numéro Mobile Money.
          </p>
        </div>
        <div className="px-6 py-6 space-y-4 text-center">
          <div className="flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">En attente de confirmation{dots}</span>
          </div>
          <p className="text-xs text-gray-500">
            Ouvrez votre application Mobile Money et confirmez le paiement.
            Cette page se mettra à jour automatiquement.
          </p>
          <button
            onClick={onCancel}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Purchase Modal ───────────────────────────────────────────────────────────

function PurchaseModal({
  event,
  onClose,
  onSuccess,
}: {
  event: PublicEvent;
  onClose: () => void;
  onSuccess: (result: PurchaseResult) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'card' | null>(null);
  const [mmWaiting, setMmWaiting] = useState<{ reference: string; total: number; currency: string } | null>(null);

  const availableTemplates = event.ticketTemplates.filter(t => t.availableCount > 0);

  const setQty = (templateId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[templateId] ?? 0;
      const tpl = event.ticketTemplates.find(t => t.id === templateId)!;
      const next = Math.min(Math.max(0, current + delta), Math.min(tpl.availableCount, 20));
      if (next === 0) { const copy = { ...prev }; delete copy[templateId]; return copy; }
      return { ...prev, [templateId]: next };
    });
  };

  const items = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => qty > 0).map(([templateId, quantity]) => ({ templateId, quantity })),
    [quantities],
  );

  const totalCount = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => {
    const tpl = event.ticketTemplates.find(t => t.id === i.templateId);
    return s + (tpl ? tpl.price * i.quantity : 0);
  }, 0);

  const currency = event.ticketTemplates[0]?.currency ?? 'USD';
  const totalLabel = totalPrice === 0 ? 'Gratuit' : `${totalPrice.toFixed(2)} ${currency}`;
  const isPaid = totalPrice > 0;

  const contactOk = name.trim().length >= 2 && email.includes('@');
  const phoneRequiredForMM = paymentMethod === 'mobile_money' && !phone.trim();
  const canSubmit = items.length > 0 && contactOk && (!isPaid || paymentMethod !== null) && !phoneRequiredForMM;

  const mutation = useMutation({
    mutationFn: () => {
      if (!isPaid) {
        return publicApi.purchaseTicket(event.id, {
          holderName: name.trim(), holderEmail: email.trim(), holderPhone: phone.trim() || undefined, items,
        });
      }
      return publicApi.initiatePayment(event.id, {
        holderName: name.trim(), holderEmail: email.trim(), holderPhone: phone.trim() || undefined,
        items, paymentMethod: paymentMethod!, currency,
      });
    },
    onSuccess: (res) => {
      const d = (res.data as any).data ?? res.data;
      if (!isPaid) {
        onSuccess(d);
        return;
      }
      if (d.paymentMethod === 'card' && d.redirectUrl) {
        window.location.href = d.redirectUrl;
        return;
      }
      if (d.paymentMethod === 'mobile_money') {
        setMmWaiting({ reference: d.reference, total: totalPrice, currency });
      }
    },
  });

  if (mmWaiting) {
    return (
      <MobileMoneyWaiting
        reference={mmWaiting.reference}
        holderName={name.trim()}
        holderEmail={email.trim()}
        total={mmWaiting.total}
        currency={mmWaiting.currency}
        eventName={event.name}
        onSuccess={onSuccess}
        onCancel={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Inscription</p>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">{event.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Step 1: ticket selection */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              1 — Choisissez vos billets
            </p>
            <div className="space-y-2.5">
              {availableTemplates.map(t => {
                const qty = quantities[t.id] ?? 0;
                const price = t.price === 0 ? 'Gratuit' : `${t.price.toFixed(2)} ${t.currency}`;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3.5 transition-all',
                      qty > 0
                        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50',
                    )}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.name}</p>
                      <p className={cn('text-xs mt-0.5', t.price === 0 ? 'text-emerald-600' : 'text-indigo-600 dark:text-indigo-400')}>
                        {price}
                        <span className="text-gray-400 ml-1.5">&middot; {t.availableCount} dispo.</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <QtyButton onClick={() => setQty(t.id, -1)} disabled={qty === 0}><Minus className="h-3 w-3" /></QtyButton>
                      <span className="w-5 text-center text-sm font-bold text-gray-900 dark:text-white">{qty}</span>
                      <QtyButton onClick={() => setQty(t.id, +1)} disabled={qty >= Math.min(t.availableCount, 20)}><Plus className="h-3 w-3" /></QtyButton>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalCount > 0 && (
              <div className="mt-3 flex items-center justify-between bg-indigo-600 text-white rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShoppingCart className="h-4 w-4" />
                  {totalCount} billet{totalCount > 1 ? 's' : ''}
                </div>
                <span className="text-sm font-bold">{totalLabel}</span>
              </div>
            )}
          </div>

          {/* Step 2: contact info */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              2 — Vos coordonnées
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Nom complet <span className="text-red-500">*</span>
                </label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jean Dupont"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Adresse email <span className="text-red-500">*</span>
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jean@exemple.com"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    Téléphone
                    {paymentMethod === 'mobile_money'
                      ? <span className="text-red-500">*</span>
                      : <span className="text-gray-400 font-normal">(facultatif)</span>
                    }
                  </span>
                </label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+243 81 234 5678"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          </div>

          {/* Step 3: payment method (only for paid tickets) */}
          {isPaid && totalCount > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                3 — Mode de paiement
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { id: 'mobile_money' as const, icon: <Smartphone className="h-5 w-5" />, label: 'Mobile Money', sub: 'M-Pesa, Airtel, Orange…' },
                  { id: 'card' as const, icon: <CreditCard className="h-5 w-5" />, label: 'Carte bancaire', sub: 'Visa, Mastercard' },
                ] as const).map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all',
                      paymentMethod === m.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600',
                    )}
                  >
                    {m.icon}
                    <div>
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="text-xs opacity-70 mt-0.5">{m.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
              {paymentMethod === 'mobile_money' && !phone.trim() && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  Veuillez saisir votre numéro de téléphone ci-dessus.
                </p>
              )}
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {(mutation.error as any)?.response?.data?.message ?? 'Une erreur est survenue. Réessayez.'}
            </div>
          )}

          <p className="text-xs text-gray-400 leading-relaxed">
            Vos billets seront envoyés par email. Présentez le QR code ou le numéro de série à l&apos;entrée.
          </p>
        </div>

        {/* Footer CTA */}
        <div className="px-6 pb-6 pt-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {mutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Traitement…</>
              : <>
                  <Ticket className="h-4 w-4" />
                  {totalCount === 0
                    ? 'Sélectionnez des billets'
                    : isPaid && !paymentMethod
                      ? 'Choisissez un mode de paiement'
                      : isPaid
                        ? `Payer ${totalLabel} — ${totalCount} billet${totalCount > 1 ? 's' : ''}`
                        : `Obtenir ${totalCount} billet${totalCount > 1 ? 's' : ''} — Gratuit`
                  }
                </>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  result, event, onClose,
}: {
  result: PurchaseResult;
  event: PublicEvent;
  onClose: () => void;
}) {
  const totalLabel = result.total === 0 ? 'Gratuit' : `${result.total.toFixed(2)} ${result.currency}`;

  const eventDate = new Date(event.startDate).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const ticketDataList: TicketData[] = result.tickets.map((t, i) => ({
    serialNumber: t.serialNumber,
    holderName:   result.holderName,
    holderEmail:  result.holderEmail,
    eventName:    result.eventName,
    templateName: t.templateName,
    price:        t.price,
    currency:     t.currency,
    qrCode:       t.qrCode,
    eventDate,
    eventVenue:   event.venue,
    eventCity:    event.city,
    ticketIndex:  i + 1,
    totalTickets: result.tickets.length,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {result.tickets.length} billet{result.tickets.length > 1 ? 's' : ''} confirmé{result.tickets.length > 1 ? 's' : ''}
              </h2>
              <p className="text-emerald-100 text-xs">{result.eventName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportPDFButton tickets={ticketDataList} />
            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tickets */}
        <div className="overflow-y-auto flex-1 p-3 sm:p-5 space-y-4">

          {/* Summary pill */}
          <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5">
            <span className="text-gray-600 dark:text-gray-300 font-medium truncate mr-2">{result.holderName} · {result.holderEmail}</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">{totalLabel}</span>
          </div>

          {/* Ticket cards */}
          {ticketDataList.map((td) => (
            <div key={td.serialNumber} className="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5">
              <div className="flex justify-center">
                <TicketVisual data={td} />
              </div>
            </div>
          ))}

          {/* Email notice */}
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
            <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <span>Un email de confirmation avec tous vos billets a été envoyé à <strong>{result.holderEmail}</strong>.</span>
          </div>
        </div>

        <div className="px-3 sm:px-5 pb-3 sm:pb-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);

  const { data: event, isLoading, isError } = useQuery<PublicEvent>({
    queryKey: ['public-event', id],
    queryFn: () => publicApi.getEvent(id).then(r => {
      const d = (r.data as any);
      return d.data ?? d;
    }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Événement introuvable</h2>
        <p className="text-sm text-gray-500">Cet événement n&apos;existe pas ou n&apos;est plus disponible.</p>
        <Link href="/billetterie" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" /> Retour à la billetterie
        </Link>
      </div>
    );
  }

  const availableTemplates = event.ticketTemplates.filter(t => t.availableCount > 0);
  const totalSold = event._count.tickets;

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        <Link
          href="/billetterie"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Tous les événements
        </Link>

        {event.bannerUrl && (
          <div className="rounded-2xl overflow-hidden shadow-md h-64 sm:h-80">
            <img src={resolveMediaUrl(event.bannerUrl)} alt={event.name} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left — info */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight">{event.name}</h1>
              <p className="mt-1 text-sm text-gray-500">Organisé par {event.organizer.firstName} {event.organizer.lastName}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: <Calendar className="h-5 w-5 text-indigo-500" />, label: 'Date de début', value: formatDate(event.startDate), sub: formatTime(event.startDate) },
                { icon: <MapPin className="h-5 w-5 text-rose-500" />, label: 'Lieu', value: event.venue, sub: `${event.city}, ${event.country}` },
                { icon: <Clock className="h-5 w-5 text-amber-500" />, label: 'Date de fin', value: formatDate(event.endDate), sub: formatTime(event.endDate) },
                { icon: <Users className="h-5 w-5 text-emerald-500" />, label: 'Capacité', value: `${event.totalCapacity.toLocaleString('fr-FR')} places`, sub: `${totalSold} billet${totalSold > 1 ? 's' : ''} vendu${totalSold > 1 ? 's' : ''}` },
              ].map(c => (
                <div key={c.label} className="flex items-start gap-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                  <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">{c.icon}</div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">{c.label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{c.value}</p>
                    <p className="text-xs text-gray-500">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {event.address && (
              <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                <MapPin className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                {event.address}, {event.city}, {event.country}
              </div>
            )}

            {event.description && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 leading-relaxed">
                {event.description}
              </div>
            )}
          </div>

          {/* Right — ticket panel */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Ticket className="h-4 w-4 text-indigo-500" />
              Billets disponibles
            </h2>

            {event.soldOut ? (
              <div className="rounded-2xl border-2 border-dashed border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-6 text-center space-y-2">
                <p className="font-bold text-red-600 dark:text-red-400">Événement complet</p>
                <p className="text-xs text-red-500">Toutes les places ont été vendues.</p>
              </div>
            ) : event.ticketTemplates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
                <p className="text-sm text-gray-400">Aucun billet disponible.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {event.ticketTemplates.map(t => {
                    const available = t.availableCount > 0;
                    const price = t.price === 0 ? 'Gratuit' : `${t.price.toFixed(2)} ${t.currency}`;
                    return (
                      <div key={t.id} className={cn(
                        'rounded-xl border p-3.5',
                        available
                          ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                          : 'bg-gray-50 dark:bg-gray-800/40 border-dashed border-gray-200 dark:border-gray-700 opacity-55',
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: t.color }} />
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{t.name}</p>
                              {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                            </div>
                          </div>
                          <span className={cn('text-sm font-bold flex-shrink-0', t.price === 0 ? 'text-emerald-600' : 'text-indigo-600 dark:text-indigo-400')}>
                            {price}
                          </span>
                        </div>
                        <p className={cn('text-xs mt-2', available ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-400')}>
                          {available ? `${t.availableCount} place${t.availableCount > 1 ? 's' : ''} restante${t.availableCount > 1 ? 's' : ''}` : 'Épuisé'}
                        </p>
                        {t.quantity > 0 && (
                          <div className="mt-2 h-1 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                            <div
                              className={cn('h-1 rounded-full', available ? 'bg-indigo-400' : 'bg-red-400')}
                              style={{ width: `${Math.min(100, ((t.quantity - t.availableCount) / t.quantity) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {availableTemplates.length > 0 && (
                  <button
                    onClick={() => setModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 shadow-md transition-all"
                  >
                    <Ticket className="h-4 w-4" />
                    {availableTemplates.length > 1 ? 'Choisir mes billets' : (availableTemplates[0].price === 0 ? "S'inscrire gratuitement" : 'Acheter un billet')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {modalOpen && !purchaseResult && (
        <PurchaseModal
          event={event}
          onClose={() => setModalOpen(false)}
          onSuccess={(result) => { setModalOpen(false); setPurchaseResult(result); }}
        />
      )}

      {purchaseResult && (
        <SuccessScreen
          result={purchaseResult}
          event={event}
          onClose={() => { setPurchaseResult(null); router.push('/billetterie'); }}
        />
      )}
    </>
  );
}
