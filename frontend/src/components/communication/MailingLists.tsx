'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileUp, Loader2, Pencil, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react';
import { communicationApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Origin = 'PURCHASE' | 'INVITATION' | 'ISSUED' | 'IMPORTED';

export interface Contact {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  events: { id: string; name: string }[];
  categories: string[];
  origins: Origin[];
  unsubscribed?: boolean;
}

interface ImportRow { email: string; firstName: string; lastName: string; phone: string | null }
interface ListMember extends ImportRow { imported: boolean; unsubscribed: boolean }

export interface MailingList {
  id: string;
  name: string;
  memberCount: number;
  updatedAt: string;
}

const ORIGIN_LABELS: Record<Origin, string> = {
  PURCHASE: 'Achat / inscription',
  INVITATION: 'Invitation',
  ISSUED: 'Billet émis',
  IMPORTED: 'Importé',
};

const unwrap = (r: any) => r.data?.data ?? r.data;
const errorText = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m[0] : m || fallback;
};
// Rows drawn at once: selection still applies to everyone the filters keep
const SHOWN = 300;

export function useMailingLists() {
  return useQuery<MailingList[]>({
    queryKey: ['mailing-lists'],
    queryFn: () => communicationApi.getLists().then(unwrap),
  });
}

/** The "Listes" tab: the organizer's mailing lists, made from people already in their events */
export function MailingListsTab() {
  const queryClient = useQueryClient();
  const { data: lists = [], isLoading } = useMailingLists();
  const [editing, setEditing] = useState<MailingList | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => communicationApi.deleteList(id),
    onSuccess: () => { toast.success('Liste supprimée'); queryClient.invalidateQueries({ queryKey: ['mailing-lists'] }); },
    onError: (e) => toast.error(errorText(e, 'Suppression impossible')),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900 dark:text-white">
          Listes de diffusion <span className="text-gray-400 font-normal text-sm ml-1">({lists.length})</span>
        </h2>
        <button onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" />
          Nouvelle liste
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Une liste regroupe des personnes de vos événements (acheteurs, inscrits, invités) et celles que vous importez (fichier Excel / CSV ou adresses collées). Elle sert pour toutes vos campagnes, quel que soit l’événement. Chaque e-mail contient un lien « Se désinscrire » : ceux qui l’utilisent ne reçoivent plus vos campagnes.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
      ) : lists.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 py-12 text-center">
          <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Aucune liste</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Sans liste, une campagne part à tous les participants de l’événement.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((l) => (
            <div key={l.id} className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 py-3 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"><Users className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{l.name}</p>
                <p className="text-xs text-gray-400">
                  {l.memberCount} personne{l.memberCount > 1 ? 's' : ''} · modifiée le {new Date(l.updatedAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <button onClick={() => setEditing(l)} title="Modifier"
                className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => { if (confirm(`Supprimer la liste « ${l.name} » ?`)) remove.mutate(l.id); }} title="Supprimer"
                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ListEditorModal
          list={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ['mailing-lists'] }); setEditing(null); }}
        />
      )}
    </div>
  );
}

