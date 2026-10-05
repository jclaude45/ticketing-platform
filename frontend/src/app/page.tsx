import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { ChevronsDown } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ContactSection } from '@/components/site/ContactSection';
import { QuoteButton } from '@/components/site/QuoteButton';
import { HeroAnimation } from '@/components/site/HeroAnimation';
import { SERVICES } from '@/components/site/services';
import { APP_URL, SITE_URL } from '@/components/site/site-config';
import { cn } from '@/lib/utils';
import { PRINT_PLANS, SALES_FEE, UNIT_PRICES, type PrintPlan } from '@/components/site/pricing';

export const metadata: Metadata = pageMeta({
  title: 'ZAYA — Billetterie en ligne et gestion d’événements en RDC',
  absoluteTitle: true,
  description:
    'Créez votre événement, vendez vos billets en ligne (Mobile Money, carte) et en cash, contrôlez les entrées par QR code. La plateforme événementielle tout-en-un, à Kinshasa et partout en RDC.',
  path: '/',
});


// ─── Pricing ──────────────────────────────────────────────────────────────────

function PriceCard({ plan }: { plan: PrintPlan }) {
  return (
    <div className="flex flex-col">
      <div className={cn('mb-6 flex h-[26px] items-center justify-center rounded-lg text-[15px] uppercase', plan.highlight ? 'bg-black text-white' : 'invisible lg:block')}>
        {plan.highlight && 'Le plus choisi'}
      </div>
      <div className="flex flex-1 flex-col bg-[#F7F7F7]">
        <div className="rounded-[32px] bg-[#181818] px-6 pb-12 pt-12 text-center text-white">
          <p className="text-[32px] tracking-wide">{plan.name}</p>
          <p className="mt-4 text-[80px] font-light leading-none tracking-tight sm:text-[96px]">{plan.price}</p>
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

/** schema.org: who runs ZAYA and the site itself, for the search engines' knowledge panels */
const ORGANIZATION_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'ZAYA',
      legalName: 'BACK2NEXT',
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      email: 'contact@zaya.live',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '10, avenue Katakokombe, Q/Joli Parc',
        addressLocality: 'Kinshasa',
        addressRegion: 'Ngaliema',
        addressCountry: 'CD',
      },
      areaServed: 'CD',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'ZAYA',
      url: SITE_URL,
      inLanguage: 'fr',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-white text-black">
      <SiteHeader variant="landing" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_LD) }} />

      {/* ── Animated banner (white like the page) ── */}
      <section id="accueil" className="relative flex h-[calc(100svh-72px)] flex-col lg:h-[calc(100svh-76px)]">
        {/* Fills the screen under the header; the words span the whole width */}
        <HeroAnimation fitWidth className="min-h-0 w-full flex-1" />
        <a href="#intro" aria-label="Défiler" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[#555] transition-colors hover:text-black">
          <ChevronsDown className="h-9 w-9 animate-bounce" strokeWidth={2} />
        </a>
      </section>

      {/* ── Headline ── */}
      <section id="intro" className="px-6 pb-24 pt-10 text-center lg:pb-32 lg:pt-16">
        <h1 className="t-display mx-auto max-w-[860px]">
          Transformez vos événements en expériences inoubliables&nbsp;!
        </h1>
        <p className="t-lead mx-auto mt-10 max-w-[560px] text-[#222]">
          Plonge dans l&apos;extraordinaire avec Zaya, la plateforme qui transforme chaque événement en une
          aventure mémorable&nbsp;! Prépare-toi à vivre une expérience où chaque détail est pensé pour t&apos;émerveiller.
        </p>
        <a href={`${APP_URL}/auth/register`} className="mt-14 inline-block rounded-full bg-black px-5 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85">
          Créez un événement
        </a>
      </section>

      {/* ── Services (summary; the full list is on /services) ── */}
      <section id="services" className="scroll-mt-20 px-6 pb-24 lg:pb-32">
        {/* Old links to #fonctionnalites land here too */}
        <span id="fonctionnalites" className="block scroll-mt-20" aria-hidden="true" />
        <div className="mx-auto max-w-[900px] text-center">
          <h2 className="t-title">
            Nos services pour organisateurs
          </h2>
          <p className="t-lead mt-4 text-[#222]">
            12 ans d’expérience sur le terrain, avec des partenaires parmi les meilleurs dans leur domaine.
          </p>
        </div>
        <ul className="mx-auto mt-12 flex max-w-[900px] flex-wrap justify-center gap-3">
          {SERVICES.map(s => (
            <li key={s.slug}>
              <a href={`/services#${s.slug}`} className="inline-block rounded-full border border-[#c9c9c9] px-4 py-2 text-[15px] text-black transition-colors hover:border-black">
                {s.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href="/services" className="inline-block rounded-full bg-black px-6 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85">
            Découvrir nos services
          </a>
          <QuoteButton className="inline-block rounded-full border border-black px-6 py-3 text-lg uppercase text-black transition-colors hover:bg-black hover:text-white">
            Demander un devis
          </QuoteButton>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="tarifs" className="scroll-mt-20 px-6 pb-28 lg:pb-36">
        <div className="mx-auto max-w-[620px] text-center">
          <h2 className="t-title">Tarifs</h2>
          <p className="t-lead mt-4 text-[#222]">
            La billetterie en ligne est gratuite. Vous ne payez que ce que vous imprimez — et {SALES_FEE} sur les billets que vous vendez,
            frais de paiement compris.
          </p>
        </div>
        <div className="mx-auto mt-14 grid max-w-[1150px] grid-cols-1 gap-8 sm:max-w-[400px] lg:mt-20 lg:max-w-[1150px] lg:grid-cols-3 lg:gap-6">
          {PRINT_PLANS.map(p => <PriceCard key={p.name} plan={p} />)}
        </div>
        <p className="t-lead mx-auto mt-12 max-w-[620px] text-center text-[#222]">
          Un seul événement ? {UNIT_PRICES.ticket} le billet et {UNIT_PRICES.badge} le badge, sans engagement.
        </p>
        <div className="mt-8 text-center">
          <a href="/tarifs" className="inline-block rounded-full border border-black px-6 py-3 text-lg uppercase text-black transition-colors hover:bg-black hover:text-white">
            Tous les détails des tarifs
          </a>
        </div>
      </section>

      <ContactSection />

      <SiteFooter />
    </div>
  );
}
