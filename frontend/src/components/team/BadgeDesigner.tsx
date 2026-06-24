'use client';

import { useState, useCallback } from 'react';
import { Monitor, Smartphone, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BadgeConfig {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  showPhoto: boolean;
  showZones: boolean;
  showQR: boolean;
  showValidity: boolean;
  layout: 'horizontal' | 'vertical';
}

interface Props {
  memberName: string;
  memberRole: string;
  memberDepartment?: string;
  photoPreview?: string | null;
  zones: string[];
  value: BadgeConfig;
  onChange: (cfg: BadgeConfig) => void;
}

// ─── Role defaults ────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  MANAGER: '#6366f1', STAFF: '#0ea5e9', VOLUNTEER: '#10b981',
  SECURITY: '#ef4444', PRESS: '#06b6d4', VIP: '#f59e0b',
  ARTIST: '#8b5cf6', SPONSOR: '#f97316',
};

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager', STAFF: 'Staff', VOLUNTEER: 'Bénévole',
  SECURITY: 'Sécurité', PRESS: 'Presse', VIP: 'VIP',
  ARTIST: 'Artiste', SPONSOR: 'Sponsor',
};

const ZONE_COLORS: Record<string, string> = {
  SCENE: '#6366f1', COULISSES: '#8b5cf6', VIP: '#f59e0b',
  PRESSE: '#06b6d4', ACCUEIL: '#10b981', TECHNIQUE: '#64748b',
  SECURITE: '#ef4444', ALL: '#1a1a2e',
};

export function defaultBadgeConfig(role: string): BadgeConfig {
  return {
    primaryColor: ROLE_COLORS[role] ?? '#6366f1',
    backgroundColor: '#1a1a2e',
    textColor: '#ffffff',
    accentColor: '#94a3b8',
    showPhoto: true,
    showZones: true,
    showQR: true,
    showValidity: true,
    layout: 'horizontal',
  };
}

// ─── Badge Preview CSS ────────────────────────────────────────────────────────

function HorizontalPreview({ cfg, name, role, dept, photo, zones }: {
  cfg: BadgeConfig; name: string; role: string; dept?: string;
  photo?: string | null; zones: string[];
}) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return (
    <div
      className="relative overflow-hidden rounded-lg shadow-xl"
      style={{ width: 320, height: 200, backgroundColor: cfg.backgroundColor }}
    >
      {/* Left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-2" style={{ backgroundColor: cfg.primaryColor }} />
      {/* Top stripe */}
      <div className="absolute top-0 left-0 right-0 h-7 flex items-center justify-center"
        style={{ backgroundColor: cfg.primaryColor }}>
        <span className="text-white text-xs font-bold tracking-widest uppercase">{roleLabel}</span>
      </div>
      {/* Content area */}
      <div className="absolute top-7 left-4 right-0 bottom-0 flex gap-3 pt-2.5">
        {/* Photo */}
        {cfg.showPhoto && (
          <div className="flex-shrink-0">
            {photo ? (
              <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover border-2"
                style={{ borderColor: cfg.primaryColor }} />
            ) : (
              <div className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ backgroundColor: cfg.primaryColor + '33', color: cfg.primaryColor, border: `2px solid ${cfg.primaryColor}` }}>
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        )}
        {/* Text */}
        <div className="flex-1 min-w-0 pr-16">
          <p className="text-[10px] mb-0.5 truncate" style={{ color: cfg.accentColor }}>Événement</p>
          <p className="font-bold text-base leading-tight truncate" style={{ color: cfg.textColor }}>{name}</p>
          {dept && <p className="text-[10px] mt-0.5" style={{ color: cfg.accentColor }}>{dept}</p>}
        </div>
        {/* QR placeholder */}
        {cfg.showQR && (
          <div className="absolute right-3 top-2 h-16 w-16 rounded bg-white/10 flex items-center justify-center">
            <div className="grid grid-cols-3 gap-0.5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-4 w-4 rounded-sm"
                  style={{ backgroundColor: Math.random() > 0.5 ? cfg.primaryColor : 'transparent' }} />
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Zones */}
      {cfg.showZones && zones.length > 0 && (
        <div className="absolute bottom-7 left-4 flex gap-1 flex-wrap">
          {zones.slice(0, 5).map((z) => (
            <span key={z} className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
              style={{ backgroundColor: ZONE_COLORS[z] ?? '#64748b' }}>
              {z}
            </span>
          ))}
        </div>
      )}
      {/* Code */}
      <div className="absolute bottom-1 left-0 right-0 text-center text-[9px]"
        style={{ color: cfg.accentColor }}>
        ACC-XXXX-XXXX
      </div>
    </div>
  );
}

