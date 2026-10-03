'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'list';

/** Icons or list, remembered on this browser under `storageKey` */
export function useViewMode(storageKey: string): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>('grid');
  useEffect(() => {
    try { if (localStorage.getItem(storageKey) === 'list') setView('list'); } catch { /* storage blocked */ }
  }, [storageKey]);
  const choose = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem(storageKey, v); } catch { /* storage blocked */ }
  };
  return [view, choose];
}

/** "Icônes / Liste" pill switch */
export function ViewToggle({ value, onChange, className }: { value: ViewMode; onChange: (v: ViewMode) => void; className?: string }) {
  return (
    <div className={cn('flex rounded-full border border-gray-200 p-1 dark:border-gray-700', className)} role="group" aria-label="Affichage">
      {([['grid', LayoutGrid, 'Icônes'], ['list', List, 'Liste']] as const).map(([v, Icon, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          title={label}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors',
            value === v ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-500 hover:text-black dark:hover:text-white',
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
