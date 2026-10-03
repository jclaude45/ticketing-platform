'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchOption {
  value: string;
  label: string;
  /** Small text on the left of the label (a flag, a code…) */
  prefix?: React.ReactNode;
  /** Group heading shown above the first option of the group */
  group?: string;
}

const MAX_SHOWN = 200;

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Drop-down list with a search field, for long lists (countries, cities). Keyboard:
 * ↑ ↓ to move, Enter to choose, Esc to close. `allowCustom` offers the typed text when
 * it is not in the list (a small town missing from the data).
 */
export function SearchSelect({
  options, value, onChange, placeholder = 'Sélectionner', searchPlaceholder = 'Rechercher…',
  disabled, loading, allowCustom, emptyText = 'Aucun résultat', className, id,
}: {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  allowCustom?: boolean;
  emptyText?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options.slice(0, MAX_SHOWN);
    // Names starting with the text first, then the ones containing it
    const starts: SearchOption[] = [];
    const contains: SearchOption[] = [];
    for (const o of options) {
      const l = normalize(o.label);
      if (l.startsWith(q)) starts.push(o);
      else if (l.includes(q)) contains.push(o);
      if (starts.length >= MAX_SHOWN) break;
    }
    return [...starts, ...contains].slice(0, MAX_SHOWN).map(o => ({ ...o, group: undefined }));
  }, [options, query]);

  const custom = allowCustom && query.trim() && !options.some(o => normalize(o.label) === normalize(query.trim()))
    ? query.trim()
    : null;
  const count = filtered.length + (custom ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => { setActive(0); }, [query, open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, count - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < filtered.length) choose(filtered[active].value);
      else if (custom) choose(custom);
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-[15px] transition-colors focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:focus:border-white dark:focus:ring-white"
      >
        {selected?.prefix}
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-gray-400')}>
          {selected?.label ?? (value || placeholder)}
        </span>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <ChevronDown className={cn('h-4 w-4 text-gray-500 transition-transform', open && 'rotate-180')} />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full border-0 bg-transparent py-2.5 text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-white"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.map((o, i) => (
              <li key={o.value}>
                {o.group && (i === 0 || filtered[i - 1].group !== o.group) && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.1em] text-gray-400">{o.group}</p>
                )}
                <button
                  type="button"
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 dark:text-gray-200',
                    i === active && 'bg-gray-100 dark:bg-gray-800',
                  )}
                >
                  {o.prefix}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 text-black dark:text-white" />}
                </button>
              </li>
            ))}
            {custom && (
              <li>
                <button
                  type="button"
                  data-index={filtered.length}
                  onMouseEnter={() => setActive(filtered.length)}
                  onClick={() => choose(custom)}
                  className={cn('w-full px-3 py-2 text-left text-sm text-gray-800 dark:text-gray-200', active === filtered.length && 'bg-gray-100 dark:bg-gray-800')}
                >
                  Utiliser « <strong>{custom}</strong> »
                </button>
              </li>
            )}
            {count === 0 && <li className="px-3 py-4 text-center text-sm text-gray-400">{emptyText}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
