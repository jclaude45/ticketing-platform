'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar, MapPin, Loader2, ScanLine, CameraOff, CheckCircle2, XCircle, AlertTriangle, Users, UserCheck,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatEventDate } from '../format';

type ScanResult = 'VALID' | 'INVALID' | 'ALREADY_USED' | 'EXPIRED' | 'FRAUDULENT';

interface EventDetail {
  id: string;
  name: string;
  startDate: string;
  venue: string;
  address: string | null;
  city: string;
  stats: { checkedIn: number; myScans: number; myValidScans: number };
}

interface ScanRow {
  id: string;
  result: ScanResult;
  scannedAt: string;
  serialNumber: string | null;
  holderName: string | null;
  templateName: string | null;
}

interface LastScan {
  result: ScanResult;
  message: string;
  holderName?: string | null;
  templateName?: string | null;
}

const RESULT_UI: Record<ScanResult, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  VALID: { label: 'Entrée autorisée', cls: 'bg-green-600', icon: CheckCircle2 },
  ALREADY_USED: { label: 'Billet déjà utilisé', cls: 'bg-amber-500', icon: AlertTriangle },
  INVALID: { label: 'Billet invalide', cls: 'bg-red-600', icon: XCircle },
  EXPIRED: { label: 'Événement terminé', cls: 'bg-red-600', icon: XCircle },
  FRAUDULENT: { label: 'Billet frauduleux', cls: 'bg-red-700', icon: XCircle },
};

const SCANNER_ID = 'controle-qr-reader';

export default function ControleEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const scannerRef = useRef<any>(null);
  const busyRef = useRef(false);

  const { data: event, isLoading, error } = useQuery<EventDetail>({
    queryKey: ['controller-space', 'event', eventId],
    queryFn: async () => (await apiClient.get(`/controller-space/events/${eventId}`)).data?.data,
    refetchInterval: 15000,
  });

  const { data: scans } = useQuery<{ data: ScanRow[] }>({
    queryKey: ['controller-space', 'scans', eventId],
    queryFn: async () => (await apiClient.get(`/controller-space/events/${eventId}/scans?limit=30`)).data?.data,
  });

  const handleDecoded = async (qrContent: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await apiClient.post(`/validation/events/${eventId}/scan`, { qrContent });
      const data = (res.data as any)?.data ?? res.data;
      setLastScan({
        result: data.result,
        message: data.message,
        holderName: data.ticket?.holderName,
        templateName: data.ticket?.templateName,
      });
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(data.result === 'VALID' ? 80 : [80, 60, 80]);
      }
      queryClient.invalidateQueries({ queryKey: ['controller-space', 'event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['controller-space', 'scans', eventId] });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setLastScan({ result: 'INVALID', message: Array.isArray(msg) ? msg[0] : msg ?? 'Erreur de validation' });
    } finally {
      // Short pause so the same QR isn't validated twice while still in front of the camera
      setTimeout(() => { busyRef.current = false; }, 2000);
    }
  };

  const startScanner = async () => {
    setCameraError(null);
    setScanning(true);
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (scanner) {
      try { await scanner.stop(); scanner.clear(); } catch { /* already stopped */ }
    }
  };

  // Start the camera once the reader container is mounted
  useEffect(() => {
    if (!scanning || scannerRef.current) return;
    let cancelled = false;
    (async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text: string) => { handleDecoded(text); },
          () => { /* no QR in frame */ },
        );
      } catch (e: any) {
        scannerRef.current = null;
        setScanning(false);
        setCameraError(
          /permission|notallowed/i.test(String(e?.name ?? e))
            ? "Accès à la caméra refusé. Autorisez la caméra dans votre navigateur."
            : "Impossible d'ouvrir la caméra sur cet appareil.",
        );
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  useEffect(() => () => { stopScanner(); }, []); // stop camera when leaving the page

  if (isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }
  if (error || !event) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <XCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
        <p className="font-medium text-gray-900">Événement inaccessible</p>
        <p className="text-sm text-gray-500 mt-1">Vous n&apos;êtes pas assigné(e) à cet événement.</p>
        <Link href="/controle" className="mt-4 inline-block text-sm font-medium text-indigo-600">Retour</Link>
      </div>
    );
  }

  const last = lastScan ? RESULT_UI[lastScan.result] ?? RESULT_UI.INVALID : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/controle" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Mes événements
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900">{event.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
          <Calendar className="h-4 w-4" /> {formatEventDate(event.startDate)}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
          <MapPin className="h-4 w-4" /> {[event.venue, event.address, event.city].filter(Boolean).join(', ')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs text-gray-500"><Users className="h-3.5 w-3.5" /> Entrées (tous contrôleurs)</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{event.stats.checkedIn}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs text-gray-500"><UserCheck className="h-3.5 w-3.5" /> Mes entrées validées</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{event.stats.myValidScans}</p>
          <p className="text-xs text-gray-400">{event.stats.myScans} scan(s) au total</p>
        </div>
      </div>

      {/* Scanner */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
        {scanning ? (
          <>
            <div id={SCANNER_ID} className="overflow-hidden rounded-lg bg-black" />
            <button
              onClick={stopScanner}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <CameraOff className="h-4 w-4" /> Arrêter la caméra
            </button>
          </>
        ) : (
          <button
            onClick={startScanner}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-base font-semibold text-white hover:bg-indigo-700"
          >
            <ScanLine className="h-5 w-5" /> Scanner un billet
          </button>
        )}
        {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}

        {lastScan && last && (
          <div className={cn('flex items-start gap-3 rounded-lg p-4 text-white', last.cls)}>
            <last.icon className="h-7 w-7 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold">{last.label}</p>
              {lastScan.holderName && <p className="text-sm">{lastScan.holderName}{lastScan.templateName ? ` · ${lastScan.templateName}` : ''}</p>}
              {lastScan.result !== 'VALID' && <p className="text-xs opacity-90 mt-0.5">{lastScan.message}</p>}
            </div>
          </div>
        )}
      </div>

      {/* My scans */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-4 py-3 font-semibold text-gray-900">Mes derniers scans</h2>
        {!scans?.data?.length ? (
          <p className="p-6 text-center text-sm text-gray-500">Aucun scan pour le moment.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {scans.data.map((s) => {
              const ui = RESULT_UI[s.result] ?? RESULT_UI.INVALID;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{s.holderName ?? 'Billet inconnu'}</p>
                    <p className="truncate text-xs text-gray-500">
                      {new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(s.scannedAt))}
                      {s.templateName ? ` · ${s.templateName}` : ''}
                    </p>
                  </div>
                  <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white', ui.cls)}>{ui.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
