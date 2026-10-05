'use client';

import { requestQuote } from './services';

/** Goes to the "Parle-nous" form with the service already chosen (a plain link without JavaScript) */
export function QuoteButton({ service, className, children }: { service?: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={service ? `/services?service=${encodeURIComponent(service)}#contact` : '/services?devis=1#contact'}
      onClick={e => { e.preventDefault(); requestQuote(service); }}
      className={className}
    >
      {children}
    </a>
  );
}
