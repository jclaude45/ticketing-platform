'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PreviewGuest {
  row?: number;
  name: string;
  email: string;
  phone: string;
  /** What stops this line from being invited, if anything */
  issue: string | null;
}

/** Rows drawn at once: selection still applies to all the lines the search keeps */
const SHOWN = 300;

/** The lines that can be ticked: no problem, not invited yet */
export const invitableLines = (guests: PreviewGuest[], invited: Set<number>, selected: Set<number>) =>
  Array.from(selected).filter((i) => guests[i] && !guests[i].issue && !invited.has(i));

/**
 * People to pick from before anything is sent (an imported file, the organizer's contacts):
 * the organizer ticks whom to invite, or invites one with its own button. Lines with a problem
 * cannot be ticked. The page holds the selection and sends it.
 */
export function ImportPreview({ guests, invited, paper, canInvite, sending, selected, setSelected, onInvite, counted = 'ligne(s) lue(s)' }: {
  guests: PreviewGuest[];
  /** What the total counts: lines of a file, contacts */
  counted?: string;
  /** Lines (by index) invited during this session */
  invited: Set<number>;
  paper: boolean;
  /** A category with seats is chosen: one line can be invited by its own button */
  canInvite: boolean;
  sending: boolean;
  selected: Set<number>;
  setSelected: (update: (s: Set<number>) => Set<number>) => void;
  onInvite: (indexes: number[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);

  const invitable = (i: number) => !guests[i].issue && !invited.has(i);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.map((g, i) => ({ g, i })).filter(({ g, i }) =>
      (!onlyIssues || (!!g.issue && !invited.has(i)))
      && (!q || `${g.name} ${g.email} ${g.phone}`.toLowerCase().includes(q)));
  }, [guests, query, onlyIssues, invited]);

  const ready = guests.filter((_, i) => invitable(i)).length;
  const issues = guests.filter((g, i) => g.issue && !invited.has(i)).length;
  const filteredInvitable = filtered.filter(({ i }) => invitable(i));
  const allFiltered = filteredInvitable.length > 0 && filteredInvitable.every(({ i }) => selected.has(i));

  const toggle = (i: number) => setSelected((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleFiltered = () => setSelected((s) => {
    const n = new Set(s);
    filteredInvitable.forEach(({ i }) => (allFiltered ? n.delete(i) : n.add(i)));
    return n;
  });
  const invite = (i: number) => {
    onInvite([i]);
    setSelected((s) => { const n = new Set(s); n.delete(i); return n; });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-gray-900 dark:text-white">{guests.length} {counted}</span>
        <span className="flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 className="h-4 w-4" />{ready} prête(s) à inviter</span>
        {invited.size > 0 && <span className="text-gray-500">{invited.size} invitée(s)</span>}
        {issues > 0 && (
          <button type="button" onClick={() => setOnlyIssues((v) => !v)} className="flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline">
            <AlertTriangle className="h-4 w-4" />{issues} à vérifier{onlyIssues ? ' (voir tout)' : ''}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un nom, un e-mail, un numéro…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button type="button" onClick={toggleFiltered} disabled={filteredInvitable.length === 0}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
          {allFiltered ? `Tout décocher (${filteredInvitable.length})` : `Tout cocher (${filteredInvitable.length})`}
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-left text-xs text-gray-500">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-2 py-2 font-medium">Nom</th>
              <th className="px-2 py-2 font-medium">E-mail</th>
              <th className="px-2 py-2 font-medium hidden md:table-cell">Téléphone</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, SHOWN).map(({ g, i }) => {
              const done = invited.has(i);
              const ok = invitable(i);
              return (
                <tr key={i} onClick={() => ok && toggle(i)}
                  className={cn('border-t border-gray-100 dark:border-gray-800', ok ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50' : 'opacity-70')}>
                  <td className="px-3 py-2">
                    <input type="checkbox" readOnly disabled={!ok} checked={selected.has(i) && ok} className="accent-indigo-600 pointer-events-none" />
                  </td>
                  <td className="px-2 py-2 text-gray-900 dark:text-white">{g.name || <span className="text-gray-400">—</span>}</td>
                  <td className="px-2 py-2 text-gray-600 dark:text-gray-400 break-all">{g.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-2 py-2 text-gray-600 dark:text-gray-400 hidden md:table-cell">{g.phone || ''}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400"><CheckCircle2 className="h-3.5 w-3.5" />Invité(e)</span>
                    ) : g.issue ? (
                      <span className="rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">{g.issue}</span>
                    ) : (
                      <button type="button" disabled={sending || !canInvite}
                        onClick={(e) => { e.stopPropagation(); invite(i); }}
                        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
                        {paper ? 'Créer' : 'Inviter'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > SHOWN && (
          <p className="px-3 py-2 text-center text-xs text-gray-500">
            {SHOWN} premières lignes affichées sur {filtered.length}. « Tout cocher » s’applique aux {filtered.length} ; utilisez la recherche pour en voir d’autres.
          </p>
        )}
      </div>

    </div>
  );
}
