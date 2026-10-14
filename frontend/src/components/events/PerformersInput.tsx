'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX = 20;

/** "Fally Ipupa, Ferre Gola" ⇄ ['Fally Ipupa', 'Ferre Gola'] (the form keeps the text form) */
export const splitNames = (value?: string) => (value ?? '').split(',').map(n => n.trim()).filter(Boolean);

/**
 * Artists / speakers of an event: type a name, press Enter (or a comma, or « Ajouter »), and it
 * becomes a chip that can be removed. A pasted list « A, B, C » adds every name.
 */
export function PerformersInput({ value, onChange, inputClass }: {
  value?: string;
  onChange: (value: string) => void;
  inputClass: string;
}) {
  const names = splitNames(value);
  const [draft, setDraft] = useState('');

  const add = (text: string) => {
    const known = new Set(names.map(n => n.toLowerCase()));
    const added = splitNames(text).filter(n => !known.has(n.toLowerCase()) && known.add(n.toLowerCase()));
    if (added.length) onChange([...names, ...added].slice(0, MAX).join(', '));
    setDraft('');
  };
  const remove = (i: number) => onChange(names.filter((_, j) => j !== i).join(', '));
  const full = names.length >= MAX;

  return (
    <div className="space-y-2.5">
      {names.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Artistes ajoutés">
          {names.map((n, i) => (
            <li key={`${n}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-white dark:bg-white dark:text-gray-900">
              {n}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Retirer ${n}`}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/20 dark:hover:bg-gray-900/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => {
            // A comma closes the name being typed
            if (e.target.value.includes(',')) add(e.target.value);
            else setDraft(e.target.value);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(draft); }
            if (e.key === 'Backspace' && !draft && names.length) remove(names.length - 1);
          }}
          onBlur={() => { if (draft.trim()) add(draft); }}
          disabled={full}
          maxLength={100}
          placeholder={full ? `${MAX} noms au maximum` : names.length ? 'Ajouter un autre nom' : 'Ex. Fally Ipupa'}
          aria-label="Nom d'un artiste ou intervenant"
          className={cn(inputClass, 'flex-1')}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim() || full}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 transition-colors hover:border-gray-900 disabled:opacity-40 dark:border-gray-700 dark:text-gray-100"
        >
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>
    </div>
  );
}
