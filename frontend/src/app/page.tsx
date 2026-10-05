import type { Metadata } from 'next';
import {
  ArrowRight, Banknote, BarChart3, Contact, Fence, Monitor, Printer, QrCode, ScanLine, ShieldCheck, Smartphone, Megaphone, Store, Ticket, UserCheck,
} from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ContactForm } from '@/components/site/ContactForm';
import { QuoteButton } from '@/components/site/QuoteButton';
import { HeroAnimation } from '@/components/site/HeroAnimation';
import { SERVICES, type Service } from '@/components/site/services';
import { APP_URL } from '@/components/site/site-config';
import { cn } from '@/lib/utils';
import { PRINT_PLANS, SALES_FEE, UNIT_PRICES, type PrintPlan } from '@/components/site/pricing';

export const metadata: Metadata = {
  title: 'ZAYA — Transformez vos événements en expériences inoubliables',
  description:
    'Créez votre événement, vendez vos billets en ligne et en cash, contrôlez les entrées par QR code. La plateforme événementielle tout-en-un.',
};


// ─── Services ─────────────────────────────────────────────────────────────────

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

const SERVICE_ICONS: Record<string, React.ReactNode> = {
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

function ServiceCard({ service }: { service: Service }) {
  return (
    <div className="flex w-full max-w-[280px] flex-col items-center text-center sm:w-[250px]">
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

// ─── Pricing ──────────────────────────────────────────────────────────────────

function PriceCard({ plan }: { plan: PrintPlan }) {
  return (
    <div className="flex flex-col">
      <div className={cn('mb-6 flex h-[26px] items-center justify-center rounded-lg text-[15px] uppercase', plan.highlight ? 'bg-black text-white' : 'invisible lg:block')}>
        {plan.highlight && 'Le plus choisi'}
      </div>
      <div className="flex flex-1 flex-col bg-[#F7F7F7]">
        <div className="rounded-[32px] bg-[#181818] px-6 pb-12 pt-12 text-center text-white">
          <p className="text-[32px] font-normal tracking-wide sm:text-[34px]">{plan.name}</p>
          <p className="mt-4 text-[96px] font-light leading-none tracking-tight sm:text-[110px]">{plan.price}</p>
          <p className="mt-3 text-sm uppercase text-white/70">{plan.priceNote}</p>
        </div>
        <ul className="flex-1">
          {plan.features.map(f => (
            <li key={f} className="border-b border-[#d0d0d0] px-11 py-6 text-[17px] font-semibold text-[#4a4a4a] last:border-b-0">{f}</li>
          ))}
        </ul>
        <a href={`${APP_URL}/auth/register`} className="block bg-black py-4 text-center text-xl font-semibold text-white transition-opacity hover:opacity-85">
          sélectionnez
        </a>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-white text-black">
      <SiteHeader variant="landing" />

      {/* ── Animated banner (square, white like the page) ── */}
      <section id="accueil" className="relative px-6">
        <HeroAnimation className="hero-fade mx-auto aspect-square w-full max-w-[560px] lg:max-w-[680px]" />
      </section>

      {/* ── Headline ── */}
      <section id="intro" className="px-6 pb-24 pt-10 text-center lg:pb-32 lg:pt-16">
        <h1 className="mx-auto max-w-[860px] text-[38px] font-black uppercase leading-[1.05] tracking-tight sm:text-6xl lg:text-[88px] lg:leading-[0.95]">
          Transformez vos événements en expériences inoubliables&nbsp;!
        </h1>
        <p className="mx-auto mt-10 max-w-[500px] text-lg leading-relaxed text-[#222]">
          Plonge dans l&apos;extraordinaire avec Zaya, la plateforme qui transforme chaque événement en une
          aventure mémorable&nbsp;! Prépare-toi à vivre une expérience où chaque détail est pensé pour t&apos;émerveiller.
        </p>
        <a href={`${APP_URL}/auth/register`} className="mt-14 inline-block rounded-full bg-black px-5 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85">
          Créez un événement
        </a>
      </section>

      {/* ── Services ── */}
      <section id="services" className="scroll-mt-20 px-6 pb-24 lg:pb-32">
        {/* Old links to #fonctionnalites land here too */}
        <span id="fonctionnalites" className="block scroll-mt-20" aria-hidden="true" />
        <div className="mx-auto max-w-[900px] text-center">
          <h2 className="text-[38px] font-black uppercase leading-[1.05] tracking-tight sm:text-6xl lg:text-[80px] lg:leading-[0.98]">
            Nos services pour organisateurs
          </h2>
          <p className="mt-3 text-xl text-[#222] lg:text-[21px]">De la vente des billets au contrôle des entrées, nous nous occupons de votre événement</p>
        </div>

        {/* Experience */}
        <div className="mx-auto mt-14 flex max-w-[820px] flex-col items-center gap-6 rounded-[32px] bg-[#181818] px-8 py-10 text-center text-white sm:flex-row sm:gap-10 sm:px-12 sm:text-left lg:mt-20">
          <p className="flex-shrink-0 leading-none">
            <span className="block text-[96px] font-black tracking-tight sm:text-[110px]">12</span>
            <span className="block text-lg uppercase tracking-[0.2em] text-white/70">ans d’expérience</span>
          </p>
          <p className="text-lg leading-relaxed text-white/90 sm:text-xl">
            Depuis 12 ans, nous accompagnons les organisateurs sur le terrain, aux côtés de partenaires parmi les meilleurs dans leur domaine :
            sécurité, impression, contrôle d’accès et vente.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-[1150px] lg:mt-24">
          <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#707070]">Sur la plateforme</h3>
          <div className="mt-10 flex flex-wrap justify-center gap-x-12 gap-y-16 lg:gap-y-20">
            {SERVICES.filter(s => s.group === 'plateforme').map(s => <ServiceCard key={s.slug} service={s} />)}
          </div>
          <div className="mt-12 text-center">
            <a href="/tarifs" className="inline-block rounded-full border border-black px-6 py-3 text-lg uppercase text-black transition-colors hover:bg-black hover:text-white">
              Voir les tarifs
            </a>
          </div>
        </div>

        <div className="mx-auto mt-24 max-w-[1150px] lg:mt-32">
          <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#707070]">Sur le terrain · sur devis</h3>
          <p className="mx-auto mt-3 max-w-[560px] text-center text-lg text-[#222]">
            Chaque événement est différent : ces services sont chiffrés selon votre date, votre lieu et votre public.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-x-12 gap-y-16 lg:gap-y-20">
            {SERVICES.filter(s => s.group === 'terrain').map(s => <ServiceCard key={s.slug} service={s} />)}
          </div>
        </div>

        <div className="mt-20 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <QuoteButton className="inline-block rounded-full bg-black px-6 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85">
            Demander un devis
          </QuoteButton>
          <a href="#contact" className="inline-block rounded-full border border-black px-6 py-3 text-lg uppercase text-black transition-colors hover:bg-black hover:text-white">
            Contacter l’équipe ZAYA
          </a>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="tarifs" className="scroll-mt-20 px-6 pb-28 lg:pb-36">
        <div className="mx-auto max-w-[620px] text-center">
          <h2 className="text-5xl font-black uppercase tracking-tight">Tarifs</h2>
          <p className="mt-3 text-lg leading-snug text-[#222]">
            La billetterie en ligne est gratuite. Vous ne payez que ce que vous imprimez — et {SALES_FEE} sur les billets que vous vendez,
            frais de paiement compris.
          </p>
        </div>
        <div className="mx-auto mt-14 grid max-w-[1150px] grid-cols-1 gap-8 sm:max-w-[400px] lg:mt-20 lg:max-w-[1150px] lg:grid-cols-3 lg:gap-6">
          {PRINT_PLANS.map(p => <PriceCard key={p.name} plan={p} />)}
        </div>
        <p className="mx-auto mt-12 max-w-[620px] text-center text-lg text-[#222]">
          Un seul événement ? {UNIT_PRICES.ticket} le billet et {UNIT_PRICES.badge} le badge, sans engagement.
        </p>
        <div className="mt-8 text-center">
          <a href="/tarifs" className="inline-block rounded-full border border-black px-6 py-3 text-lg uppercase text-black transition-colors hover:bg-black hover:text-white">
            Tous les détails des tarifs
          </a>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="scroll-mt-20 px-6 pb-20 lg:px-[108px]">
        <div className="mx-auto flex max-w-[1150px] flex-col gap-12 lg:flex-row lg:gap-[150px]">
          <div className="lg:w-[220px] lg:flex-shrink-0">
            <h2 className="text-[44px] font-light uppercase leading-[0.9] lg:text-5xl">Parle-nous</h2>
            <p className="mt-2 whitespace-nowrap text-lg">Prêt à passer au direct&nbsp;?</p>
          </div>
          <div className="w-full max-w-[610px]">
            <ContactForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
