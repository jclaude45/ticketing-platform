/** Service cards of the « Services » page: big outline icon, title, text, quote link */

import {
  ArrowRight, Banknote, BarChart3, Contact, Fence, Monitor, Printer, QrCode, ScanLine, ShieldCheck, Smartphone, Megaphone, Store, Ticket, UserCheck,
} from 'lucide-react';
import { QuoteButton } from './QuoteButton';
import type { Service } from './services';

/** Wristband: no such icon in lucide */
function WristbandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {/* Open band seen from above: outer edge, inner edge, thickness, then the tag with its QR */}
      <ellipse cx="12" cy="9" rx="9.5" ry="4.6" />
      <ellipse cx="12" cy="9" rx="7.6" ry="3.2" />
      <path d="M2.5 9v2.2c0 2.5 4.3 4.6 9.5 4.6s9.5-2.1 9.5-4.6V9" />
      <rect x="8.6" y="13.4" width="6.8" height="6.4" rx="1" />
      <path d="M10.4 15.2h1.3v1.3h-1.3zM12.3 17.1h1.3v1.3h-1.3zM12.3 15.2h1.3M10.4 18.4h1.3" />
    </svg>
  );
}

export const SERVICE_ICONS: Record<string, React.ReactNode> = {
  planification: (
    <span className="relative inline-flex">
      <Monitor className="h-[110px] w-[120px]" strokeWidth={1.6} />
      <BarChart3 className="absolute left-[38px] top-[22px] h-9 w-11" strokeWidth={2.2} />
    </span>
  ),
  billetterie: (
    <span className="inline-flex items-center">
      <Ticket className="h-[90px] w-[90px] -rotate-12" strokeWidth={1.4} />
      <Banknote className="-ml-4 mt-10 h-14 w-14" strokeWidth={1.8} />
    </span>
  ),
  zcontrole: (
    <span className="inline-flex items-center">
      <ScanLine className="h-[100px] w-[80px]" strokeWidth={1.5} />
      <Ticket className="-ml-1 h-14 w-14 -rotate-12" strokeWidth={2} />
    </span>
  ),
  'experts-controle': (
    <span className="inline-flex items-center">
      <UserCheck className="h-[100px] w-[100px]" strokeWidth={1.4} />
      <QrCode className="-ml-3 mt-12 h-10 w-10" strokeWidth={2} />
    </span>
  ),
  'securite-barricades': (
    <span className="inline-flex items-end">
      <ShieldCheck className="h-[100px] w-[90px]" strokeWidth={1.4} />
      <Fence className="-ml-3 h-14 w-14" strokeWidth={1.8} />
    </span>
  ),
  'impression-billets': (
    <span className="relative inline-flex">
      <Printer className="h-[110px] w-[110px]" strokeWidth={1.4} />
      <QrCode className="absolute bottom-[14px] left-[38px] h-8 w-8" strokeWidth={2} />
    </span>
  ),
  bracelets: <WristbandIcon className="h-[110px] w-[110px]" />,
  badges: <Contact className="h-[100px] w-[100px]" strokeWidth={1.3} />,
  terminaux: <Store className="h-[100px] w-[100px]" strokeWidth={1.4} />,
  'terminaux-controle': (
    <span className="relative inline-flex">
      <Smartphone className="h-[110px] w-[90px]" strokeWidth={1.4} />
      <QrCode className="absolute left-[29px] top-[34px] h-8 w-8" strokeWidth={2} />
    </span>
  ),
  'activation-ventes': (
    <span className="inline-flex items-end">
      <Megaphone className="h-[100px] w-[100px]" strokeWidth={1.4} />
      <Ticket className="-ml-4 h-12 w-12 -rotate-12" strokeWidth={2} />
    </span>
  ),
};

export function ServiceCard({ service }: { service: Service }) {
  return (
    <div id={service.slug} className="flex w-full max-w-[280px] scroll-mt-28 flex-col items-center text-center sm:w-[250px]">
      <div className="flex h-[120px] items-center justify-center text-black">{SERVICE_ICONS[service.slug]}</div>
      <h3 className="mt-6 text-[27px] font-normal leading-[1.05] tracking-normal text-black">{service.title}</h3>
      <p className="mt-3 flex-1 text-sm leading-[1.7] text-[#222]">{service.text}</p>
      {service.group === 'terrain' && (
        <QuoteButton service={service.name} className="mt-5 inline-flex items-center gap-1.5 border-b border-black pb-0.5 text-sm font-semibold uppercase text-black transition-opacity hover:opacity-70">
          Demander un devis <ArrowRight className="h-4 w-4" />
        </QuoteButton>
      )}
    </div>
  );
}
