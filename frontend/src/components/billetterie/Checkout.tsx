'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation } from '@tanstack/react-query';
import {
  X, ChevronDown, ChevronRight, ChevronLeft, Minus, Plus, Loader2, AlertCircle, CheckCircle2,
  Ticket, Smartphone, ShoppingBag, Store, Truck,
} from 'lucide-react';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TicketVisual, ExportPDFButton, type TicketData } from './TicketCard';
import { ProductCard, CartSummary, cartLines, money, variantLabel, type Cart, type ShopCatalog } from './Shop';
import { StoreButtons } from '@/components/site/StoreButtons';
import { formatEventDayTime, formatPrice, capitalize } from '@/components/site/format';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutTemplate {
  id: string; name: string; description?: string; price: number; currency: string;
  quantity: number; availableCount: number; color: string;
}
export interface CheckoutEvent {
  id: string; name: string; venue: string; city: string; country: string;
  startDate: string; bannerUrl?: string; ticketTemplates: CheckoutTemplate[];
}
interface PurchasedTicket { ticketId: string; serialNumber: string; templateName: string; price: number; currency: string; qrCode?: string }
interface MerchOrderSummary {
  code: string; status: string; fulfillment: 'PICKUP' | 'DELIVERY'; total: number; currency: string;
  items: { productName: string; size: string | null; color: string | null; quantity: number }[];
}
export interface PurchaseResult {
  eventName: string; holderName: string; holderEmail: string;
  tickets: PurchasedTicket[]; total: number; currency: string; merchOrder?: MerchOrderSummary | null;
}

type Step = 'billet' | 'paiement' | 'application';
type Method = 'mobile_money' | 'card';

