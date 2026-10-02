import Image from 'next/image';
import type { Metadata } from 'next';
import { ChevronsDown, Monitor, Printer, Lock, ScanLine, Ticket, Store, Bot, BarChart3, QrCode } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ContactForm } from '@/components/site/ContactForm';
import { APP_URL } from '@/components/site/site-config';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'ZAYA — Transformez vos événements en expériences inoubliables',
  description:
    'Créez votre événement, vendez vos billets en ligne et en cash, contrôlez les entrées par QR code. La plateforme événementielle tout-en-un.',
};

// Pricing comes from the plans managed in the admin: refreshed every 5 minutes
export const revalidate = 300;

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

interface Plan {
  id: string; name: string; price: number;
  maxTickets: number; maxBadges: number; maxEvents: number;
  showPoweredBy: boolean; allowBulkExport: boolean; allowCommunication: boolean;
}
type PlanCard = { name: string; price: number; features: { label: string; included: boolean }[] };

const FALLBACK_PLANS: PlanCard[] = [
  {
    name: 'Standard', price: 0,
    features: [
      { label: 'Événement en ligne', included: true },
      { label: 'Billetterie en ligne et billets à QR code', included: true },
      { label: 'Paiement Mobile Money et carte', included: true },
      { label: 'Campagnes email et SMS', included: false },
      { label: 'Export des données', included: false },
    ],
  },
  {
    name: 'Professionnel', price: 16,
    features: [
      { label: 'Événement en ligne', included: true },
      { label: 'Billetterie en ligne et billets à QR code', included: true },
      { label: 'Paiement Mobile Money et carte', included: true },
      { label: 'Campagnes email et SMS', included: true },
      { label: 'Export des données', included: true },
    ],
  },
  {
    name: 'Business', price: 120,
    features: [
      { label: 'Événement en ligne', included: true },
      { label: 'Billetterie en ligne et billets à QR code', included: true },
      { label: 'Campagnes email et SMS', included: true },
      { label: 'Export des données', included: true },
      { label: 'Sans la mention « Powered by ZAYA »', included: true },
    ],
  },
];

const count = (n: number, one: string, many: string) =>
  n < 0 ? `${many.charAt(0).toUpperCase()}${many.slice(1)} illimités` : `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

function toCard(p: Plan): PlanCard {
  return {
    name: p.name,
    price: p.price,
    features: [
      { label: count(p.maxEvents, 'événement', 'événements'), included: true },
      { label: `${count(p.maxTickets, 'billet', 'billets')} par événement`, included: true },
      { label: count(p.maxBadges, "badge d'accréditation", "badges d'accréditation"), included: p.maxBadges !== 0 },
      { label: 'Campagnes email et SMS', included: p.allowCommunication },
      { label: 'Export des données', included: p.allowBulkExport },
      { label: 'Sans la mention « Powered by ZAYA »', included: !p.showPoweredBy },
    ],
  };
}

async function getPlans(): Promise<PlanCard[]> {
  const base = (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/public/plans`, { next: { revalidate: 300 } });
    if (!res.ok) return FALLBACK_PLANS;
    const body = await res.json();
    const plans: Plan[] = Array.isArray(body) ? body : body?.data ?? [];
    return plans.length > 0 ? plans.map(toCard) : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}

function PriceCard({ plan, popular }: { plan: PlanCard; popular: boolean }) {
  const whole = Math.floor(plan.price);
  const cents = Math.round((plan.price - whole) * 100);
  return (
    <div className="flex flex-col">
      <div className={cn('mb-6 flex h-[26px] items-center justify-center rounded-lg text-[15px] uppercase', popular ? 'bg-black text-white' : 'invisible lg:block')}>
        {popular && 'Le plus populaire'}
      </div>
      <div className="flex flex-1 flex-col bg-[#F7F7F7]">
        <div className="rounded-[32px] bg-[#181818] px-6 pb-14 pt-14 text-center text-white sm:pb-[70px]">
          <p className="text-[32px] font-normal tracking-wide sm:text-[34px]">{plan.name}</p>
          <p className="mt-4 flex items-start justify-center font-light leading-none">
            <span className="mt-4 text-3xl font-normal">$</span>
            <span className="text-[110px] tracking-tight sm:text-[128px]">{whole}</span>
            {cents > 0 && <span className="mt-4 text-3xl">,{String(cents).padStart(2, '0')}</span>}
            <span className="mt-auto pb-3 text-xl font-normal uppercase">/mois</span>
          </p>
        </div>
        <ul className="flex-1">
          {plan.features.map((f, i) => (
            <li key={i} className={cn(
              'border-b border-[#d0d0d0] px-11 py-7 text-[17px] font-semibold last:border-b-0',
              f.included ? 'text-[#4a4a4a]' : 'text-[#b3b3b3]',
            )}>
              {f.label}
            </li>
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

export default async function LandingPage() {
  const plans = await getPlans();
  const popularIndex = plans.length >= 3 ? 1 : -1;

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
        <div className="mx-auto max-w-[520px] text-center">
          <h2 className="text-5xl font-black uppercase tracking-tight">Tarifs</h2>
          <p className="mt-2 text-lg leading-snug text-[#222]">
            Des forfaits adaptés à toutes les tailles d&apos;événements. Des options flexibles qui permettent à chaque
            organisateur de trouver la formule idéale pour son événement, sans frais cachés.
          </p>
        </div>
        <div className={cn(
          'mx-auto mt-14 grid max-w-[1150px] grid-cols-1 gap-8 sm:max-w-[400px] lg:mt-24 lg:max-w-[1150px] lg:gap-6',
          plans.length >= 3 ? 'lg:grid-cols-3' : plans.length === 2 ? 'lg:max-w-[760px] lg:grid-cols-2' : 'lg:max-w-[380px]',
        )}>
          {plans.map((p, i) => <PriceCard key={p.name} plan={p} popular={i === popularIndex} />)}
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
