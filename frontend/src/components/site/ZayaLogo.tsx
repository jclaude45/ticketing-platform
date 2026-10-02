import { cn } from '@/lib/utils';

/** The Z of the logo (same path as /zaya-logo.svg) followed by the ZAYA wordmark */
export function ZayaLogo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-extrabold tracking-tight', light ? 'text-white' : 'text-black', className)}>
      <svg viewBox="249 248 503 505" className="h-[1em] w-[1em] flex-shrink-0" aria-hidden="true">
        <path
          fill="currentColor"
          d="M751.532 248.66L700.694 399.422L700.579 399.762H508.587L751.413 644.335L751.559 644.481V752.123H643.915L643.769 751.976L494.269 601.812L450.015 751.765L449.909 752.123H249L249.213 751.469L298.298 600.707L298.41 600.361H492.824L249.334 355.788L249.089 355.542L249.234 355.227L298.319 248.291L298.453 248H751.755L751.532 248.66Z"
        />
      </svg>
      <span className="leading-none">ZAYA</span>
    </span>
  );
}