const MAX_PER_TYPE = 20;
const underline = 'w-full border-0 border-b border-[#9a9a9a] bg-transparent px-0.5 pb-1.5 pt-1 text-[17px] text-black placeholder:text-[#9a9a9a] focus:border-black focus:outline-none focus:ring-0';

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-5">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label="Retirer un billet"
        className="text-[#9a9a9a] enabled:hover:text-black disabled:opacity-40">
        <Minus className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <span className="w-6 text-center text-lg font-bold">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Ajouter un billet"
        className="text-black disabled:opacity-30">
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function BuyButton({ children, disabled, loading, onClick }: { children: React.ReactNode; disabled?: boolean; loading?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      className="flex h-[45px] w-full items-center justify-center gap-2 rounded-full bg-black text-lg font-bold uppercase text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

/** One row of an accordion: name (+ detail when open) and a chevron */
function AccordionRow({
  open, onToggle, icon, title, detail, badge, disabled,
}: { open: boolean; onToggle: () => void; icon?: React.ReactNode; title: string; detail?: React.ReactNode; badge?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} aria-expanded={open}
      className="flex w-full items-center gap-2 border-b border-[#9a9a9a] py-3 text-left disabled:opacity-40">
      {open && icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xl leading-tight">{title}</span>
        {open && detail && <span className="block text-xl font-bold leading-tight">{detail}</span>}
      </span>
      {badge && !open && <span className="rounded-full bg-black px-2 py-0.5 text-xs font-bold text-white">{badge}</span>}
      {open ? <ChevronDown className="h-7 w-7 flex-shrink-0" strokeWidth={2} /> : <ChevronRight className="h-7 w-7 flex-shrink-0" strokeWidth={2} />}
    </button>
  );
}

function TicketGlyph() {
  return (
    <span className="flex h-[44px] w-[30px] flex-shrink-0 items-center justify-center rounded-[5px] bg-black">
      <span className="h-[26px] w-[16px] rounded-[2px] border-2 border-white" />
    </span>
  );
}

// ─── Mobile Money: wait for the confirmation on the phone ─────────────────────

function MobileMoneyWaiting({
  reference, total, currency, onCompleted, onFailed, onCancel,
}: {
  reference: string; total: number; currency: string;
  onCompleted: (status: any) => void; onFailed: () => void; onCancel: () => void;
}) {
  const doneRef = useRef(false);
  const handlers = useRef({ onCompleted, onFailed });
  handlers.current = { onCompleted, onFailed };

  useEffect(() => {
    const poll = async () => {
      if (doneRef.current) return;
      try {
        const res = await publicApi.getPaymentStatus(reference);
        const d = (res.data as any).data ?? res.data;
        if (d.status === 'COMPLETED') { doneRef.current = true; handlers.current.onCompleted(d); }
        else if (d.status === 'FAILED' || d.status === 'CANCELLED') { doneRef.current = true; handlers.current.onFailed(); }
      } catch { /* transient error: keep polling */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    // Timers pause while the tab is hidden: check right away on return
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reference]);

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black text-white"><Smartphone className="h-8 w-8" /></span>
      <p className="text-xl font-semibold">Validez sur votre téléphone</p>
      <p className="text-[15px] text-[#555]">
        Une demande de paiement de <strong>{formatPrice(total, currency)}</strong> a été envoyée à votre numéro Mobile Money.
        Confirmez-la : cette page se met à jour toute seule.
      </p>
      <p className="flex items-center gap-2 text-sm text-[#707070]"><Loader2 className="h-4 w-4 animate-spin" /> En attente de confirmation</p>
      <button type="button" onClick={onCancel} className="text-sm text-[#707070] underline underline-offset-2 hover:text-black">Annuler</button>
    </div>
  );
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

export function Checkout({
  event, catalog, cart, onCartChange, shopOnly, onClose, onDone,
}: {
  event: CheckoutEvent;
  catalog?: ShopCatalog;
  cart: Cart;
  onCartChange: (cart: Cart) => void;
  /** Opened from the shop: items without tickets */
  shopOnly: boolean;
  onClose: () => void;
  /** Purchase finished: the page empties the cart */
  onDone: () => void;
}) {
  const available = event.ticketTemplates.filter(t => t.availableCount > 0);
  const [step, setStep] = useState<Step>('billet');
  const [openTemplate, setOpenTemplate] = useState<string | null>(available[0]?.id ?? null);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    !shopOnly && available[0] ? { [available[0].id]: 1 } : {},
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [method, setMethod] = useState<Method | null>(null);
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState(event.city ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [waiting, setWaiting] = useState<{ reference: string; total: number; currency: string } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  // The checkout covers the page: no scrolling behind it, Escape closes it (not while paying)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !waiting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose, waiting]);

  const setQty = (id: string, value: number) => {
    const tpl = event.ticketTemplates.find(t => t.id === id)!;
    const next = Math.max(0, Math.min(value, tpl.availableCount, MAX_PER_TYPE));
    setQuantities(q => {
      const copy = { ...q };
      if (next === 0) delete copy[id]; else copy[id] = next;
      return copy;
    });
  };

  const items = useMemo(
    () => Object.entries(quantities).filter(([, q]) => q > 0).map(([templateId, quantity]) => ({ templateId, quantity })),
    [quantities],
  );
  const ticketCount = items.reduce((s, i) => s + i.quantity, 0);
  const ticketTotal = items.reduce((s, i) => s + (event.ticketTemplates.find(t => t.id === i.templateId)?.price ?? 0) * i.quantity, 0);

  const lines = cartLines(catalog, cart);
  const merchCount = lines.reduce((s, l) => s + l.quantity, 0);
  const merchSubtotal = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const deliveryFee = merchCount > 0 && fulfillment === 'DELIVERY' ? catalog?.delivery?.fee ?? 0 : 0;
  const grandTotal = ticketTotal + merchSubtotal + deliveryFee;
  const currency = event.ticketTemplates[0]?.currency ?? lines[0]?.product.currency ?? 'USD';
  const isPaid = grandTotal > 0;
  const hasProducts = (catalog?.products.length ?? 0) > 0;

  const contactOk = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim());
  const deliveryOk = merchCount === 0 || fulfillment === 'PICKUP' || (deliveryAddress.trim().length > 3 && deliveryCity.trim().length > 1);
  const methodOk = !isPaid || (method === 'card') || (method === 'mobile_money' && phone.trim().length >= 8);
  const canPay = (ticketCount > 0 || merchCount > 0) && contactOk && deliveryOk && methodOk && !honeypot;

  const finish = (r: PurchaseResult) => { setResult(r); setStep('application'); onDone(); };

  const mutation = useMutation({
    mutationFn: () => {
      const holder = { holderName: name.trim(), holderEmail: email.trim(), holderPhone: phone.trim() || undefined };
      if (!isPaid) return publicApi.purchaseTicket(event.id, { ...holder, items });
      return publicApi.initiatePayment(event.id, {
        ...holder,
        items,
        ...(merchCount > 0 && {
          merch: lines.map(l => ({ variantId: l.variant.id, quantity: l.quantity })),
          fulfillment,
          ...(fulfillment === 'DELIVERY' && {
            deliveryAddress: deliveryAddress.trim(),
            deliveryCity: deliveryCity.trim(),
            deliveryNotes: deliveryNotes.trim() || undefined,
          }),
        }),
        paymentMethod: method!,
      });
    },
    onMutate: () => setPayError(null),
    onSuccess: res => {
      const d = (res.data as any).data ?? res.data;
      if (!isPaid) { finish(d); return; }
      if (d.paymentMethod === 'card' && d.redirectUrl) { window.location.href = d.redirectUrl; return; }
      if (d.paymentMethod === 'mobile_money') setWaiting({ reference: d.reference, total: grandTotal, currency });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      setPayError(Array.isArray(msg) ? msg[0] : msg ?? 'Une erreur est survenue. Réessayez.');
    },
  });

  const tabs: { id: Step; label: string }[] = [
    { id: 'billet', label: shopOnly ? 'Articles' : 'Billet' },
    { id: 'paiement', label: 'Paiement' },
    { id: 'application', label: 'Application' },
  ];
  const canGoTo = (s: Step) =>
    !waiting && !result && (s === 'billet' || (s === 'paiement' && (ticketCount > 0 || merchCount > 0)));

  const summaryLabel = [
    ticketCount > 0 && `${ticketCount} billet${ticketCount > 1 ? 's' : ''}`,
    merchCount > 0 && `${merchCount} article${merchCount > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' + ');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label="Sélectionner des billets">
      <div className="mx-auto flex max-w-[920px] items-center justify-between px-6 pt-6 sm:pt-8">
        <p className="text-xl sm:text-[23px]">{shopOnly ? 'Commander des articles' : 'Sélectionner des billets'}</p>
        <button type="button" onClick={onClose} disabled={!!waiting} aria-label="Fermer" className="p-1 disabled:opacity-30">
          <X className="h-7 w-7" strokeWidth={2.2} />
        </button>
      </div>

      {/* Steps */}
      <nav className="mt-10 flex justify-center gap-8 sm:mt-[70px] sm:gap-12">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => canGoTo(t.id) && setStep(t.id)}
            disabled={!canGoTo(t.id) && step !== t.id}
            className={cn('border-b-2 pb-1 text-lg sm:text-xl', step === t.id ? 'border-[#555] font-bold' : 'border-transparent')}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Event */}
      <div className="mx-auto mt-8 flex max-w-[460px] items-center gap-5 px-6">
        <div className="relative h-[86px] w-[86px] flex-shrink-0 overflow-hidden rounded-[10px] bg-[#eee]">
          {event.bannerUrl
            ? <Image src={resolveMediaUrl(event.bannerUrl)!} alt="" fill sizes="86px" className="object-cover" />
            : <div className="flex h-full items-center justify-center"><Ticket className="h-8 w-8 text-[#bbb]" /></div>}
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 text-[22px] leading-tight sm:text-[25px]">{event.name}</p>
          <p className="text-[15px]">{capitalize(formatEventDayTime(event.startDate))}</p>
          <p className="mt-1 truncate text-[17px]">{event.venue}</p>
        </div>
      </div>

      <div className="mx-auto mt-9 w-full max-w-[400px] px-6 pb-16">
        {/* ── Step 1: tickets (or items) ── */}
        {step === 'billet' && (
          <>
            <div className="rounded-[30px] border border-[#707070] px-8 pb-10 pt-7 sm:px-9">
              {!shopOnly && (
                available.length === 0 ? (
                  <p className="py-6 text-center text-lg">Plus aucun billet disponible.</p>
                ) : (
                  <div>
                    {available.map(t => (
                      <AccordionRow
                        key={t.id}
                        open={openTemplate === t.id}
                        onToggle={() => setOpenTemplate(o => (o === t.id ? null : t.id))}
                        icon={<TicketGlyph />}
                        title={t.name}
                        detail={t.price === 0 ? 'Gratuit' : `${t.currency} ${Number.isInteger(t.price) ? t.price : t.price.toFixed(2)}`}
                        badge={quantities[t.id] ? `× ${quantities[t.id]}` : undefined}
                      />
                    ))}
                    {openTemplate && event.ticketTemplates.find(t => t.id === openTemplate)?.description && (
                      <p className="pt-3 text-sm text-[#555]">{event.ticketTemplates.find(t => t.id === openTemplate)!.description}</p>
                    )}
                  </div>
                )
              )}

              {shopOnly && (merchCount > 0
                ? <CartSummary lines={lines} cart={cart} onCartChange={onCartChange} />
                : <p className="py-4 text-center text-[15px] text-[#555]">Ajoutez des articles depuis la boutique.</p>)}

              <div className="mt-8 space-y-4 rounded-[20px] border border-[#707070] px-6 pb-3 pt-4">
                {!shopOnly && openTemplate && (
                  <Stepper
                    value={quantities[openTemplate] ?? 0}
                    max={Math.min(available.find(t => t.id === openTemplate)?.availableCount ?? 0, MAX_PER_TYPE)}
                    onChange={v => setQty(openTemplate, v)}
                  />
                )}
                {(ticketCount > 0 || merchCount > 0) && (
                  <p className="text-center text-sm text-[#555]">
                    {summaryLabel} · <strong className="text-black">{isPaid ? formatPrice(grandTotal, currency) : 'Gratuit'}</strong>
                  </p>
                )}
                <BuyButton disabled={ticketCount === 0 && merchCount === 0} onClick={() => setStep('paiement')}>Acheter</BuyButton>
              </div>
            </div>

            {/* Souvenirs in the same order */}
            {!shopOnly && hasProducts && (
              <div className="mt-10">
                <p className="mb-3 flex items-center gap-2 text-[17px]"><ShoppingBag className="h-5 w-5" /> Ajouter un souvenir ? <span className="text-[#9a9a9a]">(facultatif)</span></p>
                <div className="space-y-3">
                  {catalog!.products.map(p => <ProductCard key={p.id} product={p} cart={cart} onCartChange={onCartChange} compact />)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Step 2: contact and payment ── */}
        {step === 'paiement' && (
          <div className="rounded-[30px] border border-[#707070] px-8 pb-10 pt-7 sm:px-9">
            {waiting ? (
              <MobileMoneyWaiting
                reference={waiting.reference}
                total={waiting.total}
                currency={waiting.currency}
                onCompleted={d => finish({
                  eventName: event.name, holderName: name.trim(), holderEmail: email.trim(),
                  tickets: Array.isArray(d.tickets) ? d.tickets : [], total: waiting.total, currency: waiting.currency,
                  merchOrder: d.merchOrder ?? null,
                })}
                onFailed={() => { setWaiting(null); setPayError("Le paiement n'a pas abouti. Vous pouvez réessayer."); }}
                onCancel={() => setWaiting(null)}
              />
            ) : (
              <>
                <button type="button" onClick={() => setStep('billet')} className="-ml-1 mb-4 flex items-center gap-1 text-sm text-[#707070] hover:text-black">
                  <ChevronLeft className="h-4 w-4" /> {summaryLabel} · {isPaid ? formatPrice(grandTotal, currency) : 'Gratuit'}
                </button>

                <div className="space-y-5">
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom complet" autoComplete="name" maxLength={100} className={underline} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (pour recevoir vos billets)" autoComplete="email" maxLength={160} className={underline} />
                  {/* honeypot — hidden from people, bots fill it */}
                  <input value={honeypot} onChange={e => setHoneypot(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
                </div>

                {merchCount > 0 && (
                  <div className="mt-7 space-y-3">
                    <p className="text-[15px] text-[#555]">Retrait de vos articles</p>
                    <div className={cn('grid gap-2', catalog?.delivery ? 'grid-cols-2' : 'grid-cols-1')}>
                      {[
                        { id: 'PICKUP' as const, icon: <Store className="h-4 w-4" />, label: 'Sur place', sub: catalog?.pickupInfo || "À l'événement" },
                        ...(catalog?.delivery ? [{ id: 'DELIVERY' as const, icon: <Truck className="h-4 w-4" />, label: 'Livraison', sub: catalog.delivery.fee > 0 ? `+ ${money(catalog.delivery.fee, currency)}` : 'Gratuite' }] : []),
                      ].map(m => (
                        <button key={m.id} type="button" onClick={() => setFulfillment(m.id)}
                          className={cn('rounded-2xl border px-3 py-2.5 text-left text-sm', fulfillment === m.id ? 'border-black bg-black text-white' : 'border-[#9a9a9a]')}>
                          <span className="flex items-center gap-1.5 font-semibold">{m.icon}{m.label}</span>
                          <span className="block text-xs opacity-70">{m.sub}</span>
                        </button>
                      ))}
                    </div>
                    {fulfillment === 'DELIVERY' && (
                      <div className="space-y-4 pt-1">
                        <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} maxLength={200} placeholder="Adresse de livraison" className={underline} />
                        <input value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)} maxLength={80} placeholder="Ville" className={underline} />
                        <input value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} maxLength={300} placeholder="Précisions (repère, étage…)" className={underline} />
                      </div>
                    )}
                  </div>
                )}

                {isPaid && (
                  <div className="mt-6">
                    <AccordionRow open={method === 'card'} onToggle={() => setMethod(m => (m === 'card' ? null : 'card'))} title="Visa" detail={<span className="text-sm font-normal text-[#555]">Visa, Mastercard</span>} />
                    <AccordionRow open={method === 'mobile_money'} onToggle={() => setMethod(m => (m === 'mobile_money' ? null : 'mobile_money'))} title="Mobile money" detail={<span className="text-sm font-normal text-[#555]">M-Pesa, Airtel Money, Orange Money</span>} />
                  </div>
                )}

                <div className="mt-8 space-y-4 rounded-[20px] border border-[#707070] px-6 pb-3 pt-4">
                  {method === 'mobile_money' && isPaid && (
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Numéro" autoComplete="tel" maxLength={30} className={cn(underline, 'text-xl')} />
                  )}
                  {method === 'card' && isPaid && (
                    <p className="text-center text-sm text-[#555]">Vous serez redirigé vers la page de paiement sécurisée.</p>
                  )}
                  {payError && (
                    <p className="flex items-start gap-1.5 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />{payError}</p>
                  )}
                  <BuyButton disabled={!canPay} loading={mutation.isPending} onClick={() => mutation.mutate()}>
                    {isPaid ? `Acheter · ${formatPrice(grandTotal, currency)}` : 'Obtenir mes billets'}
                  </BuyButton>
                </div>
                {!contactOk && (name || email) && (
                  <p className="mt-3 text-center text-xs text-[#707070]">Indiquez votre nom et un email valide pour recevoir vos billets.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Step 3: tickets, then the app ── */}
      {step === 'application' && result && (
        <div className="mx-auto -mt-6 max-w-[720px] px-6 pb-16">
          <div className="rounded-[30px] border border-[#707070] px-5 py-8 sm:px-9">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-12 w-12" strokeWidth={1.5} />
              <p className="text-2xl">
                {result.tickets.length > 0
                  ? `${result.tickets.length} billet${result.tickets.length > 1 ? 's' : ''} confirmé${result.tickets.length > 1 ? 's' : ''}`
                  : 'Commande confirmée'}
              </p>
              <p className="text-[15px] text-[#555]">
                Un email de confirmation {result.tickets.length > 0 ? 'avec vos billets ' : ''}a été envoyé à <strong className="text-black">{result.holderEmail}</strong>.
              </p>
              {result.tickets.length > 0 && (
                <ExportPDFButton
                  className="mt-3 rounded-full bg-black px-6 py-2.5 text-white hover:bg-black hover:opacity-85"
                  tickets={result.tickets.map((t, i): TicketData => ({
                    serialNumber: t.serialNumber, holderName: result.holderName, holderEmail: result.holderEmail,
                    eventName: result.eventName, templateName: t.templateName, price: t.price, currency: t.currency,
                    qrCode: t.qrCode, eventDate: new Date(event.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                    eventVenue: event.venue, eventCity: event.city, ticketIndex: i + 1, totalTickets: result.tickets.length,
                  }))}
                />
              )}
            </div>

            <div className="mt-8 space-y-5">
              {result.tickets.map((t, i) => (
                <div key={t.serialNumber} className="flex justify-center overflow-x-auto">
                  <TicketVisual data={{
                    serialNumber: t.serialNumber, holderName: result.holderName, holderEmail: result.holderEmail,
                    eventName: result.eventName, templateName: t.templateName, price: t.price, currency: t.currency,
                    qrCode: t.qrCode, eventDate: new Date(event.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                    eventVenue: event.venue, eventCity: event.city, ticketIndex: i + 1, totalTickets: result.tickets.length,
                  }} />
                </div>
              ))}
            </div>

            {result.merchOrder && (
              <div className="mt-8 rounded-2xl bg-[#F7F7F7] p-4">
                <p className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-4 w-4" /> Commande boutique <span className="font-mono">{result.merchOrder.code}</span></p>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {result.merchOrder.items.map((i, idx) => (
                    <li key={idx}>{i.quantity} × {i.productName}{variantLabel(i) ? ` (${variantLabel(i)})` : ''}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-[#555]">
                  {result.merchOrder.fulfillment === 'PICKUP'
                    ? `À retirer sur place : présentez le QR code reçu par email ou le code ${result.merchOrder.code}.`
                    : "Livraison : vous serez prévenu(e) par email de l'expédition."}
                </p>
              </div>
            )}

            <div className="mt-10 border-t border-[#d0d0d0] pt-8 text-center">
              <p className="text-xl">Télécharge l&apos;appli ZAYA</p>
              <p className="mx-auto mt-2 max-w-[420px] text-[15px] text-[#555]">Retrouve tes billets et les prochains événements, où que tu sois.</p>
              <StoreButtons className="mt-5 justify-center" />
            </div>
          </div>
          <div className="mt-6 text-center">
            <button type="button" onClick={onClose} className="text-[15px] underline underline-offset-4">Retour à l&apos;événement</button>
          </div>
        </div>
      )}
    </div>
  );
}
