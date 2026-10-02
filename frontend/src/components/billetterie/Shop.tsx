'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, ShoppingBag, Package, Check } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShopVariant { id: string; size: string | null; color: string | null; available: number }
export interface ShopProduct {
  id: string; name: string; description: string | null; imageUrl: string | null;
  price: number; currency: string; variants: ShopVariant[];
}
export interface ShopCatalog {
  products: ShopProduct[];
  delivery: { fee: number } | null;
  pickupInfo: string | null;
}
/** variantId → quantity */
export type Cart = Record<string, number>;

export interface CartLine { product: ShopProduct; variant: ShopVariant; quantity: number }

export const money = (n: number, currency: string) =>
  `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${currency}`;

export const variantLabel = (v: { size: string | null; color: string | null }) =>
  [v.size, v.color].filter(Boolean).join(' · ');

export function cartLines(catalog: ShopCatalog | undefined, cart: Cart): CartLine[] {
  if (!catalog) return [];
  const lines: CartLine[] = [];
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      const quantity = cart[variant.id] ?? 0;
      if (quantity > 0) lines.push({ product, variant, quantity });
    }
  }
  return lines;
}

export function setCartQty(cart: Cart, variant: ShopVariant, quantity: number): Cart {
  const next = { ...cart };
  const q = Math.max(0, Math.min(quantity, variant.available, 20));
  if (q === 0) delete next[variant.id];
  else next[variant.id] = q;
  return next;
}

function Stepper({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const btn = 'w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30';
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label="Retirer"><Minus className="h-3 w-3" /></button>
      <span className="w-5 text-center text-sm font-bold text-gray-900 dark:text-white">{value}</span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Ajouter"><Plus className="h-3 w-3" /></button>
    </div>
  );
}

// ─── Product card (size / color picker) ───────────────────────────────────────

export function ProductCard({
  product, cart, onCartChange, compact = false,
}: {
  product: ShopProduct;
  cart: Cart;
  onCartChange: (cart: Cart) => void;
  compact?: boolean;
}) {
  const unique = (values: (string | null)[]) => values.filter((v, i, all): v is string => !!v && all.indexOf(v) === i);
  const sizes = useMemo(() => unique(product.variants.map((v) => v.size)), [product]);
  const colors = useMemo(() => unique(product.variants.map((v) => v.color)), [product]);
  const firstAvailable = product.variants.find((v) => v.available > 0) ?? product.variants[0];
  const [size, setSize] = useState<string | null>(firstAvailable?.size ?? null);
  const [color, setColor] = useState<string | null>(firstAvailable?.color ?? null);

  const variant = product.variants.find((v) => v.size === size && v.color === color)
    ?? product.variants.find((v) => (sizes.length ? v.size === size : true) && (colors.length ? v.color === color : true));
  const soldOut = product.variants.every((v) => v.available === 0);
  const inCart = variant ? cart[variant.id] ?? 0 : 0;

  const chip = (active: boolean, disabled: boolean) => cn(
    'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
    active ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300',
    disabled && !active && 'opacity-40 line-through',
  );
  const optionAvailable = (s: string | null, c: string | null) =>
    product.variants.some((v) => (s === null || v.size === s) && (c === null || v.color === c) && v.available > 0);

  return (
    <div className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900', compact ? 'flex gap-3 p-3' : 'flex flex-col')}>
      <div className={cn('flex-shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-800', compact ? 'h-16 w-16 rounded-lg' : 'aspect-[4/3] w-full')}>
        {product.imageUrl
          ? <img src={resolveMediaUrl(product.imageUrl)} alt={product.name} className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center"><Package className="h-8 w-8 text-gray-300" /></div>}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2', !compact && 'p-4')}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{product.name}</p>
          <p className="whitespace-nowrap text-sm font-bold text-black dark:text-white">{money(product.price, product.currency)}</p>
        </div>
        {!compact && product.description && <p className="text-xs text-gray-500">{product.description}</p>}

        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Taille">
            {sizes.map((s) => (
              <button key={s} type="button" className={chip(size === s, !optionAvailable(s, colors.length ? color : null))} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
        )}
        {colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Couleur">
            {colors.map((c) => (
              <button key={c} type="button" className={chip(color === c, !optionAvailable(sizes.length ? size : null, c))} onClick={() => setColor(c)}>{c}</button>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          {soldOut ? (
            <span className="text-xs font-medium text-red-500">Épuisé</span>
          ) : !variant || variant.available === 0 ? (
            <span className="text-xs text-red-500">Indisponible dans ce choix</span>
          ) : inCart > 0 ? (
            <>
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" /> Dans le panier</span>
              <Stepper value={inCart} max={Math.min(variant.available, 20)} onChange={(q) => onCartChange(setCartQty(cart, variant, q))} />
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">{variant.available < 5 ? `Plus que ${variant.available}` : ''}</span>
              <button
                type="button"
                onClick={() => onCartChange(setCartQty(cart, variant, 1))}
                className="inline-flex items-center gap-1.5 rounded-full bg-black px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-85"
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cart summary (inside the checkout) ───────────────────────────────────────

export function CartSummary({ lines, cart, onCartChange }: { lines: CartLine[]; cart: Cart; onCartChange: (cart: Cart) => void }) {
  return (
    <ul className="space-y-2">
      {lines.map(({ product, variant, quantity }) => (
        <li key={variant.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
          <ShoppingBag className="h-4 w-4 flex-shrink-0 text-black" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{product.name}</p>
            <p className="text-xs text-gray-500">
              {[variantLabel(variant), money(product.price, product.currency)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Stepper value={quantity} max={Math.min(variant.available, 20)} onChange={(q) => onCartChange(setCartQty(cart, variant, q))} />
        </li>
      ))}
    </ul>
  );
}
