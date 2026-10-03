'use client';

import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Flag of a country (ISO 3166-1 alpha-2 code) from /public/flags (country-flag-icons,
 * MIT); a globe when the country is unknown or has no flag.
 */
export function CountryFlag({ code, className }: { code: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  const valid = !!code && /^[A-Z]{2}$/.test(code.toUpperCase());

  if (!valid || failed) {
    return <Globe2 className={cn('h-3.5 w-[21px] flex-shrink-0 text-gray-400', className)} aria-hidden="true" />;
  }
  return (
    <img
      src={`/flags/${code!.toUpperCase()}.svg`}
      alt=""
      width={21}
      height={14}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('h-3.5 w-[21px] flex-shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)]', className)}
    />
  );
}
