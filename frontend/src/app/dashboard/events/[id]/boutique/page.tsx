'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ShoppingBag, Package, ClipboardList, Settings2, Plus, Trash2, Pencil, X, Loader2,
  ImagePlus, Truck, Store, AlertTriangle, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { eventsApi, shopApi, resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Variant { id?: string; size: string | null; color: string | null; stock: number; sold?: number }
interface Product {
  id: string; name: string; description: string | null; imageUrl: string | null;
  price: number; currency: string; isActive: boolean; variants: Variant[];
}
interface OrderItem { id: string; productName: string; size: string | null; color: string | null; quantity: number; unitPrice: number }
interface Order {
  id: string; code: string; buyerName: string; buyerEmail: string; buyerPhone: string | null;
  fulfillment: 'PICKUP' | 'DELIVERY'; deliveryAddress: string | null; deliveryCity: string | null; deliveryNotes: string | null;
  subtotal: number; deliveryFee: number; total: number; currency: string; status: string;
  createdAt: string; items: OrderItem[];
}
interface Settings { deliveryEnabled: boolean; deliveryFee: number; pickupInfo: string; currency: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Paiement en cours', cls: 'bg-gray-100 text-gray-600' },
  PAID: { label: 'Payée — à préparer', cls: 'bg-indigo-50 text-indigo-700' },
  READY: { label: 'Prête au retrait', cls: 'bg-amber-50 text-amber-700' },
  SHIPPED: { label: 'Expédiée', cls: 'bg-sky-50 text-sky-700' },
  DELIVERED: { label: 'Livrée', cls: 'bg-green-50 text-green-700' },
  PICKED_UP: { label: 'Remise', cls: 'bg-green-50 text-green-700' },
  CANCELLED: { label: 'Annulée', cls: 'bg-red-50 text-red-600' },
};

// Next steps offered to the organizer, by fulfillment
const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  'PICKUP:PAID': [{ status: 'READY', label: 'Marquer prête' }, { status: 'PICKED_UP', label: 'Marquer remise' }],
  'PICKUP:READY': [{ status: 'PICKED_UP', label: 'Marquer remise' }],
  'DELIVERY:PAID': [{ status: 'SHIPPED', label: 'Marquer expédiée' }],
  'DELIVERY:SHIPPED': [{ status: 'DELIVERED', label: 'Marquer livrée' }],
};

const money = (n: number, currency: string) =>
  `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${currency}`;
const unwrap = (res: any) => res?.data?.data ?? res?.data;
const errorMessage = (err: any, fallback: string) => {
  const msg = err?.response?.data?.message;
  return Array.isArray(msg) ? msg[0] : msg ?? fallback;
};
const variantLabel = (v: { size: string | null; color: string | null }) =>
  [v.size, v.color].filter(Boolean).join(' · ') || 'Taille unique';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BoutiquePage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<'products' | 'orders' | 'settings'>('products');

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => unwrap(await eventsApi.get(eventId)),
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <button
          onClick={() => router.push(`/dashboard/events/${eventId}`)}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à l&apos;événement
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
            <ShoppingBag className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Boutique</h1>
            {event?.name && <p className="text-sm text-gray-500">{event.name}</p>}
          </div>
        </div>
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {([
          { key: 'products', label: 'Articles', icon: Package },
          { key: 'orders', label: 'Commandes', icon: ClipboardList },
          { key: 'settings', label: 'Retrait & livraison', icon: Settings2 },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-900 dark:text-indigo-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
            )}
          >
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'products' && <ProductsTab eventId={eventId} />}
      {tab === 'orders' && <OrdersTab eventId={eventId} />}
      {tab === 'settings' && <SettingsTab eventId={eventId} />}
    </div>
  );
}

// ─── Products ─────────────────────────────────────────────────────────────────

function ProductsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['shop-products', eventId],
    queryFn: async () => unwrap(await shopApi.listProducts(eventId)) ?? [],
  });

  const remove = useMutation({
    mutationFn: async (productId: string) => unwrap(await shopApi.deleteProduct(eventId, productId)),
    onSuccess: (res: any) => {
      toast.success(res?.message ?? 'Article supprimé');
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['shop-products', eventId] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Erreur lors de la suppression')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          T-shirts, casquettes, souvenirs… proposés à l&apos;achat avec le billet ou séparément sur la page de vente.
        </p>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Ajouter un article
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-900 dark:text-white">Aucun article pour le moment</p>
          <p className="mt-1 text-sm text-gray-500">Ajoutez votre premier souvenir : il apparaîtra sur la page de vente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const stock = p.variants.reduce((s, v) => s + v.stock, 0);
            const sold = p.variants.reduce((s, v) => s + (v.sold ?? 0), 0);
            return (
              <div key={p.id} className={cn('overflow-hidden rounded-xl border bg-white dark:bg-gray-900', p.isActive ? 'border-gray-200 dark:border-gray-800' : 'border-dashed border-gray-300 opacity-70')}>
                <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800">
                  {p.imageUrl
                    ? <img src={resolveMediaUrl(p.imageUrl)} alt={p.name} className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center"><Package className="h-10 w-10 text-gray-300" /></div>}
                  {!p.isActive && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gray-900/80 px-2 py-0.5 text-xs text-white">
                      <EyeOff className="h-3 w-3" /> Masqué
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-white">{p.name}</p>
                    <p className="whitespace-nowrap font-semibold text-indigo-600">{money(p.price, p.currency)}</p>
                  </div>
                  <p className={cn('mt-1 text-xs', stock === 0 ? 'text-red-600' : stock < 5 ? 'text-amber-600' : 'text-gray-500')}>
                    {stock === 0 ? 'Épuisé' : `${stock} en stock`} · {sold} vendu{sold > 1 ? 's' : ''} · {p.variants.length} variante{p.variants.length > 1 ? 's' : ''}
                  </p>
                  <div className="mt-3 flex items-center justify-end gap-1">
                    {confirmDelete === p.id ? (
                      <>
                        <button onClick={() => remove.mutate(p.id)} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">
                          Supprimer
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Annuler">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing(p)} title="Modifier" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(p.id)} title="Supprimer" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ProductModal
          eventId={eventId}
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const QUICK_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

function ProductModal({ eventId, product, onClose }: { eventId: string; product: Product | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [variants, setVariants] = useState<Variant[]>(
    product?.variants.filter((v) => (v as any).position !== 999).map((v) => ({ id: v.id, size: v.size, color: v.color, stock: v.stock }))
      ?? [{ size: null, color: null, stock: 0 }],
  );
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(product?.imageUrl ? resolveMediaUrl(product.imageUrl) ?? null : null);

  const updateVariant = (i: number, patch: Partial<Variant>) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const addSizes = () => {
    const color = variants.find((v) => v.color)?.color ?? null;
    setVariants((vs) => {
      const existing = new Set(vs.map((v) => `${v.size}|${v.color}`));
      const added = QUICK_SIZES.filter((s) => !existing.has(`${s}|${color}`)).map((size) => ({ size, color, stock: 0 }));
      return [...vs.filter((v) => v.size || v.color || v.stock), ...added];
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        isActive,
        variants: variants.map((v) => ({
          ...(v.id && { id: v.id }),
          size: v.size?.trim() || undefined,
          color: v.color?.trim() || undefined,
          stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
        })),
      };
      const saved = unwrap(product
        ? await shopApi.updateProduct(eventId, product.id, body)
        : await shopApi.createProduct(eventId, body));
      if (image) await shopApi.uploadImage(eventId, saved.id, image);
      return saved;
    },
    onSuccess: () => {
      toast.success(product ? 'Article mis à jour' : 'Article ajouté à la boutique');
      queryClient.invalidateQueries({ queryKey: ['shop-products', eventId] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "Erreur lors de l'enregistrement")),
  });

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';
  const canSave = name.trim() && Number(price) > 0 && variants.length > 0 && !save.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{product ? "Modifier l'article" : 'Nouvel article'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <label className="flex aspect-square w-full flex-shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 sm:w-36 dark:border-gray-700">
              {preview
                ? <img src={preview} alt="" className="h-full w-full object-cover" />
                : <><ImagePlus className="mb-1 h-7 w-7" /><span className="text-xs">Photo</span></>}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) { toast.error('Image trop lourde (5 Mo max)'); return; }
                  setImage(f);
                  setPreview(URL.createObjectURL(f));
                }}
              />
            </label>
            <div className="flex-1 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nom *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="T-shirt officiel" className={input} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Prix * <span className="font-normal text-gray-400">(devise des billets)</span>
                </label>
                <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                En vente sur la page de l&apos;événement
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} className={cn(input, 'resize-none')} />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tailles, couleurs et stock</p>
              <button onClick={addSizes} type="button" className="text-xs font-medium text-indigo-600 hover:underline">
                + Ajouter S, M, L, XL, XXL
              </button>
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_90px_auto] items-center gap-2">
                  <input value={v.size ?? ''} onChange={(e) => updateVariant(i, { size: e.target.value })} placeholder="Taille (ex. M)" maxLength={20} className={input} />
                  <input value={v.color ?? ''} onChange={(e) => updateVariant(i, { color: e.target.value })} placeholder="Couleur (ex. Noir)" maxLength={30} className={input} />
                  <input type="number" min="0" value={v.stock} onChange={(e) => updateVariant(i, { stock: Number(e.target.value) })} className={input} aria-label="Stock" />
                  <button
                    type="button"
                    onClick={() => setVariants((vs) => (vs.length > 1 ? vs.filter((_, idx) => idx !== i) : vs))}
                    disabled={variants.length === 1}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label="Retirer la variante"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setVariants((vs) => [...vs, { size: null, color: null, stock: 0 }])}
                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
              >
                <Plus className="h-4 w-4" /> Ajouter une variante
              </button>
              <p className="text-xs text-gray-400">Laissez taille et couleur vides pour un article unique.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
            Annuler
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

const ORDER_FILTERS = [
  { value: 'TO_HANDLE', label: 'À traiter' },
  { value: '', label: 'Toutes' },
  { value: 'PICKED_UP', label: 'Remises' },
  { value: 'DELIVERED', label: 'Livrées' },
  { value: 'CANCELLED', label: 'Annulées' },
];

function OrdersTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('TO_HANDLE');
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['shop-orders', eventId, filter],
    queryFn: async () => unwrap(await shopApi.listOrders(eventId, filter || undefined)) ?? [],
  });

  const update = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => shopApi.updateOrder(eventId, orderId, status),
    onSuccess: (_res, vars) => {
      toast.success(vars.status === 'CANCELLED' ? 'Commande annulée, articles remis en stock' : 'Commande mise à jour');
      setConfirmCancel(null);
      queryClient.invalidateQueries({ queryKey: ['shop-orders', eventId] });
      queryClient.invalidateQueries({ queryKey: ['shop-products', eventId] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Erreur lors de la mise à jour')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {ORDER_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === f.value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          Aucune commande {filter === 'TO_HANDLE' ? 'à traiter' : 'pour ce filtre'}.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => {
            const actions = NEXT_ACTIONS[`${o.fulfillment}:${o.status}`] ?? [];
            const canCancel = ['PAID', 'READY', 'SHIPPED'].includes(o.status);
            const st = STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={o.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      <span className="font-mono">{o.code}</span> · {o.buyerName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {o.buyerEmail}{o.buyerPhone ? ` · ${o.buyerPhone}` : ''} · {new Date(o.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', st.cls)}>{st.label}</span>
                </div>

                <ul className="mt-3 space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {o.items.map((i) => (
                    <li key={i.id}>{i.quantity} × {i.productName} <span className="text-gray-400">({variantLabel(i)})</span></li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-start gap-1.5 text-xs text-gray-500">
                    {o.fulfillment === 'PICKUP'
                      ? <><Store className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> Retrait sur place</>
                      : <><Truck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> Livraison : {o.deliveryAddress}, {o.deliveryCity}{o.deliveryNotes ? ` — ${o.deliveryNotes}` : ''}</>}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{money(o.total, o.currency)}</p>
                </div>

                {(actions.length > 0 || canCancel) && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                    {canCancel && (confirmCancel === o.id ? (
                      <>
                        <span className="self-center text-xs text-gray-500">Le remboursement se fait en dehors de ZAYA.</span>
                        <button onClick={() => update.mutate({ orderId: o.id, status: 'CANCELLED' })} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                          Confirmer l&apos;annulation
                        </button>
                        <button onClick={() => setConfirmCancel(null)} className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100">Retour</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmCancel(o.id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                        Annuler
                      </button>
                    ))}
                    {confirmCancel !== o.id && actions.map((a) => (
                      <button
                        key={a.status}
                        onClick={() => update.mutate({ orderId: o.id, status: a.status })}
                        disabled={update.isPending}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['shop-settings', eventId],
    queryFn: async () => unwrap(await shopApi.getSettings(eventId)),
  });
  const [form, setForm] = useState<Settings | null>(null);
  const current = form ?? settings;

  const save = useMutation({
    mutationFn: async () => shopApi.updateSettings(eventId, {
      deliveryEnabled: current!.deliveryEnabled,
      deliveryFee: Number(current!.deliveryFee) || 0,
      pickupInfo: current!.pickupInfo,
    }),
    onSuccess: () => {
      toast.success('Réglages enregistrés');
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['shop-settings', eventId] });
    },
    onError: (err) => toast.error(errorMessage(err, "Erreur lors de l'enregistrement")),
  });

  if (isLoading || !current) {
    return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  }

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

  return (
    <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><Store className="h-4 w-4" /> Retrait sur place</p>
        <p className="mb-2 mt-1 text-xs text-gray-500">Toujours proposé. Indiquez où et quand les acheteurs récupèrent leurs articles (affiché sur la page et dans l&apos;email).</p>
        <input
          value={current.pickupInfo}
          maxLength={300}
          onChange={(e) => setForm({ ...current, pickupInfo: e.target.value })}
          placeholder="Ex. Stand boutique à l'entrée, dès 17h"
          className={input}
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <input
            type="checkbox"
            checked={current.deliveryEnabled}
            onChange={(e) => setForm({ ...current, deliveryEnabled: e.target.checked })}
            className="h-4 w-4 accent-indigo-600"
          />
          <Truck className="h-4 w-4" /> Proposer la livraison
        </label>
        {current.deliveryEnabled && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={current.deliveryFee}
              onChange={(e) => setForm({ ...current, deliveryFee: Number(e.target.value) })}
              className={cn(input, 'w-32')}
            />
            <span className="text-sm text-gray-500">{current.currency} de frais de livraison (0 = gratuite)</span>
          </div>
        )}
      </div>

      {current.deliveryEnabled && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          L&apos;expédition est à votre charge : suivez les commandes à livrer dans l&apos;onglet Commandes et marquez-les expédiées puis livrées.
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={!form || save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
