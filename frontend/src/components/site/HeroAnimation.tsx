'use client';

import { useEffect, useRef } from 'react';

/** Frame where the ZAYA logo is centred: shown as is when the visitor asks for less motion */
const STILL_FRAME = 240;

/**
 * Where the words sit in the 1080 × 1080 animation (x 240-931). The logo is centred at x 540 and the
 * words at 585: the view is centred between the two so that neither looks off-centre.
 */
const WORDS = { width: 691, centerX: 560, centerY: 540 };

/**
 * Landing page banner: the ZAYA words animation (public/zaya-site/banniere.json), looped.
 * fitWidth: the view is cut around the words so that they span
 * 72 % of the box width on a computer and 92 % on a phone, whatever the box height.
 */
export function HeroAnimation({ className, fitWidth = false }: { className?: string; fitWidth?: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let anim: { destroy: () => void } | null = null;
    let resize: ResizeObserver | null = null;
    let cancelled = false;
    (async () => {
      // Light player: SVG renderer only, no expressions — all this file needs
      const { default: lottie } = await import('lottie-web/build/player/lottie_light');
      if (cancelled || !box.current) return;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const a = lottie.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop: !still,
        autoplay: !still,
        path: '/zaya-site/banniere.json',
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
      if (fitWidth) {
        const fit = () => {
          const el = box.current;
          const svg = el?.querySelector('svg');
          if (!el || !svg || !el.clientWidth || !el.clientHeight) return;
          const share = el.clientWidth >= 768 ? 0.72 : 0.92;
          const w = WORDS.width / share;
          const h = (w * el.clientHeight) / el.clientWidth;
          svg.setAttribute('viewBox', `${WORDS.centerX - w / 2} ${WORDS.centerY - h / 2} ${w} ${h}`);
        };
        a.addEventListener('DOMLoaded', fit);
        resize = new ResizeObserver(fit);
        resize.observe(box.current);
      }
      if (still) a.addEventListener('DOMLoaded', () => a.goToAndStop(STILL_FRAME, true));
      anim = a;
    })();
    return () => { cancelled = true; resize?.disconnect(); anim?.destroy(); };
  }, [fitWidth]);

  return <div ref={box} role="img" aria-label="ZAYA — imparable, instantané, invisible, illimité, inoubliable" className={className} />;
}