function VerticalPreview({ cfg, name, role, dept, photo, zones }: {
  cfg: BadgeConfig; name: string; role: string; dept?: string;
  photo?: string | null; zones: string[];
}) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return (
    <div
      className="relative overflow-hidden rounded-xl shadow-xl"
      style={{ width: 200, height: 320, backgroundColor: cfg.backgroundColor }}
    >
      {/* Top band */}
      <div className="absolute top-0 left-0 right-0 h-16 flex flex-col items-center justify-end pb-2"
        style={{ backgroundColor: cfg.primaryColor }}>
        {/* Lanyard hole */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 border-white/60"
          style={{ backgroundColor: cfg.backgroundColor }} />
        <span className="text-white text-xs font-bold tracking-widest uppercase">{roleLabel}</span>
      </div>
      {/* Photo */}
      <div className="absolute top-12 left-0 right-0 flex justify-center">
        {cfg.showPhoto && photo ? (
          <img src={photo} alt="" className="h-20 w-20 rounded-full object-cover border-4"
            style={{ borderColor: cfg.primaryColor }} />
        ) : (
          <div className="h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ backgroundColor: cfg.primaryColor + '33', color: cfg.primaryColor, border: `4px solid ${cfg.primaryColor}` }}>
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      {/* Text */}
      <div className="absolute top-36 left-0 right-0 text-center px-3">
        <p className="text-[9px] mb-0.5 truncate" style={{ color: cfg.accentColor }}>Événement</p>
        <p className="font-bold text-sm leading-tight" style={{ color: cfg.textColor }}>{name}</p>
        {dept && <p className="text-[9px] mt-1" style={{ color: cfg.accentColor }}>{dept}</p>}
      </div>
      {/* Zones */}
      {cfg.showZones && zones.length > 0 && (
        <div className="absolute bottom-20 left-2 right-2 flex flex-wrap justify-center gap-1">
          {zones.slice(0, 4).map((z) => (
            <span key={z} className="rounded-full px-1.5 py-0.5 text-[8px] font-bold text-white"
              style={{ backgroundColor: ZONE_COLORS[z] ?? '#64748b' }}>
              {z}
            </span>
          ))}
        </div>
      )}
      {/* QR placeholder */}
      {cfg.showQR && (
        <div className="absolute bottom-9 left-1/2 -translate-x-1/2 h-12 w-12 bg-white/10 rounded flex items-center justify-center">
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: Math.random() > 0.5 ? cfg.primaryColor : 'transparent' }} />
            ))}
          </div>
        </div>
      )}
      {/* Code */}
      <div className="absolute bottom-1 left-0 right-0 text-center text-[8px]"
        style={{ color: cfg.accentColor }}>
        ACC-XXXX-XXXX
      </div>
    </div>
  );
}

// ─── Control helpers ──────────────────────────────────────────────────────────

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-gray-600 flex-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-gray-200 p-0.5" />
        <span className="font-mono text-xs text-gray-500 w-16">{value}</span>
      </div>
    </div>
  );
}

function Toggle({ label, icon: Icon, checked, onChange }: {
  label: string; icon: React.ElementType; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all border',
        checked
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 bg-gray-50 text-gray-400',
      )}>
      {checked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BadgeDesigner({ memberName, memberRole, memberDepartment, photoPreview, zones, value, onChange }: Props) {
  const update = useCallback(<K extends keyof BadgeConfig>(key: K, val: BadgeConfig[K]) => {
    onChange({ ...value, [key]: val });
  }, [value, onChange]);

  const reset = () => onChange(defaultBadgeConfig(memberRole));

  return (
    <div className="flex gap-6">
      {/* Controls */}
      <div className="w-56 flex-shrink-0 space-y-4">

        {/* Layout */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format</p>
          <div className="grid grid-cols-2 gap-2">
            {(['horizontal', 'vertical'] as const).map((l) => (
              <button key={l} type="button" onClick={() => update('layout', l)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-medium border transition-all',
                  value.layout === l
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100',
                )}>
                {l === 'horizontal'
                  ? <Monitor className="h-5 w-5" />
                  : <Smartphone className="h-5 w-5" />}
                {l === 'horizontal' ? 'Horizontal' : 'Vertical'}
              </button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Couleurs</p>
          <div className="space-y-2.5">
            <ColorPicker label="Couleur principale" value={value.primaryColor} onChange={(v) => update('primaryColor', v)} />
            <ColorPicker label="Arrière-plan" value={value.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
            <ColorPicker label="Texte principal" value={value.textColor} onChange={(v) => update('textColor', v)} />
            <ColorPicker label="Texte secondaire" value={value.accentColor} onChange={(v) => update('accentColor', v)} />
          </div>
        </div>

        {/* Elements */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Éléments</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Toggle label="Photo" icon={Eye} checked={value.showPhoto} onChange={(v) => update('showPhoto', v)} />
            <Toggle label="Zones" icon={Eye} checked={value.showZones} onChange={(v) => update('showZones', v)} />
            <Toggle label="QR code" icon={Eye} checked={value.showQR} onChange={(v) => update('showQR', v)} />
            <Toggle label="Validité" icon={Eye} checked={value.showValidity} onChange={(v) => update('showValidity', v)} />
          </div>
        </div>

        {/* Reset */}
        <button type="button" onClick={reset}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <RotateCcw className="h-3 w-3" /> Réinitialiser
        </button>
      </div>

      {/* Live preview */}
      <div className="flex-1 flex items-center justify-center rounded-xl bg-gray-100 p-6 min-h-[280px]">
        {value.layout === 'horizontal' ? (
          <HorizontalPreview cfg={value} name={memberName} role={memberRole} dept={memberDepartment} photo={photoPreview} zones={zones} />
        ) : (
          <VerticalPreview cfg={value} name={memberName} role={memberRole} dept={memberDepartment} photo={photoPreview} zones={zones} />
        )}
      </div>
    </div>
  );
}
