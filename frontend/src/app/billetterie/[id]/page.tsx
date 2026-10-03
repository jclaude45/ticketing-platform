'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Loader2, Heart, Share2, Tag, MapPin, Map as MapIcon, CircleDollarSign, ShoppingCart, Ticket, Check } from 'lucide-react';
import { publicApi, resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Checkout, type CheckoutTemplate } from '@/components/billetterie/Checkout';
import { ProductCard, cartLines, money, type Cart, type ShopCatalog } from '@/components/billetterie/Shop';
import { ZayaLogo } from '@/components/site/ZayaLogo';
import { StoreButtons } from '@/components/site/StoreButtons';
import { EVENT_TYPE_LABELS } from '@/components/site/site-config';
import { capitalize, formatEventDayTime, fromPriceLabel } from '@/components/site/format';

interface PublicEvent {
  id: string;
  name: string;
  description?: string;
  venue: string;
  address?: string;
  city: string;
  country: string;
  type?: string;
  startDate: string;
  endDate: string;
  bannerUrl?: string;
  totalCapacity: number;
  minPrice: number | null;
  soldOut: boolean;
  ticketTemplates: CheckoutTemplate[];
  organizer: { firstName: string; lastName: string; avatar?: string | null };
  _count: { tickets: number };
}

const FAVORITES_KEY = 'zaya_favoris';

function readFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'); } catch { return []; }
}