/** Name the list and tick its people among the contacts, with filters to find them */
function ListEditorModal({ list, onClose, onSaved }: { list: MailingList | null; onClose: () => void; onSaved: () => void }) {
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['comm-contacts'],
    queryFn: () => communicationApi.getContacts().then(unwrap),
    staleTime: 30_000,
  });
  const { data: current } = useQuery<{ name: string; members: ListMember[] }>({
    queryKey: ['mailing-list', list?.id],
    queryFn: () => communicationApi.getList(list!.id).then(unwrap),
    enabled: !!list,
  });

  const [name, setName] = useState(list?.name ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [eventId, setEventId] = useState('');
  const [origin, setOrigin] = useState<Origin | ''>('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [saving, setSaving] = useState(false);
  // Read from a file or a pasted list, saved with the list
  const [pending, setPending] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  // An existing list starts from its members
  useEffect(() => {
    if (current) setSelected(new Set(current.members.map((m) => m.email)));
  }, [current]);

  const events = useMemo(() => {
    const byId = new Map<string, string>();
    contacts.forEach((c) => c.events.forEach((e) => byId.set(e.id, e.name)));
    return Array.from(byId).map(([id, n]) => ({ id, name: n })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [contacts]);

  // Contacts, then the list's imported members, then what was just read
  const rows = useMemo(() => {
    const byEmail = new Map(contacts.map((c) => [c.email, c] as [string, Contact]));
    const asContact = (r: ImportRow, unsubscribed = false): Contact =>
      ({ ...r, events: [], categories: [], origins: ['IMPORTED'], unsubscribed });
    current?.members.forEach((m) => { if (!byEmail.has(m.email)) byEmail.set(m.email, asContact(m, m.unsubscribed)); });
    pending.forEach((r) => { if (!byEmail.has(r.email)) byEmail.set(r.email, asContact(r)); });
    return Array.from(byEmail.values());
  }, [contacts, current, pending]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) =>
      (!eventId || c.events.some((e) => e.id === eventId))
      && (!origin || c.origins.includes(origin))
      && (!onlySelected || selected.has(c.email))
      && (!q || `${c.firstName} ${c.lastName} ${c.email} ${c.phone ?? ''} ${c.categories.join(' ')}`.toLowerCase().includes(q)));
  }, [rows, query, eventId, origin, onlySelected, selected]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.email));
  const toggle = (email: string) => setSelected((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  const toggleFiltered = () => setSelected((s) => {
    const n = new Set(s);
    filtered.forEach((c) => (allFilteredSelected ? n.delete(c.email) : n.add(c.email)));
    return n;
  });

  const save = async () => {
    if (!name.trim()) { toast.error('Donnez un nom à la liste'); return; }
    if (selected.size === 0) { toast.error('Cochez au moins une personne'); return; }
    setSaving(true);
    try {
      const known = new Set(contacts.map((c) => c.email));
      const before = new Set(current?.members.map((m) => m.email) ?? []);
      // Ticked people read from the import: added with the consent given when reading them
      const imports = pending.filter((r) => selected.has(r.email) && !known.has(r.email) && !before.has(r.email));
      const fromContacts = Array.from(selected).filter((e) => known.has(e) && !before.has(e));
      let id = list?.id;
      if (!id) {
        id = (unwrap(await communicationApi.createList({ name: name.trim(), emails: fromContacts })) as { id: string }).id;
      } else {
        const removed = Array.from(before).filter((e) => !selected.has(e));
        if (name.trim() !== list!.name) await communicationApi.renameList(id, name.trim());
        if (fromContacts.length) await communicationApi.addListMembers(id, fromContacts);
        if (removed.length) await communicationApi.removeListMembers(id, removed);
      }
      if (imports.length) {
        const res = unwrap(await communicationApi.importListMembers(id, imports, true)) as { added: number; unsubscribed: number };
        if (res.unsubscribed) toast(`${res.unsubscribed} adresse(s) écartée(s) : ces personnes se sont désinscrites de vos e-mails.`);
      }
      toast.success(list ? 'Liste enregistrée' : 'Liste créée');
      onSaved();
    } catch (e) {
      toast.error(errorText(e, 'Enregistrement impossible'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-white">{list ? 'Modifier la liste' : 'Nouvelle liste de diffusion'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-6 pt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la liste *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex : Invités VIP, Acheteurs 2026…" className={cn(field, 'w-full')} />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, e-mail, téléphone, catégorie…" className={cn(field, 'w-full pl-9')} />
            </div>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={cn(field, 'sm:max-w-[220px]')}>
              <option value="">Tous les événements</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select value={origin} onChange={(e) => setOrigin(e.target.value as Origin | '')} className={field}>
              <option value="">Toutes les origines</option>
              {(Object.keys(ORIGIN_LABELS) as Origin[]).map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}
            </select>
          </div>
          {importing
            ? <ImportPanel onClose={() => setImporting(false)} onRead={(read) => {
                setPending((p) => [...p, ...read]);
                setSelected((s) => { const n = new Set(s); read.forEach((r) => n.add(r.email)); return n; });
                setOrigin('');
                setImporting(false);
              }} />
            : (
              <button type="button" onClick={() => setImporting(true)} className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                <Upload className="h-4 w-4" />
                Importer des adresses (Excel, CSV ou liste collée)
              </button>
            )}
          {pending.length > 0 && (
            <p className="text-xs text-gray-500">{pending.length} adresse(s) importée(s), ajoutées à la liste à l’enregistrement.</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button type="button" onClick={toggleFiltered} disabled={filtered.length === 0}
              className="text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
              {allFilteredSelected ? `Décocher ces ${filtered.length}` : `Tout cocher (${filtered.length})`}
            </button>
            <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} className="accent-indigo-600" />
              Voir seulement les personnes cochées
            </label>
            <span className="ml-auto font-medium text-gray-900 dark:text-white">{selected.size} personne{selected.size > 1 ? 's' : ''} dans la liste</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 mt-2">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">Aucun contact pour l’instant : les personnes apparaissent ici dès qu’elles ont un billet ou une invitation avec une adresse e-mail, ou quand vous les importez.</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">Personne ne correspond à ces filtres.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900 text-left text-xs text-gray-500">
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="w-8 py-2" />
                  <th className="py-2 font-medium">Nom</th>
                  <th className="py-2 font-medium">E-mail</th>
                  <th className="py-2 font-medium hidden md:table-cell">Événements</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, SHOWN).map((c) => (
                  <tr key={c.email} onClick={() => toggle(c.email)}
                    className="border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2"><input type="checkbox" readOnly checked={selected.has(c.email)} className="accent-indigo-600 pointer-events-none" /></td>
                    <td className="py-2 pr-3 text-gray-900 dark:text-white">{`${c.firstName} ${c.lastName}`.trim()}</td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 break-all">
                      {c.email}
                      {c.unsubscribed && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-600 dark:bg-red-900/30 dark:text-red-400" title="Ne recevra pas vos campagnes">désinscrit</span>}
                    </td>
                    <td className="py-2 text-xs text-gray-500 hidden md:table-cell">{c.events.length ? c.events.map((e) => e.name).join(', ') : 'Importé'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filtered.length > SHOWN && (
            <p className="py-3 text-center text-xs text-gray-500">
              {SHOWN} premières personnes affichées sur {filtered.length}. « Tout cocher » s’applique aux {filtered.length} ; affinez la recherche pour en voir d’autres.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Annuler</button>
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {list ? 'Enregistrer' : 'Créer la liste'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * File or pasted addresses, read by the server and shown in the table before anything is saved.
 * The organizer must certify these people agreed to receive their e-mails.
 */
function ImportPanel({ onRead, onClose }: { onRead: (rows: ImportRow[]) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const read = async () => {
    if (!consent) { toast.error('Cochez la case de consentement'); return; }
    if (!file && !text.trim()) { toast.error('Choisissez un fichier ou collez des adresses'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file); else fd.append('text', text);
      const res = unwrap(await communicationApi.parseListImport(fd)) as { rows: ImportRow[]; invalid: number; duplicates: number };
      const notes = [res.invalid && `${res.invalid} ligne(s) sans adresse valide`, res.duplicates && `${res.duplicates} doublon(s)`].filter(Boolean).join(', ');
      toast.success(`${res.rows.length} adresse(s) lue(s)${notes ? ` — ignorées : ${notes}` : ''}`);
      onRead(res.rows);
    } catch (e) {
      toast.error(errorText(e, 'Lecture impossible'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Importer des adresses</p>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fermer"><X className="h-4 w-4" /></button>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <FileUp className="h-4 w-4 text-indigo-600" />
        <span className="text-indigo-600 dark:text-indigo-400 hover:underline">{file ? file.name : 'Choisir un fichier .xlsx ou .csv'}</span>
        <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setText(''); }} />
        {file && <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-xs text-gray-400">retirer</button>}
      </label>
      <p className="text-xs text-gray-500">Colonnes reconnues : Email (obligatoire), Nom ou Prénom + Nom, Téléphone. Ou collez une adresse par ligne :</p>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setFile(null); }} rows={4} disabled={!!file}
        placeholder={'marie@exemple.com\nJean Kabila <jean@exemple.com>\npaul@exemple.com; Paul Mbuyi; +243 81 000 0000'}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50" />
      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-indigo-600" />
        <span>Je certifie que ces personnes ont accepté de recevoir mes e-mails. Les adresses achetées ou récupérées sans accord sont interdites : elles font classer les envois comme spam.</span>
      </label>
      <div className="flex justify-end">
        <button type="button" onClick={read} disabled={busy}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-full text-sm font-medium disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Lire les adresses
        </button>
      </div>
    </div>
  );
}
