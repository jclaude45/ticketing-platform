'use client';

import { useEffect, useRef } from 'react';

/** Frame where the ZAYA logo is centred: shown as is when the visitor asks for less motion */
const STILL_FRAME = 240;

/**
 * Landing page banner: the ZAYA words animation (public/zaya-site/banniere.json), looped.
 * crop: fill the box and cut the empty top and bottom of the square animation.
 */
export function HeroAnimation({ className, crop = false }: { className?: string; crop?: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let anim: { destroy: () => void } | null = null;
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
        rendererSettings: { preserveAspectRatio: crop ? 'xMidYMid slice' : 'xMidYMid meet' },
      });
      if (still) a.addEventListener('DOMLoaded', () => a.goToAndStop(STILL_FRAME, true));
      anim = a;
    })();
    return () => { cancelled = true; anim?.destroy(); };
  }, [crop]);

  return <div ref={box} role="img" aria-label="ZAYA — imparable, instantané, invisible, illimité, inoubliable" className={className} />;
}
