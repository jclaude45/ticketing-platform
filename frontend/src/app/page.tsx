import Image from 'next/image';
import type { Metadata } from 'next';
import { ChevronsDown, Monitor, Printer, Lock, ScanLine, Ticket, Store, Bot, BarChart3, QrCode } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ContactForm } from '@/components/site/ContactForm';
import { APP_URL } from '@/components/site/site-config';
import { cn } from '@/lib/utils';
import { PRINT_PLANS, SALES_FEE, UNIT_PRICES, type PrintPlan } from '@/components/site/pricing';

export const metadata: Metadata = {
  title: 'ZAYA — Transformez vos événements en expériences inoubliables',
  description:
    'Créez votre événement, vendez vos billets en ligne et en cash, contrôlez les entrées par QR code. La plateforme événementielle tout-en-un.',
};


// ─── Toolbox ──────────────────────────────────────────────────────────────────

const TOOLS: { icon: React.ReactNode; title: string; text: string }[] = [
  {
    icon: (
      <span className="relative inline-flex">
        <Monitor className="h-[110px] w-[120px]" strokeWidth={1.6} />
        <BarChart3 className="absolute left-[38px] top-[22px] h-9 w-11" strokeWidth={2.2} />
      </span>
    ),
    title: 'Planifiez comme un pro.',
    text: "Notre plateforme de bout en bout dispose de tous les outils dont vous avez besoin pour créer et gérer vos événements : types de billets personnalisés, équipes, tâches et budget.",
  },
  {
    icon: (
      <span className="relative inline-flex">
        <Printer className="h-[110px] w-[110px]" strokeWidth={1.4} />
        <QrCode className="absolute bottom-[14px] left-[38px] h-8 w-8" strokeWidth={2} />
      </span>
    ),
    title: "Vendez des billets en ligne, en cash, en un clin d'œil !",
    text: "Grâce aux ventes en temps réel, à l'attribution marketing et aux informations sur l'audience, vous pouvez planifier votre prochain événement en toute confiance.",
  },
  {
    icon: <Lock className="h-[100px] w-[100px]" strokeWidth={1.4} />,
    title: 'Sécurité à toute épreuve.',
    text: "En fonction de la taille de votre événement, nous avons conçu des solutions d'accès pour garantir que les fans puissent accéder à votre spectacle sans problème.",
  },
  {
    icon: (
      <span className="inline-flex items-center">
        <ScanLine className="h-[100px] w-[80px]" strokeWidth={1.5} />
        <Ticket className="-ml-1 h-14 w-14 -rotate-12" strokeWidth={2} />
      </span>
    ),
    title: 'zcontrole pour des entrées fluides.',
    text: "Notre application de contrôle transforme les smartphones de votre équipe en terminaux de scan : chaque billet est vérifié en une seconde, même sans connexion.",
  },
  {
    icon: <Store className="h-[100px] w-[100px]" strokeWidth={1.4} />,
    title: "Terminaux magiques pour des ventes à la vitesse de l'éclair.",
    text: 'Nous mettons à votre disposition des terminaux pour des ventes physiques en plusieurs guichets, idéaux pour les événements sur le terrain. Suivez vos ventes en temps réel.',
  },
  {
    icon: <Bot className="h-[100px] w-[100px]" strokeWidth={1.4} />,
    title: "L'accueil automatisé par Nicole notre Robot Hôtesse !",
    text: "Offrez une expérience futuriste avec notre Robot Hôtesse qui gère l'accueil des participants, les oriente et répond à leurs questions.",
  },
];

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

      {/* ── Hero picture (under the translucent header) ── */}
      <section id="accueil" className="relative -mt-[72px] h-[400px] overflow-hidden sm:h-[560px] lg:-mt-[76px] lg:h-[770px]">
        <Image src="/zaya-site/hero-ville.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent via-white/70 to-white" />
        <a href="#intro" aria-label="Défiler" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-[#555] sm:block">
          <ChevronsDown className="h-9 w-9 animate-bounce" strokeWidth={2} />
        </a>
      </section>

      {/* ── Headline ── */}
      <section id="intro" className="px-6 pb-24 pt-10 text-center lg:pb-32 lg:pt-36">
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

      {/* ── Toolbox ── */}
      <section id="fonctionnalites" className="scroll-mt-20 px-6 pb-24 lg:pb-32">
        <div className="mx-auto max-w-[900px] text-center">
          <h2 className="text-[38px] font-black uppercase leading-[1.05] tracking-tight sm:text-6xl lg:text-[80px] lg:leading-[0.98]">
            Notre boîte à outils pour organisateurs
          </h2>
          <p className="mt-3 text-xl text-[#222] lg:text-[21px]">Tout ce dont vous avez besoin pour vendre des billets de vos événements</p>
        </div>

        <div className="mx-auto mt-16 grid max-w-[920px] grid-cols-1 gap-x-16 gap-y-16 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3 lg:gap-y-20">
          {TOOLS.map(t => (
            <div key={t.title} className="flex flex-col items-center text-center">
              <div className="flex h-[120px] items-center justify-center text-black">{t.icon}</div>
              <h3 className="mt-6 max-w-[250px] text-[27px] font-normal leading-[1.05] tracking-normal text-black">{t.title}</h3>
              <p className="mt-3 max-w-[250px] text-sm leading-[1.7] text-[#222]">{t.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <a href={`${APP_URL}/auth/register`} className="inline-block rounded-full bg-black px-6 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85">
            Savoir plus
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
