'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft, Users, Plus, Pencil, Trash2, BadgeCheck,
  BadgeX, Printer, RefreshCw, ShieldCheck, X, Check,
  Phone, Mail, Building2, Camera, Upload, FlipHorizontal, ZapOff,
  FileSpreadsheet, Download, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient, teamApi } from '@/lib/api';
import { printPDFBlob } from '@/lib/print';
import { BadgeDesigner, BadgeConfig, defaultBadgeConfig } from '@/components/team/BadgeDesigner';
import toast from 'react-hot-toast';

// ─── Camera Capture ───────────────────────────────────────────────────────────

function CameraCapture({ onCapture, onClose }: {
  onCapture: (file: File, preview: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingModeRef = useRef<'user' | 'environment'>('user');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    stopStream();
    setReady(false);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // play() returns a promise — await it so we know the video is actually playing
        await video.play().catch(() => {});
      }
    } catch (err: any) {
      const name = err?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Permission refusée. Autorisez la caméra dans les paramètres du navigateur.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('Aucune caméra détectée sur cet appareil.');
      } else {
        setError('Impossible d\'accéder à la caméra.');
      }
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera('user');
    return stopStream;
  }, [startCamera, stopStream]);

  const markReady = useCallback(() => {
    const video = videoRef.current;
    // Only mark ready when we actually have video dimensions
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      setReady(true);
    }
  }, []);

  const flipCamera = useCallback(() => {
    const next = facingModeRef.current === 'user' ? 'environment' : 'user';
    facingModeRef.current = next;
    setFacingMode(next);
    startCamera(next);
  }, [startCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    setCapturing(true);

    const OUT = 480;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;

    // Mirror horizontally for front camera so the result matches the preview
    if (facingModeRef.current === 'user') {
      ctx.translate(OUT, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, size, size, 0, 0, OUT, OUT);

    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) { toast.error('Erreur lors de la capture'); return; }
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        // Reset transform before calling toDataURL
        const preview = canvas.toDataURL('image/jpeg', 0.9);
        stopStream();
        onCapture(file, preview);
      },
      'image/jpeg',
      0.9,
    );
  }, [onCapture, stopStream]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-black shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
          <span className="text-sm font-medium text-white">Prendre une photo</span>
          <button onClick={() => { stopStream(); onClose(); }}
            className="rounded-lg p-1.5 text-gray-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewfinder */}
        <div className="relative aspect-square bg-black">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <ZapOff className="h-10 w-10 text-red-400" />
              <p className="text-sm text-gray-300">{error}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={markReady}
                onCanPlay={markReady}
                onPlaying={markReady}
                className="h-full w-full object-cover"
                style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              />
              {/* Spinner while loading */}
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                </div>
              )}
              {/* Guide circle */}
              {ready && (
                <div className="absolute inset-6 rounded-full border-2 border-white/40 pointer-events-none" />
              )}
            </>
          )}
        </div>

        {/* Canvas hors du viewfinder pour éviter les problèmes display:none */}
        <canvas ref={canvasRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} />

        {/* Controls */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-900">
          <button onClick={flipCamera} disabled={!!error}
            className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors disabled:opacity-30">
            <FlipHorizontal className="h-5 w-5" />
            <span className="text-[10px]">Retourner</span>
          </button>

          {/* Shutter */}
          <button
            onClick={capture}
            disabled={!ready || !!error || capturing}
            className="h-16 w-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center"
          >
            {capturing
              ? <div className="h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <div className="h-11 w-11 rounded-full bg-white" />}
          </button>

          <div className="w-12" />
        </div>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamMemberRole = 'MANAGER' | 'STAFF' | 'VOLUNTEER' | 'SECURITY' | 'PRESS' | 'VIP' | 'ARTIST' | 'SPONSOR';

interface Accreditation {
  id: string;
  code: string;
  zones: string[];
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  printedAt: string | null;
  badgeConfig: Partial<BadgeConfig> | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: TeamMemberRole;
  department: string | null;
  notes: string | null;
  photoUrl: string | null;
  accreditation: Accreditation | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES: { value: TeamMemberRole; label: string; color: string; bg: string }[] = [
  { value: 'MANAGER',   label: 'Manager',   color: 'text-indigo-700',  bg: 'bg-indigo-50 ring-1 ring-indigo-200' },
  { value: 'STAFF',     label: 'Staff',     color: 'text-sky-700',     bg: 'bg-sky-50 ring-1 ring-sky-200' },
  { value: 'VOLUNTEER', label: 'Bénévole',  color: 'text-emerald-700', bg: 'bg-emerald-50 ring-1 ring-emerald-200' },
  { value: 'SECURITY',  label: 'Sécurité',  color: 'text-red-700',     bg: 'bg-red-50 ring-1 ring-red-200' },
  { value: 'PRESS',     label: 'Presse',    color: 'text-cyan-700',    bg: 'bg-cyan-50 ring-1 ring-cyan-200' },
  { value: 'VIP',       label: 'VIP',       color: 'text-amber-700',   bg: 'bg-amber-50 ring-1 ring-amber-200' },
  { value: 'ARTIST',    label: 'Artiste',   color: 'text-purple-700',  bg: 'bg-purple-50 ring-1 ring-purple-200' },
  { value: 'SPONSOR',   label: 'Sponsor',   color: 'text-orange-700',  bg: 'bg-orange-50 ring-1 ring-orange-200' },
];

const ZONES = ['SCENE', 'COULISSES', 'VIP', 'PRESSE', 'ACCUEIL', 'TECHNIQUE', 'SECURITE', 'ALL'];
const ZONE_COLORS: Record<string, string> = {
  SCENE: 'bg-indigo-500', COULISSES: 'bg-purple-500', VIP: 'bg-amber-500',
  PRESSE: 'bg-cyan-500', ACCUEIL: 'bg-emerald-500', TECHNIQUE: 'bg-slate-500',
  SECURITE: 'bg-red-500', ALL: 'bg-gray-800',
};

const roleConfig = (role: TeamMemberRole) => ROLES.find((r) => r.value === role) ?? ROLES[1];

// ─── Member Modal ─────────────────────────────────────────────────────────────

function MemberModal({ eventId, member, onClose, onSaved }: {
  eventId: string;
  member?: TeamMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role: (member?.role ?? 'STAFF') as TeamMemberRole,
    department: member?.department ?? '',
    notes: member?.notes ?? '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(member?.photoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = async (file: File, preview: string) => {
    setPhotoFile(file);
    setPhotoPreview(preview);
    setShowCamera(false);

    // For existing members: upload immediately — no need to re-submit the whole form
    if (member) {
      setUploadingPhoto(true);
      try {
        await teamApi.uploadPhoto(eventId, member.id, file);
        toast.success('Photo enregistrée');
        onSaved(); // refresh the list so the avatar updates
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Erreur upload photo');
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        role: form.role,
        department: form.department || undefined,
        notes: form.notes || undefined,
      };

      if (member) {
        await teamApi.update(eventId, member.id, payload);
        toast.success('Membre mis à jour');
        // Photo already uploaded immediately after capture — nothing to do here
      } else {
        const res = await teamApi.create(eventId, payload);
        // TransformInterceptor wraps response: { success, statusCode, data: member, timestamp }
        const created = (res.data as any)?.data ?? res.data;
        const newMemberId: string | undefined = created?.id;
        toast.success('Membre ajouté');

        if (photoFile) {
          if (!newMemberId) {
            toast.error('Photo non uploadée : impossible d\'extraire l\'ID du nouveau membre');
          } else {
            setUploadingPhoto(true);
            try {
              await teamApi.uploadPhoto(eventId, newMemberId, photoFile);
              toast.success('Photo enregistrée');
            } catch (photoErr: any) {
              toast.error(photoErr?.response?.data?.message ?? 'Erreur upload photo');
            } finally {
              setUploadingPhoto(false);
            }
          }
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {member ? 'Modifier le membre' : 'Ajouter un membre'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className={cn(
                'h-16 w-16 rounded-full overflow-hidden flex items-center justify-center',
                photoPreview ? 'border-2 border-indigo-300' : 'border-2 border-dashed border-gray-300 bg-gray-50',
              )}>
                {photoPreview
                  ? <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                  : <Camera className="h-6 w-6 text-gray-400" />}
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 mb-1.5">
                Photo du membre <span className="text-gray-400 text-xs">(optionnelle)</span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCamera(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors">
                  <Camera className="h-3.5 w-3.5" />
                  Caméra
                </button>
                <button type="button" onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  Fichier
                </button>
                {photoPreview && (
                  <button type="button" onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2 py-1.5 text-xs text-red-400 hover:bg-red-50 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
          {showCamera && (
            <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rôle</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as TeamMemberRole })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Département</label>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving || uploadingPhoto}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {(saving || uploadingPhoto) && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {member ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Accreditation + Badge Design Modal ──────────────────────────────────────

function AccreditationModal({ eventId, member, onClose, onSaved }: {
  eventId: string;
  member: TeamMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = member.accreditation;
  const [zones, setZones] = useState<string[]>(existing?.zones ?? []);
  const [validFrom, setValidFrom] = useState(existing?.validFrom ? existing.validFrom.slice(0, 10) : '');
  const [validUntil, setValidUntil] = useState(existing?.validUntil ? existing.validUntil.slice(0, 10) : '');
  const [badgeConfig, setBadgeConfig] = useState<BadgeConfig>(() => ({
    ...defaultBadgeConfig(member.role),
    ...(existing?.badgeConfig ?? {}),
  }));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'zones' | 'design'>('zones');

  const toggleZone = (z: string) =>
    setZones((prev) => prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await teamApi.createAccreditation(eventId, member.id, {
        zones,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
        badgeConfig,
      });
      toast.success(existing ? 'Accréditation mise à jour' : 'Accréditation créée');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Accréditation & Badge</h2>
            <p className="text-xs text-gray-500">{member.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {[
            { key: 'zones' as const, label: 'Zones & validité' },
            { key: 'design' as const, label: 'Design du badge' },
          ].map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={cn(
                'px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6">
            {tab === 'zones' ? (
              <div className="space-y-5">
                {existing?.code && (
                  <div className="rounded-lg bg-gray-50 px-4 py-3">
                    <p className="text-xs text-gray-500 mb-0.5">Code actuel</p>
                    <code className="font-mono text-sm font-semibold text-indigo-700">{existing.code}</code>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Zones d'accès</label>
                  <div className="flex flex-wrap gap-2">
                    {ZONES.map((z) => (
                      <button key={z} type="button" onClick={() => toggleZone(z)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all',
                          zones.includes(z)
                            ? `${ZONE_COLORS[z]} text-white shadow-sm`
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                        )}>
                        {zones.includes(z) && <Check className="h-3 w-3" />}
                        {z}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valide à partir du</label>
                    <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valide jusqu'au</label>
                    <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
                  </div>
                </div>
              </div>
            ) : (
              <BadgeDesigner
                memberName={member.name}
                memberRole={member.role}
                memberDepartment={member.department ?? undefined}
                photoPreview={member.photoUrl}
                zones={zones}
                value={badgeConfig}
                onChange={setBadgeConfig}
              />
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 pb-6">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {existing ? 'Mettre à jour' : "Créer l'accréditation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [accMember, setAccMember] = useState<TeamMember | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [importOpen, setImportOpen] = useState(false);

  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await apiClient.get(`/events/${eventId}`);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team', eventId],
    queryFn: async () => {
      const res = await teamApi.list(eventId);
      return (res.data as any)?.data ?? res.data ?? [];
    },
    staleTime: 0,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['team', eventId] }),
    [queryClient, eventId],
  );

  const handleDelete = async (member: TeamMember) => {
    if (!confirm(`Supprimer ${member.name} de l'équipe ?`)) return;
    setDeletingId(member.id);
    try {
      await teamApi.remove(eventId, member.id);
      toast.success('Membre supprimé');
      invalidate();
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRevoke = async (member: TeamMember) => {
    if (!confirm(`Révoquer l'accréditation de ${member.name} ?`)) return;
    setRevokingId(member.id);
    try {
      await teamApi.revokeAccreditation(eventId, member.id);
      toast.success('Accréditation révoquée');
      invalidate();
    } catch {
      toast.error('Erreur lors de la révocation');
    } finally {
      setRevokingId(null);
    }
  };

  const handlePrintBadge = async (member: TeamMember) => {
    setPrintingId(member.id);
    try {
      const res = await teamApi.downloadBadge(eventId, member.id);
      printPDFBlob(new Blob([res.data as ArrayBuffer], { type: 'application/pdf' }));
    } catch {
      toast.error('Erreur lors de la génération du badge');
    } finally {
      setPrintingId(null);
    }
  };

  const filtered = roleFilter === 'ALL' ? members : members.filter((m) => m.role === roleFilter);
  const stats = ROLES.map((r) => ({ ...r, count: members.filter((m) => m.role === r.value).length }));
  const accreditedCount = members.filter((m) => m.accreditation?.isActive).length;

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-6 w-6 text-indigo-500" /> Équipe
            </h1>
            {event?.name && <p className="text-sm text-gray-500 mt-0.5">{event.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> Importer Excel
            </button>
            <button onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors">
              <Plus className="h-4 w-4" /> Ajouter un membre
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total membres', value: members.length, color: 'text-gray-900' },
          { label: 'Accrédités', value: accreditedCount, color: 'text-emerald-600' },
          { label: 'Sans accréditation', value: members.length - accreditedCount, color: 'text-amber-500' },
          { label: 'Rôles distincts', value: new Set(members.map((m) => m.role)).size, color: 'text-indigo-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('text-3xl font-bold', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Role filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setRoleFilter('ALL')}
          className={cn('rounded-full px-3 py-1 text-xs font-medium transition-all',
            roleFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          Tous ({members.length})
        </button>
        {stats.filter((s) => s.count > 0).map((s) => (
          <button key={s.value} onClick={() => setRoleFilter(s.value)}
            className={cn('rounded-full px-3 py-1 text-xs font-medium transition-all',
              roleFilter === s.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {s.label} ({s.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Membre', 'Contact', 'Rôle / Département', 'Accréditation', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[160, 120, 120, 140, 100].map((w, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-gray-200" style={{ width: w }} /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <Users className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">Aucun membre dans l'équipe</p>
                    <button onClick={() => setAddOpen(true)}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800">
                      <Plus className="h-4 w-4" /> Ajouter le premier membre
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((member) => {
                  const rc = roleConfig(member.role);
                  const acc = member.accreditation;
                  return (
                    <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {member.photoUrl ? (
                              <img src={member.photoUrl} alt={member.name}
                                className="h-9 w-9 rounded-full object-cover ring-2 ring-white shadow" />
                            ) : (
                              <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold', rc.bg, rc.color)}>
                                {member.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                            {member.notes && <p className="text-xs text-gray-400 truncate max-w-[160px]">{member.notes}</p>}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {member.email && <p className="flex items-center gap-1.5 text-xs text-gray-600"><Mail className="h-3 w-3 text-gray-400" />{member.email}</p>}
                          {member.phone && <p className="flex items-center gap-1.5 text-xs text-gray-600"><Phone className="h-3 w-3 text-gray-400" />{member.phone}</p>}
                          {!member.email && !member.phone && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', rc.bg, rc.color)}>
                          {rc.label}
                        </span>
                        {member.department && (
                          <p className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                            <Building2 className="h-3 w-3" />{member.department}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {!acc ? (
                          <span className="text-xs text-gray-400">Non accrédité</span>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              {acc.isActive
                                ? <BadgeCheck className="h-4 w-4 text-emerald-500" />
                                : <BadgeX className="h-4 w-4 text-red-400" />}
                              <code className="font-mono text-xs text-indigo-700 font-semibold">{acc.code}</code>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(acc.zones as string[]).slice(0, 4).map((z) => (
                                <span key={z} className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white', ZONE_COLORS[z] ?? 'bg-gray-500')}>
                                  {z}
                                </span>
                              ))}
                              {(acc.zones as string[]).length > 4 && (
                                <span className="text-xs text-gray-400">+{(acc.zones as string[]).length - 4}</span>
                              )}
                            </div>
                            {acc.validUntil && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                Jusqu'au {format(new Date(acc.validUntil), 'dd MMM yyyy', { locale: fr })}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditMember(member)} title="Modifier"
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setAccMember(member)} title={acc ? "Gérer l'accréditation" : "Créer une accréditation"}
                            className="rounded p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>
                          {acc?.isActive && (
                            <>
                              <button onClick={() => handlePrintBadge(member)} disabled={printingId === member.id}
                                title="Imprimer le badge"
                                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all disabled:opacity-40">
                                {printingId === member.id
                                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  : <Printer className="h-3.5 w-3.5" />}
                              </button>
                              <button onClick={() => handleRevoke(member)} disabled={revokingId === member.id}
                                title="Révoquer"
                                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-40">
                                {revokingId === member.id
                                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  : <BadgeX className="h-3.5 w-3.5" />}
                              </button>
                            </>
                          )}
                          <button onClick={() => handleDelete(member)} disabled={deletingId === member.id}
                            title="Supprimer"
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-40">
                            {deletingId === member.id
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && <MemberModal eventId={eventId} onClose={() => setAddOpen(false)} onSaved={invalidate} />}
      {editMember && <MemberModal eventId={eventId} member={editMember} onClose={() => setEditMember(null)} onSaved={invalidate} />}
      {accMember && <AccreditationModal eventId={eventId} member={accMember} onClose={() => setAccMember(null)} onSaved={invalidate} />}
      {importOpen && <ImportExcelModal eventId={eventId} onClose={() => setImportOpen(false)} onImported={invalidate} />}
    </div>
  );
}

// ─── ImportExcelModal ────────────────────────────────────────────────────────

type ImportResult = {
  created: number;
  errors: number;
  members: any[];
  errorDetails: { row: number; name: string; reason: string }[];
};

function ImportExcelModal({ eventId, onClose, onImported }: {
  eventId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Seuls les fichiers .xlsx, .xls et .csv sont acceptés');
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post(`/events/${eventId}/team/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data: ImportResult = (res.data as any)?.data ?? res.data;
      setResult(data);
      if (data.created > 0) {
        toast.success(`${data.created} membre(s) importé(s) avec succès`);
        onImported();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de l\'import');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await apiClient.get(`/events/${eventId}/team/import/template`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'import-membres-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur lors du téléchargement du modèle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Importer des membres</h2>
              <p className="text-xs text-gray-500">Fichier Excel (.xlsx, .xls) ou CSV</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Download template */}
          <button onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-green-200 bg-green-50 py-3 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors">
            <Download className="h-4 w-4" />
            Télécharger le modèle Excel
          </button>

          {/* Columns info */}
          <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700">Colonnes attendues :</p>
            <p><span className="font-medium text-red-500">Nom *</span> — Email — Téléphone — Rôle — Département — Notes</p>
            <p className="text-gray-400">Rôles valides : MANAGER, STAFF, VOLUNTEER, SECURITY, PRESS, VIP, ARTIST, SPONSOR</p>
          </div>

          {/* Drop zone */}
          {!result && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <Upload className="mx-auto h-8 w-8 text-gray-300 mb-2" />
              {file ? (
                <div>
                  <p className="font-medium text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} Ko</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-gray-600">Glisser-déposer un fichier ici</p>
                  <p className="text-xs text-gray-400 mt-1">ou cliquer pour parcourir</p>
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600 mb-1" />
                  <p className="text-xl font-bold text-emerald-700">{result.created}</p>
                  <p className="text-xs text-emerald-600">importé(s)</p>
                </div>
                {result.errors > 0 && (
                  <div className="flex-1 rounded-xl bg-red-50 border border-red-200 p-3 text-center">
                    <AlertCircle className="mx-auto h-5 w-5 text-red-500 mb-1" />
                    <p className="text-xl font-bold text-red-600">{result.errors}</p>
                    <p className="text-xs text-red-500">erreur(s)</p>
                  </div>
                )}
              </div>
              {result.errorDetails.length > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 mb-2">Détail des erreurs :</p>
                  {result.errorDetails.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 py-0.5">
                      Ligne {e.row} · <span className="font-medium">{e.name}</span> — {e.reason}
                    </p>
                  ))}
                </div>
              )}
              <button onClick={() => { setFile(null); setResult(null); }}
                className="w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Importer un autre fichier
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            {result ? 'Fermer' : 'Annuler'}
          </button>
          {!result && (
            <button onClick={handleImport} disabled={!file || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {loading ? 'Importation…' : 'Importer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