/** Heart (favourite on this device) and share, over the poster */
function PosterActions({ event }: { event: PublicEvent }) {
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setLiked(readFavorites().includes(event.id)), [event.id]);

  const toggleLike = () => {
    const favs = readFavorites();
    const next = favs.includes(event.id) ? favs.filter(f => f !== event.id) : [...favs, event.id];
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    setLiked(next.includes(event.id));
  };
  const share = async () => {
    const url = window.location.href.split('?')[0];
    if (navigator.share) {
      try { await navigator.share({ title: event.name, url }); } catch { /* dismissed */ }
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const btn = 'flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black text-white transition-transform hover:scale-110';
  return (
    <div className="absolute bottom-3 right-4 flex gap-2">
      <button type="button" onClick={toggleLike} className={btn} aria-pressed={liked} aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
        <Heart className={cn('h-4 w-4', liked && 'fill-white')} />
      </button>
      <button type="button" onClick={share} className={btn} aria-label="Partager">
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [checkout, setCheckout] = useState<false | 'tickets' | 'shop'>(false);
  const [cart, setCart] = useState<Cart>({});

  // No `retry: false`: a network hiccup (Mac waking up, Wi-Fi) is retried; 404s never are (QueryProvider)
  const { data: event, isLoading, isError, error, refetch } = useQuery<PublicEvent>({
    queryKey: ['public-event', id],
    queryFn: () => publicApi.getEvent(id).then(r => {
      const d = (r.data as any);
      return d.data ?? d;
    }),
  });
  const notFound = (error as any)?.response?.status === 404;

  const { data: catalog } = useQuery<ShopCatalog>({
    queryKey: ['public-shop', id],
    queryFn: () => publicApi.getShop(id).then(r => (r.data as any).data ?? r.data),
    enabled: !!event,
    retry: false,
  });
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  const cartTotal = cartLines(catalog, cart).reduce((s, l) => s + l.product.price * l.quantity, 0);

  // Audience statistics: count this visit once per tab session (no cookie, anonymous)
  useEffect(() => {
    if (!id) return;
    const key = `zaya_view_${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* storage blocked: still count the visit */ }
    const source = new URLSearchParams(window.location.search).get('utm_source') ?? undefined;
    publicApi.trackView(id, { referrer: document.referrer || undefined, source }).catch(() => {});
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-black" />
      </div>
    );
  }

  // A failed background refresh keeps the event on screen (and any payment in progress):
  // the error page is only for an event that never loaded
  if (!event) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-6 py-24 text-center">
        <h2 className="text-3xl">{isError && !notFound ? 'Connexion impossible' : 'Événement introuvable'}</h2>
        <p className="text-[#555]">
          {isError && !notFound
            ? "Impossible de charger l'événement. Vérifiez votre connexion internet."
            : "Cet événement n'existe pas ou n'est plus disponible."}
        </p>
        <div className="flex flex-col items-center gap-3 pt-2">
          {isError && !notFound && (
            <button onClick={() => refetch()} className="rounded-full bg-black px-6 py-2.5 text-sm uppercase text-white">Réessayer</button>
          )}
          <Link href="/billetterie" className="inline-flex items-center gap-2 text-[15px] underline underline-offset-4">
            <ArrowLeft className="h-4 w-4" /> Retour à la billetterie
          </Link>
        </div>
      </div>
    );
  }

  const available = event.ticketTemplates.filter(t => t.availableCount > 0);
  const canBuy = available.length > 0 && new Date(event.endDate).getTime() > Date.now();
  const organizerName = `${event.organizer.firstName} ${event.organizer.lastName}`.trim();
  const mapsQuery = [event.venue, event.address, event.city, event.country].filter(Boolean).join(', ');
  const hasProducts = (catalog?.products.length ?? 0) > 0;

  return (
    <>
      <div className="mx-auto max-w-[1366px] px-6 pb-10 pt-6 lg:px-[150px] lg:pt-[117px]">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-[46px]">

          {/* ── Left: poster ── */}
          <aside className="lg:w-[295px] lg:flex-shrink-0">
            <div className="relative aspect-square overflow-hidden rounded-[14px] bg-[#eee] lg:aspect-auto lg:h-[291px]">
              {event.bannerUrl ? (
                <Image src={resolveMediaUrl(event.bannerUrl)!} alt={event.name} fill priority sizes="(min-width: 1024px) 295px, 100vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center"><Ticket className="h-16 w-16 text-[#bbb]" strokeWidth={1.4} /></div>
              )}
              <PosterActions event={event} />
            </div>
            <p className="mt-6 hidden text-base leading-relaxed lg:block">
              Zaya protège les participants et les organisateurs des arnaques. Vos billets vous sont envoyés par email,
              chacun avec un QR code unique et sécurisé.
            </p>
          </aside>

          {/* ── Right: details ── */}
          <div className="min-w-0 flex-1 lg:max-w-[690px]">
            <h1 className="break-words text-[36px] font-normal tracking-normal leading-[1] lg:text-[44px]">{event.name}</h1>
            {organizerName && <p className="mt-1 text-2xl leading-tight lg:text-[32px]">{organizerName}</p>}
            <p className="mt-3 text-2xl lg:text-[33px]">{capitalize(formatEventDayTime(event.startDate))}</p>
            {/* Description right under the date */}
            {event.description && (
              <p className="mt-4 whitespace-pre-line text-lg leading-snug text-[#333] lg:text-[21px]">{event.description}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-x-7 gap-y-2 text-lg lg:mt-8 lg:text-[19px]">
              <span className="flex items-center gap-2"><Tag className="h-7 w-7 -scale-x-100" strokeWidth={1.4} />{EVENT_TYPE_LABELS[event.type ?? 'OTHER'] ?? 'Événement'}</span>
              <span className="flex items-center gap-2"><MapPin className="h-7 w-7" strokeWidth={1.4} />{event.venue}</span>
            </div>

            {/* Price box */}
            {event.ticketTemplates.length > 0 && (
              <div className="mt-8 flex flex-col gap-4 rounded-[20px] bg-[#707070] px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between lg:mt-11 lg:px-[46px]">
                <div>
                  <p className="text-[30px] font-light leading-tight lg:text-[37px]">{fromPriceLabel(event)}</p>
                  <p className="mt-1 text-lg font-light text-white/50">Le prix final. Pas de frais cachés.</p>
                </div>
                {canBuy ? (
                  <button type="button" onClick={() => setCheckout('tickets')}
                    className="h-[45px] flex-shrink-0 rounded-full bg-white px-9 text-lg font-bold uppercase text-black transition-opacity hover:opacity-90">
                    Acheter
                  </button>
                ) : (
                  <span className="text-lg font-semibold uppercase text-white/70">{event.soldOut ? 'Complet' : 'Ventes terminées'}</span>
                )}
              </div>
            )}

            {/* Shop */}
            {hasProducts && (
              <section id="boutique" className="mt-14 border-t border-black pt-10">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="font-normal tracking-normal text-[32px] lg:text-[37px]">Boutique</h2>
                    <p className="mt-1 text-[15px] text-[#555]">
                      Souvenirs officiels — à retirer sur place{catalog?.delivery ? ' ou en livraison' : ''}.
                    </p>
                  </div>
                  {cartCount > 0 && (
                    <button type="button" onClick={() => setCheckout('shop')}
                      className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:opacity-85">
                      <ShoppingCart className="h-4 w-4" />
                      Commander {cartCount} article{cartCount > 1 ? 's' : ''} — {money(cartTotal, catalog!.products[0].currency)}
                    </button>
                  )}
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {catalog!.products.map(p => <ProductCard key={p.id} product={p} cart={cart} onCartChange={setCart} />)}
                </div>
                {cartCount > 0 && canBuy && (
                  <p className="mt-3 text-xs text-[#555]">Vous prenez aussi un billet ? Cliquez sur « Acheter » : vos articles seront dans la même commande.</p>
                )}
              </section>
            )}

            {/* Refunds (CGU, section 5) */}
            <section className="mt-14 lg:mt-[150px]">
              <div className="flex items-start gap-5">
                <CircleDollarSign className="h-9 w-9 flex-shrink-0" strokeWidth={1.4} />
                <p className="text-lg leading-snug lg:text-[23px]">
                  Tu peux obtenir un remboursement si :<br />
                  - Cet événement est annulé<br />
                  - Cet événement est reporté et tu ne peux pas venir à la nouvelle date
                  <Link href="/cgu" className="mt-2 block text-[15px] text-[#707070] underline underline-offset-4">Conditions de remboursement</Link>
                </p>
              </div>
            </section>

            {/* Organizer */}
            {organizerName && (
              <section className="mt-12 border-t border-black pt-8 lg:-mx-[30px] lg:px-[30px]">
                <h2 className="font-normal tracking-normal text-[28px] lg:text-[33px]">Organisé par :</h2>
                <div className="mt-8 flex items-center gap-5 lg:gap-7">
                  <div className="relative h-[60px] w-[60px] flex-shrink-0 overflow-hidden rounded-full bg-[#ddd]">
                    {event.organizer.avatar ? (
                      <Image src={resolveMediaUrl(event.organizer.avatar)!} alt="" fill sizes="60px" className="object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-2xl font-semibold text-[#555]">{organizerName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <p className="text-[28px] lg:text-[35px]">{organizerName}</p>
                </div>
              </section>
            )}

            {/* Venue */}
            <section className="mt-12 border-t border-black pt-12 lg:-mx-[30px] lg:mt-24 lg:px-[30px]">
              <p className="text-[19px] lg:text-[23px]">Salle</p>
              <p className="mt-4 text-[28px] lg:mt-6 lg:text-[37px]">{event.venue}</p>
              <p className="mt-4 text-lg leading-snug lg:text-[21px]">
                {[event.address, event.city, event.country].filter(Boolean).join(', ')}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#707070] px-7 text-lg font-bold uppercase text-white transition-opacity hover:opacity-85"
              >
                <MapIcon className="h-8 w-8" strokeWidth={1.5} /> Ouvrir dans Maps
              </a>
            </section>

            {/* App */}
            <section className="mt-12 border-t border-black pt-12 lg:-mx-[30px] lg:px-[30px]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-normal tracking-normal text-[26px] lg:text-[37px]">Télécharge l&apos;appli ZAYA</h2>
                <ZayaLogo className="hidden text-[34px] sm:inline-flex" />
              </div>
              <p className="mt-8 max-w-[470px] text-lg leading-snug lg:mt-12 lg:text-[23px]">
                Plonge dans l&apos;extraordinaire avec Zaya, la plateforme qui transforme chaque événement en une aventure
                mémorable ! Prépare-toi à vivre une expérience où chaque détail est pensé pour t&apos;émerveiller.
              </p>
              <StoreButtons tone="grey" className="mt-12" />
            </section>
          </div>
        </div>
      </div>

      {/* Phones: the buy button stays at hand */}
      {canBuy && !checkout && (
        <div className="sticky bottom-0 z-30 border-t border-[#eee] bg-white/95 px-6 py-3 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setCheckout('tickets')}
            className="h-12 w-full rounded-full bg-black text-lg font-bold uppercase text-white">
            Acheter · {fromPriceLabel(event).replace('À partir de ', 'dès ')}
          </button>
        </div>
      )}

      {checkout && (
        <Checkout
          event={event}
          catalog={catalog}
          cart={cart}
          onCartChange={setCart}
          shopOnly={checkout === 'shop'}
          onClose={() => setCheckout(false)}
          onDone={() => setCart({})}
        />
      )}
    </>
  );
}
