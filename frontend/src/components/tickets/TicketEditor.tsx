'use client';

/**
 * IMPORTANT — Fabric.js initialization bug fix:
 * import('fabric') is async. In React Strict Mode (Next.js dev), useEffect fires twice:
 * cleanup runs BEFORE the Promise resolves, so `canvas` is undefined at dispose time.
 * Two Fabric instances end up sharing the same <canvas> DOM element → mouse events broken.
 * Fix: `destroyed` flag checked inside the async callback; canvas disposed via fabricRef.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Download, Image as ImageIcon,
  Italic, Layers, Loader2, Minus, Move, Plus, QrCode, RotateCcw, Save,
  Settings2, Square, Trash2, Type, Hash, UserRound,
} from 'lucide-react';
import { useSaveTicketTemplate } from '@/hooks/useTickets';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface TemplateMetaInput {
  name: string;
  price: number;
  currency: string;
  quantity: number;
  color?: string;
}
interface TicketEditorProps {
  eventId: string;
  initialData?: string;
  templateId?: string;
  initialMeta?: TemplateMetaInput;
  onSaved?: (templateId: string) => void;
}
type ToolType = 'select' | 'text' | 'qr' | 'serial' | 'name' | 'rect' | 'image';
const CURRENCIES = ['USD', 'EUR', 'CDF', 'XAF', 'XOF', 'GBP', 'CAD'];
interface Preset { label: string; width: number; height: number; }

const PRESETS: Preset[] = [
  { label: 'Billet Standard (6768×2517px)', width: 6768, height: 2517 },
  { label: 'Credit Card (85×54mm)', width: 1006, height: 638 },
  { label: 'A4 Half (148×105mm)', width: 1748, height: 1240 },
  { label: 'A6 Portrait (105×148mm)', width: 1240, height: 1748 },
  { label: 'A5 Portrait (148×210mm)', width: 1748, height: 2480 },
  { label: 'A4 Portrait (210×297mm)', width: 2480, height: 3508 },
  { label: 'Banner (200×80mm)', width: 2362, height: 945 },
];

const FONTS = ['Inter', 'Arial', 'Georgia', 'Courier New', 'Times New Roman', 'Verdana'];
const SIZES = [6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];

// Padding so handles at object edges are never clipped by the canvas boundary.
// A pure-translation viewport transform does NOT break Fabric.js v5 drag deltas.
const PAD = 32;
const SYS = new Set(['__bg__', '__bg-img__']);

function pageSize(containerW: number, preset: Preset) {
  const w = Math.min(Math.max(300, containerW - 56), preset.width);
  return { w, h: Math.round(w * preset.height / preset.width) };
}

export function TicketEditor({ eventId, initialData, templateId, initialMeta, onSaved }: TicketEditorProps) {
  // canvasMountRef points to an empty <div> that Fabric mounts into imperatively.
  // We intentionally do NOT render <canvas> via JSX: Fabric wraps the canvas element
  // inside its own <div class="canvas-container">, which moves the node out of its
  // original parent. If React owned the canvas via a fiber, React's commit-phase
  // removeChild would fail ("not a child of this node") on unmount.
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricRef = useRef<any>(null);
  const pageDims = useRef({ w: 900, h: 335 });

  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<ToolType>('select');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sel, setSel] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [layers, setLayers] = useState<any[]>([]);
  const [preset, setPreset] = useState(PRESETS[0]);
  const [showL, setShowL] = useState(true);
  const [showP, setShowP] = useState(true);

  const [props, setProps] = useState({
    fontFamily: 'Inter', fontSize: 20, fill: '#000000', stroke: '',
    strokeWidth: 0, opacity: 100, bold: false, italic: false,
    align: 'left' as 'left' | 'center' | 'right', left: 0, top: 0, w: 100, h: 50,
  });

  // Template metadata (the "tarif"): name, price, currency, quantity
  const [meta, setMeta] = useState<TemplateMetaInput>({
    name: initialMeta?.name ?? 'Nouveau tarif',
    price: initialMeta?.price ?? 0,
    currency: initialMeta?.currency ?? 'USD',
    quantity: initialMeta?.quantity ?? 100,
    color: initialMeta?.color ?? '#4f46e5',
  });

  const saveTemplate = useSaveTicketTemplate(eventId);

  const syncLayers = useCallback(() => {
    const c = fabricRef.current; if (!c) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setLayers(c.getObjects().filter((o: any) => !SYS.has(o.name ?? '')));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncProps = useCallback((o: any) => {
    if (!o) { setSel(null); return; }
    setSel(o);
    setProps({
      fontFamily: o.fontFamily ?? 'Inter',
      fontSize: o.fontSize ?? 20,
      fill: (o.fill as string) ?? '#000000',
      stroke: (o.stroke as string) ?? '',
      strokeWidth: o.strokeWidth ?? 0,
      opacity: Math.round((o.opacity ?? 1) * 100),
      bold: o.fontWeight === 'bold',
      italic: o.fontStyle === 'italic',
      align: (o.textAlign as 'left' | 'center' | 'right') ?? 'left',
      left: Math.round(o.left ?? 0), top: Math.round(o.top ?? 0),
      w: Math.round((o.width ?? 100) * (o.scaleX ?? 1)),
      h: Math.round((o.height ?? 50) * (o.scaleY ?? 1)),
    });
  }, []);

  // Canvas init — `destroyed` flag prevents the async callback from running after cleanup.
  // We capture `mountEl` synchronously so the async callback can safely reference it even
  // after React clears canvasMountRef.current on unmount.
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const cw = areaRef.current?.clientWidth ?? 900;
    const { w, h } = pageSize(cw, preset);
    pageDims.current = { w, h };

    let destroyed = false; // guards the async callback

    import('fabric').then(({ fabric }) => {
      if (destroyed || !mountEl) return;

      // Dispose the previous Fabric instance (handles preset changes).
      if (fabricRef.current) {
        try { fabricRef.current.dispose(); } catch {}
        fabricRef.current = null;
      }

      // Fabric's dispose() restores the original canvas element back into mountEl.
      // Clear it so we start with a clean slate before creating the new canvas.
      while (mountEl.firstChild) {
        mountEl.removeChild(mountEl.firstChild);
      }

      // Create the canvas element imperatively. Fabric will move it into a wrapper
      // <div class="canvas-container"> that it creates — keeping it out of React's
      // fiber tree so React's removeChild never targets this node on unmount.
      const canvasEl = document.createElement('canvas');
      mountEl.appendChild(canvasEl);

      // Set global control appearance BEFORE creating the canvas
      fabric.Object.prototype.cornerSize = 14;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fabric.Object.prototype as any).touchCornerSize = 36;
      fabric.Object.prototype.cornerColor = '#4f46e5';
      fabric.Object.prototype.cornerStrokeColor = '#ffffff';
      fabric.Object.prototype.borderColor = '#4f46e5';
      fabric.Object.prototype.borderScaleFactor = 2;
      fabric.Object.prototype.transparentCorners = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fabric.Object.prototype as any).padding = 6;

      // Canvas element is (page + 2×PAD) so handles at the page edge are
      // fully within the event-capture area of the upper canvas.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas: any = new fabric.Canvas(canvasEl, {
        width: w + PAD * 2,
        height: h + PAD * 2,
        backgroundColor: '#d1d5db',
        selection: true,
        preserveObjectStacking: true,
      });

      // Pure translation: objects at (0,0)→(w,h) world appear at (PAD,PAD)→(w+PAD,h+PAD) screen.
      // Translation does NOT break Fabric.js v5 drag or resize delta calculation.
      canvas.setViewportTransform([1, 0, 0, 1, PAD, PAD]);

      fabricRef.current = canvas;

      // White page background — non-selectable, excluded from JSON save
      const bg = new fabric.Rect({
        left: 0, top: 0, width: w, height: h,
        fill: '#ffffff', selectable: false, evented: false, name: '__bg__',
      });
      canvas.add(bg);
      canvas.sendToBack(bg);

      if (initialData) {
        canvas.loadFromJSON(initialData, () => {
          // Restore the white bg rect at the very bottom.
          // __bg__ is excluded from saved JSON so it must always be re-added here.
          const existing = canvas.getObjects().find((o: any) => o.name === '__bg__');
          if (!existing) { canvas.add(bg); canvas.sendToBack(bg); }
          else canvas.sendToBack(existing);

          // __bg-img__ is now saved in JSON and restored by loadFromJSON.
          // Re-apply non-selectable/non-evented guards (toJSON preserves them but be safe),
          // then stack it: send to back first (index 0), then bring forward once so it sits
          // just above __bg__ (index 1) and below all user objects.
          const bgImg = canvas.getObjects().find((o: any) => o.name === '__bg-img__');
          if (bgImg) {
            bgImg.set({ selectable: false, evented: false });
            canvas.sendToBack(bgImg);          // bgImg at 0, __bg__ at 1
            canvas.bringForward(bgImg);        // bgImg at 1, __bg__ at 0 ✓
          }

          canvas.setViewportTransform([1, 0, 0, 1, PAD, PAD]);

          // Normalize QR placeholder to always be square.
          // If the user previously resized it non-uniformly, snap it back to
          // uniform scaling so the canvas placeholder matches the PDF QR exactly.
          const qrObj = canvas.getObjects().find((o: any) => o.name === 'qr-placeholder') as any;
          if (qrObj) {
            const uniformScale = Math.max(qrObj.scaleX ?? 1, qrObj.scaleY ?? 1);
            qrObj.set({ scaleX: uniformScale, scaleY: uniformScale });
            qrObj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
            qrObj.setCoords();
          }

          canvas.renderAll();
          syncLayers();
        });
      } else {
        canvas.renderAll();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on('selection:created', (e: any) => syncProps(e.selected?.[0] ?? null));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on('selection:updated', (e: any) => syncProps(e.selected?.[0] ?? null));
      canvas.on('selection:cleared', () => syncProps(null));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on('object:modified', (e: any) => { syncLayers(); syncProps(e.target ?? null); });
      canvas.on('object:added', syncLayers);
      canvas.on('object:removed', syncLayers);

      // Force the QR placeholder to stay square when the user resizes it.
      // The QR code in the exported PDF is always square, so the placeholder
      // must match to avoid position drift between canvas design and PDF output.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on('object:scaling', (e: any) => {
        const obj = e.target;
        if (obj?.name !== 'qr-placeholder') return;
        const uniformScale = Math.max(obj.scaleX ?? 1, obj.scaleY ?? 1);
        obj.set({ scaleX: uniformScale, scaleY: uniformScale });
      });

      setReady(true);
    });

    return () => {
      destroyed = true;
      // Dispose synchronously if canvas exists; if it doesn't yet (async not resolved),
      // the `destroyed` flag prevents it from being created at all.
      if (fabricRef.current) {
        try {
          fabricRef.current.dispose();
        } catch {
          // Fabric tries to removeChild on its wrapper element; when React has
          // already unmounted the parent container the parent node may be null,
          // which causes a "removeChild" DOMException — safe to swallow.
        }
        fabricRef.current = null;
      }
      setReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const W = () => pageDims.current.w;
  const H = () => pageDims.current.h;

  const addText = useCallback(() => {
    import('fabric').then(({ fabric }) => {
      const t = new fabric.IText('Double-cliquez pour éditer', {
        left: Math.round(W() * 0.05), top: Math.round(H() * 0.3),
        fontFamily: 'Inter', fontSize: Math.round(W() * 0.025), fill: '#1a1a2e',
      });
      fabricRef.current?.add(t);
      fabricRef.current?.setActiveObject(t);
      fabricRef.current?.renderAll();
    });
    setTool('select');
  }, []);

  const addQR = useCallback(() => {
    import('fabric').then(({ fabric }) => {
      const s = Math.round(Math.min(W(), H()) * 0.55);
      // IMPORTANT: all children use originX/Y='center' and left=0, so their centers
      // align at the group center and nothing extends outside the s×s rect.
      // This makes the group bounding box == the inner rect → PDF QR placement is exact.
      const g = new fabric.Group([
        new fabric.Rect({
          width: s, height: s,
          fill: '#f3f4f6', stroke: '#4f46e5', strokeWidth: 2,
          strokeDashArray: [8, 4], rx: 6, ry: 6,
          originX: 'center', originY: 'center',
        }),
        new fabric.Text('QR CODE', {
          fontSize: Math.round(s * 0.13), fill: '#4f46e5',
          fontFamily: 'Inter', fontWeight: 'bold',
          originX: 'center', originY: 'center',
          left: 0, top: -Math.round(s * 0.08),
        }),
        new fabric.Text('{{QR_CODE}}', {
          fontSize: Math.round(s * 0.08), fill: '#6b7280',
          fontFamily: 'Inter',
          originX: 'center', originY: 'center',
          left: 0, top: Math.round(s * 0.10),
        }),
      ], {
        left: Math.round(W() * 0.05),
        top: Math.round(H() * 0.2),
        name: 'qr-placeholder',
      });
      // Only corner handles → uniform scaling only
      g.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
      fabricRef.current?.add(g);
      fabricRef.current?.setActiveObject(g);
      fabricRef.current?.renderAll();
    });
    setTool('select');
  }, []);

  const addSerial = useCallback(() => {
    import('fabric').then(({ fabric }) => {
      const t = new fabric.IText('{{SERIAL}}', {
        left: Math.round(W() * 0.05), top: Math.round(H() * 0.75),
        fontFamily: 'Courier New', fontSize: Math.round(W() * 0.018), fill: '#1a1a2e', fontWeight: 'bold', name: 'serial-placeholder',
      });
      fabricRef.current?.add(t);
      fabricRef.current?.setActiveObject(t);
      fabricRef.current?.renderAll();
    });
    setTool('select');
  }, []);

  const addName = useCallback(() => {
    import('fabric').then(({ fabric }) => {
      const t = new fabric.IText('Prénom NOM', {
        left: Math.round(W() * 0.05), top: Math.round(H() * 0.45),
        fontFamily: 'Inter', fontSize: Math.round(W() * 0.03), fill: '#1a1a2e',
        fontWeight: 'bold', name: 'name-placeholder',
      });
      fabricRef.current?.add(t);
      fabricRef.current?.setActiveObject(t);
      fabricRef.current?.renderAll();
    });
    setTool('select');
  }, []);

  const addRect = useCallback(() => {
    import('fabric').then(({ fabric }) => {
      fabricRef.current?.add(new fabric.Rect({
        left: Math.round(W() * 0.1), top: Math.round(H() * 0.2),
        width: Math.round(W() * 0.3), height: Math.round(H() * 0.25),
        fill: 'rgba(79,70,229,0.12)', stroke: '#4f46e5', strokeWidth: 2, rx: 6, ry: 6,
      }));
      fabricRef.current?.renderAll();
    });
    setTool('select');
  }, []);

  const addImage = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    // Must be in the DOM to avoid garbage collection and ensure onchange fires on first pick.
    inp.style.cssText = 'position:fixed;top:-100px;left:-100px;opacity:0;pointer-events:none';
    document.body.appendChild(inp);
    const cleanup = () => { if (inp.parentNode) document.body.removeChild(inp); };
    inp.onchange = () => {
      cleanup();
      const file = inp.files?.[0]; if (!file) return;
      const r = new FileReader();
      r.onload = (e) => {
        const url = e.target?.result as string;
        import('fabric').then(({ fabric }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fabric.Image.fromURL(url, (img: any) => {
            // Scale to 55% of page width — keeps handles well within canvas bounds
            img.scaleToWidth(Math.round(W() * 0.55));
            img.set({ left: Math.round(W() * 0.05), top: Math.round(H() * 0.1) });
            fabricRef.current?.add(img);
            fabricRef.current?.setActiveObject(img);
            fabricRef.current?.renderAll();
          }, { crossOrigin: 'anonymous' });
        });
      };
      r.readAsDataURL(file);
    };
    // Clean up if the user closes the picker without selecting a file.
    window.addEventListener('focus', cleanup, { once: true });
    inp.click();
  }, []);

  // Background image: added as a Fabric object so the viewport transform applies to it.
  const setBackground = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    // Must be in the DOM to avoid garbage collection and ensure onchange fires on first pick.
    inp.style.cssText = 'position:fixed;top:-100px;left:-100px;opacity:0;pointer-events:none';
    document.body.appendChild(inp);
    const cleanup = () => { if (inp.parentNode) document.body.removeChild(inp); };
    inp.onchange = () => {
      cleanup();
      const file = inp.files?.[0]; if (!file) return;

      // Compress via canvas before handing to Fabric — limits base64 payload to ~500KB.
      const objectUrl = URL.createObjectURL(file);
      const tmpImg = new Image();
      tmpImg.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_W = 2400;
        const scale = tmpImg.width > MAX_W ? MAX_W / tmpImg.width : 1;
        const cvs = document.createElement('canvas');
        cvs.width  = Math.round(tmpImg.width  * scale);
        cvs.height = Math.round(tmpImg.height * scale);
        const ctx = cvs.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(tmpImg, 0, 0, cvs.width, cvs.height);
        const url = cvs.toDataURL('image/jpeg', 0.85);

        const fabricCanvas = fabricRef.current; if (!fabricCanvas) return;
        import('fabric').then(({ fabric }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fabric.Image.fromURL(url, (img: any) => {
            const old = fabricCanvas.getObjects().find((o: any) => o.name === '__bg-img__');
            if (old) fabricCanvas.remove(old);
            img.set({
              left: 0, top: 0,
              scaleX: pageDims.current.w / (img.width ?? 1),
              scaleY: pageDims.current.h / (img.height ?? 1),
              selectable: false, evented: false, name: '__bg-img__',
            });
            fabricCanvas.add(img);
            fabricCanvas.sendToBack(img);
            const bgRect = fabricCanvas.getObjects().find((o: any) => o.name === '__bg__');
            if (bgRect) fabricCanvas.sendToBack(bgRect);
            fabricCanvas.renderAll();
          }, { crossOrigin: 'anonymous' });
        });
      };
      tmpImg.src = objectUrl;
    };
    // Clean up if the user closes the picker without selecting a file.
    window.addEventListener('focus', cleanup, { once: true });
    inp.click();
  }, []);

  const del = useCallback(() => {
    const c = fabricRef.current; if (!c) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.getActiveObjects().filter((o: any) => !SYS.has(o.name ?? '')).forEach((o: any) => c.remove(o));
    c.discardActiveObject(); c.renderAll();
  }, []);

  const clear = useCallback(() => {
    const c = fabricRef.current; if (!c) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.getObjects().filter((o: any) => !SYS.has(o.name ?? '')).forEach((o: any) => c.remove(o));
    c.renderAll(); syncLayers();
  }, [syncLayers]);

  const fwd = useCallback(() => { const o = fabricRef.current?.getActiveObject(); if (o) { fabricRef.current.bringForward(o); fabricRef.current.renderAll(); } }, []);
  const bwd = useCallback(() => {
    const c = fabricRef.current; const o = c?.getActiveObject(); if (!c || !o) return;
    const objs = c.getObjects();
    const minIdx = Math.max(...Array.from(SYS).map(n => objs.findIndex((x: any) => x.name === n)));
    if (objs.indexOf(o) > minIdx + 1) { c.sendBackwards(o); c.renderAll(); }
  }, []);

  const applyProp = useCallback(<K extends keyof typeof props>(k: K, v: typeof props[K]) => {
    const c = fabricRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = c?.getActiveObject() as any;
    if (!o) return;
    setProps(p => ({ ...p, [k]: v }));
    switch (k) {
      case 'fontFamily': o.set('fontFamily', v); break;
      case 'fontSize': o.set('fontSize', v); break;
      case 'fill': o.set('fill', v); break;
      case 'stroke': o.set('stroke', v); break;
      case 'strokeWidth': o.set('strokeWidth', v); break;
      case 'opacity': o.set('opacity', (v as number) / 100); break;
      case 'bold': o.set('fontWeight', v ? 'bold' : 'normal'); break;
      case 'italic': o.set('fontStyle', v ? 'italic' : 'normal'); break;
      case 'align': o.set('textAlign', v); break;
      case 'left': o.set('left', v); break;
      case 'top': o.set('top', v); break;
      default: break;
    }
    c?.renderAll();
  }, []);

  const save = useCallback(() => {
    const c = fabricRef.current; if (!c) return;

    // 1. Export canvas JSON.
    // __bg__ (white rect) is recreated from scratch on load — exclude it to avoid duplication.
    // __bg-img__ (background image) must be KEPT so it is restored by loadFromJSON.
    const full = c.toJSON(['name']);
    const json = JSON.stringify({ ...full, objects: full.objects.filter((o: any) => o.name !== '__bg__') });

    // 2. Capture placeholder bounds in design space BEFORE touching the viewport.
    //    Fabric.js 5.x: getBoundingRect(absolute=false) uses lineCoords which apply the
    //    viewport transform, so lineCoords = aCoords + [PAD, PAD]. Subtracting PAD gives
    //    the true design-space position. (absolute=true uses aCoords = design space already,
    //    so subtracting PAD from it was a bug that caused a ~17pt horizontal offset in the PDF.)
    const qrObj     = c.getObjects().find((o: any) => o.name === 'qr-placeholder') as any;
    const serialObj = c.getObjects().find((o: any) => o.name === 'serial-placeholder') as any;
    const nameObj   = c.getObjects().find((o: any) => o.name === 'name-placeholder') as any;

    // getBounds for generic objects: absolute=false → lineCoords (viewport/screen space), subtract PAD → design space
    const getBounds = (obj: any) => {
      if (!obj) return undefined;
      const br = obj.getBoundingRect(false, true); // calculate=true for fresh coords
      return { left: br.left - PAD, top: br.top - PAD, width: br.width, height: br.height };
    };

    // For the QR group specifically, use the inner Rect child bounds if the text labels
    // extend outside the rect (old design). This ensures the PDF QR matches the dashed
    // square, not the outer text-inclusive bounding box of the whole group.
    const getQRBounds = (group: any) => {
      if (!group) return undefined;
      const innerRect = (group.getObjects?.() as any[])?.find((o: any) => o.type === 'rect');
      if (!innerRect) return getBounds(group);

      // Group center in viewport/screen space
      const gBr = group.getBoundingRect(false, true);
      const gcx = gBr.left + gBr.width / 2;
      const gcy = gBr.top  + gBr.height / 2;
      const gs  = group.scaleX ?? 1; // we enforce uniform scale

      // Inner rect dims in canvas space (rect's own scaleX/Y * group scale)
      const rW = (innerRect.width  ?? 0) * (innerRect.scaleX ?? 1) * gs;
      const rH = (innerRect.height ?? 0) * (innerRect.scaleY ?? 1) * gs;

      // innerRect.left/top in group local space → convert to viewport space
      // originX='center' (new design): center at (innerRect.left, innerRect.top)
      // originX='left'   (old design): left edge at (innerRect.left, innerRect.top)
      const isCenter = innerRect.originX === 'center';
      const rLeft_vp = isCenter
        ? gcx + (innerRect.left ?? 0) * gs - rW / 2
        : gcx + (innerRect.left ?? 0) * gs;
      const rTop_vp  = isCenter
        ? gcy + (innerRect.top ?? 0) * gs - rH / 2
        : gcy + (innerRect.top ?? 0) * gs;

      return { left: rLeft_vp - PAD, top: rTop_vp - PAD, width: rW, height: rH };
    };

    const getNameBounds = (obj: any) => {
      if (!obj) return undefined;
      const br = obj.getBoundingRect(false, true);
      return {
        left:       br.left - PAD,
        top:        br.top  - PAD,
        width:      Math.max(30, (obj.width  ?? 60) * (obj.scaleX ?? 1)),
        height:     (obj.height ?? 20) * (obj.scaleY ?? 1),
        fontSize:   (obj.fontSize   ?? 16) * (obj.scaleY ?? 1),
        fontFamily: (obj.fontFamily ?? 'Inter')   as string,
        fontWeight: (obj.fontWeight ?? 'normal')  as string,
        fill:       (obj.fill       ?? '#000000') as string,
        textAlign:  (obj.textAlign  ?? 'left')    as string,
      };
    };

    // Like getNameBounds, capture font styling so the PDF can render the serial in the
    // correct color/font. The actual serial text is ~2× wider than the "{{SERIAL}}"
    // placeholder, so store an enlarged width to prevent line wrapping in PDFKit.
    const getSerialBounds = (obj: any) => {
      if (!obj) return undefined;
      const br = obj.getBoundingRect(false, true);
      const textWidth  = Math.max(30, (obj.width  ?? 60) * (obj.scaleX ?? 1));
      return {
        left:       br.left - PAD,
        top:        br.top  - PAD,
        // Reserve 2.5× the placeholder width — real serial numbers are longer than "{{SERIAL}}"
        width:      textWidth * 2.5,
        height:     (obj.height ?? 20) * (obj.scaleY ?? 1),
        fontSize:   (obj.fontSize   ?? 12) * (obj.scaleY ?? 1),
        fontFamily: (obj.fontFamily ?? 'Courier New') as string,
        fontWeight: (obj.fontWeight ?? 'bold')        as string,
        fill:       (obj.fill       ?? '#000000')     as string,
      };
    };

    const qrBounds     = getQRBounds(qrObj);
    const serialBounds = getSerialBounds(serialObj);
    const nameBounds   = getNameBounds(nameObj);

    // 3. Switch to design-space export mode: remove PAD offset, resize to exact design dims
    //    This ensures the preview PNG contains ONLY the design area — no grey PAD borders.
    c.discardActiveObject();
    const { w, h } = pageDims.current;
    const vpt = [...(c.viewportTransform ?? [1, 0, 0, 1, 0, 0])];
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    c.setDimensions({ width: w, height: h });

    // 4. Hide dynamic placeholders so they don't appear in the background PNG
    if (qrObj)     qrObj.set('visible', false);
    if (serialObj) serialObj.set('visible', false);
    if (nameObj)   nameObj.set('visible', false);
    c.renderAll();

    const preview = c.toDataURL({ format: 'png', multiplier: 2 }); // 2× for crisp PDF

    // 5. Restore canvas to editing state
    if (qrObj)     qrObj.set('visible', true);
    if (serialObj) serialObj.set('visible', true);
    if (nameObj)   nameObj.set('visible', true);
    c.setDimensions({ width: w + PAD * 2, height: h + PAD * 2 });
    c.setViewportTransform(vpt as any);
    c.renderAll();

    // Save the SCREEN canvas dimensions (pageDims), NOT preset pixel dimensions.
    // qrBounds/serialBounds are in screen canvas coordinate space (pageDims.w × pageDims.h).
    // The export service uses these stored dims to scale bounds into PDF strip coordinates.
    saveTemplate.mutate({
      templateId,
      meta,
      customFields: {
        canvas: json,
        width: w,
        height: h,
        preview,
        qrBounds,
        serialBounds,
        nameBounds,
        presetWidth: preset.width,
        presetHeight: preset.height,
      },
    }, {
      onSuccess: (data: any) => {
        const savedId = data?.id ?? templateId;
        if (savedId && onSaved) onSaved(savedId as string);
      },
    });
  }, [saveTemplate, preset, templateId, meta, onSaved]);

  const exportPNG = useCallback(() => {
    const c = fabricRef.current; if (!c) return;
    c.discardActiveObject();
    const { w, h } = pageDims.current;
    const vpt = [...(c.viewportTransform ?? [1, 0, 0, 1, 0, 0])];
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    c.setDimensions({ width: w, height: h });
    c.renderAll();
    const url = c.toDataURL({ format: 'png', multiplier: preset.width / w });
    c.setDimensions({ width: w + PAD * 2, height: h + PAD * 2 });
    c.setViewportTransform(vpt);
    c.renderAll();
    const a = document.createElement('a');
    a.href = url; a.download = `ticket-${eventId}-${preset.width}x${preset.height}.png`; a.click();
    toast.success(`PNG exporté — ${preset.width}×${preset.height}px`);
  }, [eventId, preset]);

  const exportJSON = useCallback(() => {
    const c = fabricRef.current; if (!c) return;
    const full = c.toJSON(['name']);
    const filtered = { ...full, objects: full.objects.filter((o: any) => !SYS.has(o.name ?? '')) };
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `ticket-${eventId}.json` });
    a.click(); URL.revokeObjectURL(a.href);
    toast.success('JSON exporté !');
  }, [eventId]);

  const TB = [
    { t: 'select' as ToolType, I: Move, l: 'Sélection', fn: () => setTool('select') },
    { t: 'text' as ToolType, I: Type, l: 'Texte', fn: addText },
    { t: 'qr' as ToolType, I: QrCode, l: 'QR Code', fn: addQR },
    { t: 'serial' as ToolType, I: Hash, l: 'N° Série', fn: addSerial },
    { t: 'name' as ToolType, I: UserRound, l: 'Nom participant', fn: addName },
    { t: 'rect' as ToolType, I: Square, l: 'Rectangle', fn: addRect },
    { t: 'image' as ToolType, I: ImageIcon, l: 'Image', fn: addImage },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {TB.map(({ t, I, l, fn }) => (
            <button key={t} onClick={fn} title={l}
              className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                tool === t ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white')}>
              <I className="h-3.5 w-3.5" /><span className="hidden sm:inline">{l}</span>
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
        <button onClick={setBackground} title="Image de fond" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          <ImageIcon className="h-3.5 w-3.5" /><span className="hidden sm:inline">Fond</span>
        </button>
        <button onClick={fwd} title="Avancer" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"><Plus className="h-4 w-4" /></button>
        <button onClick={bwd} title="Reculer" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"><Minus className="h-4 w-4" /></button>
        <button onClick={del} title="Supprimer" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
        <button onClick={clear} title="Tout effacer" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"><RotateCcw className="h-4 w-4" /></button>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
        <select value={preset.label}
          onChange={e => { const p = PRESETS.find(x => x.label === e.target.value); if (p) setPreset(p); }}
          className="text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
        </select>
        <span className="text-xs text-gray-400 hidden md:inline">Export : {preset.width}×{preset.height}px</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowL(v => !v)} title="Calques" className={cn('p-1.5 rounded-lg transition-colors', showL ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500')}><Layers className="h-4 w-4" /></button>
          <button onClick={() => setShowP(v => !v)} title="Propriétés" className={cn('p-1.5 rounded-lg transition-colors', showP ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500')}><Settings2 className="h-4 w-4" /></button>
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
          <button onClick={exportJSON} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 transition-colors"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">JSON</span></button>
          <button onClick={exportPNG} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 transition-colors"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">PNG</span></button>
          <button onClick={save} disabled={saveTemplate.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-60">
            {saveTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Enregistrer
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Layers */}
        <AnimatePresence>
          {showL && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 180, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Calques</p>
              </div>
              <div className="overflow-y-auto h-full pb-20">
                {layers.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-6 px-2">Aucun calque.</p>
                  : [...layers].reverse().map((o, i) => {
                    const label = (o.name && !SYS.has(o.name)) ? o.name
                      : o.type === 'i-text' ? `Texte: ${String(o.text ?? '').slice(0, 12)}` : o.type ?? 'Objet';
                    return (
                      <button key={i} onClick={() => { fabricRef.current?.setActiveObject(o); fabricRef.current?.renderAll(); syncProps(o); }}
                        className={cn('w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors border-b border-gray-50 dark:border-gray-800',
                          sel === o ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800')}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: (o.fill as string) || '#4f46e5' }} />
                        <span className="truncate">{String(label)}</span>
                      </button>
                    );
                  })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Canvas */}
        <div ref={areaRef} className="flex-1 overflow-auto flex items-start justify-center p-6 bg-gray-100 dark:bg-gray-950">
          <div className="relative rounded-sm shadow-2xl">
            {!ready && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white rounded-sm" style={{ minWidth: 200, minHeight: 80 }}>
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            )}
            {/*
              Fabric mounts its canvas + upper-canvas wrapper here imperatively.
              React has NO fiber for the canvas — preventing the removeChild crash
              that happens when Fabric moves the canvas out of its original parent.
            */}
            <div ref={canvasMountRef} />
          </div>
        </div>

        {/* Properties */}
        <AnimatePresence>
          {showP && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 220, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="flex-shrink-0 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Propriétés</p>
              </div>
              <div className="overflow-y-auto h-full pb-20">
                {/* Tarif metadata — always visible */}
                <div className="p-3 space-y-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tarif</p>
                  <div>
                    <label className="text-xs text-gray-400">Nom</label>
                    <input type="text" value={meta.name} onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
                      className="w-full mt-0.5 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400">Prix</label>
                      <input type="number" min={0} step={0.01} value={meta.price} onChange={e => setMeta(m => ({ ...m, price: Number(e.target.value) }))}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="w-[72px]">
                      <label className="text-xs text-gray-400">Devise</label>
                      <select value={meta.currency} onChange={e => setMeta(m => ({ ...m, currency: e.target.value }))}
                        className="w-full mt-0.5 px-1 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Quantité</label>
                    <input type="number" min={1} max={100000} value={meta.quantity} onChange={e => setMeta(m => ({ ...m, quantity: Number(e.target.value) }))}
                      className="w-full mt-0.5 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Couleur</label>
                    <input type="color" value={meta.color ?? '#4f46e5'} onChange={e => setMeta(m => ({ ...m, color: e.target.value }))}
                      className="w-8 h-7 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <span className="text-xs font-mono text-gray-500">{meta.color ?? '#4f46e5'}</span>
                  </div>
                </div>

                {/* Object properties — only when an object is selected */}
                {sel ? (
                  <div className="p-3 space-y-4">
                    <section>
                      <p className="text-xs font-semibold text-gray-500 mb-2">Position & Taille</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([['left', 'X'], ['top', 'Y'], ['w', 'L'], ['h', 'H']] as const).map(([k, lbl]) => (
                          <div key={k}>
                            <label className="text-xs text-gray-400 uppercase">{lbl}</label>
                            <input type="number" value={props[k as keyof typeof props] as number}
                              onChange={e => applyProp(k as any, Number(e.target.value))}
                              className="w-full mt-0.5 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </div>
                        ))}
                      </div>
                    </section>
                    <section>
                      <p className="text-xs font-semibold text-gray-500 mb-2">Opacité : {props.opacity}%</p>
                      <input type="range" min={0} max={100} value={props.opacity} onChange={e => applyProp('opacity', Number(e.target.value))} className="w-full accent-indigo-600" />
                    </section>
                    <section>
                      <p className="text-xs font-semibold text-gray-500 mb-2">Couleurs</p>
                      <div className="space-y-2">
                        {([['fill', 'Fond'], ['stroke', 'Contour']] as const).map(([k, lbl]) => (
                          <div key={k} className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 w-12">{lbl}</label>
                            <div className="flex items-center gap-1.5 flex-1">
                              <input type="color" value={(props[k] || '#000000') as string} onChange={e => applyProp(k as any, e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer p-0.5" />
                              {k === 'fill'
                                ? <input type="text" value={props.fill} onChange={e => applyProp('fill', e.target.value)} className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded font-mono focus:outline-none" />
                                : <input type="number" value={props.strokeWidth} min={0} max={50} onChange={e => applyProp('strokeWidth', Number(e.target.value))} placeholder="Épaisseur" className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none" />
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                    {(sel?.type === 'i-text' || sel?.type === 'text') && (
                      <section>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Typographie</p>
                        <div className="space-y-2">
                          <select value={props.fontFamily} onChange={e => applyProp('fontFamily', e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                          <select value={props.fontSize} onChange={e => applyProp('fontSize', Number(e.target.value))}
                            className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                            {SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                          </select>
                          <div className="flex gap-1">
                            <button onClick={() => applyProp('bold', !props.bold)} className={cn('flex-1 py-1.5 rounded-md text-xs font-bold transition-colors', props.bold ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200')}><Bold className="h-3.5 w-3.5 mx-auto" /></button>
                            <button onClick={() => applyProp('italic', !props.italic)} className={cn('flex-1 py-1.5 rounded-md text-xs transition-colors', props.italic ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200')}><Italic className="h-3.5 w-3.5 mx-auto" /></button>
                          </div>
                          <div className="flex gap-1">
                            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                              <button key={a} onClick={() => applyProp('align', a)} className={cn('flex-1 py-1.5 rounded-md transition-colors', props.align === a ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200')}><Icon className="h-3.5 w-3.5 mx-auto" /></button>
                            ))}
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4 px-3">Sélectionnez un objet pour modifier ses propriétés</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
