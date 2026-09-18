import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import {
  Ticket, QrCode, BarChart3, Users, Smartphone, Shield,
  CheckCircle, ArrowRight, Star, Zap, Globe, HeartHandshake,
  Music2, Briefcase, GraduationCap, Utensils, Trophy, Church,
  ChevronRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'ZAYA — Billetterie en ligne simple et puissante',
  description:
    'Créez votre billetterie en quelques minutes, vendez des billets en ligne, gérez vos participants et contrôlez les accès. La plateforme événementielle tout-en-un.',
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zaya.live';

const STATS = [
  { value: '500+', label: 'Événements organisés' },
  { value: '50 000+', label: 'Billets vendus' },
  { value: '99,9 %', label: 'Disponibilité' },
  { value: '< 2 min', label: 'Pour créer un événement' },
];

const FEATURES = [
  {
    icon: <Ticket className="h-6 w-6 text-indigo-500" />,
    title: 'Billetterie personnalisée',
    desc: 'Créez plusieurs types de billets, définissez les tarifs et les quantités. Vos billets portent votre marque avec des templates sur mesure.',
  },
  {
    icon: <QrCode className="h-6 w-6 text-purple-500" />,
    title: "Contrôle d'accès QR",
    desc: "Chaque billet génère un QR code unique. Scannez à l'entrée depuis n'importe quel smartphone, en temps réel.",
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-emerald-500" />,
    title: 'Tableau de bord analytique',
    desc: 'Suivez vos ventes, le taux de remplissage et les revenus en direct. Exportez vos données en un clic.',
  },
  {
    icon: <Users className="h-6 w-6 text-rose-500" />,
    title: 'Gestion des équipes',
    desc: 'Invitez collaborateurs et bénévoles, attribuez des rôles et badges personnalisés. Coordination simplifiée.',
  },
  {
    icon: <Smartphone className="h-6 w-6 text-amber-500" />,
    title: 'Paiement mobile',
    desc: 'Acceptez Mobile Money (M-Pesa, Airtel, Orange) et cartes bancaires. Vos participants paient comme ils le souhaitent.',
  },
  {
    icon: <Shield className="h-6 w-6 text-sky-500" />,
    title: 'Sécurité & conformité',
    desc: 'Données hébergées en sécurité, HTTPS, QR codes infalsifiables. RGPD respecté, billets protégés contre la fraude.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Créez votre événement',
    desc: 'Renseignez les informations, ajoutez une bannière et configurez vos types de billets avec les tarifs.',
  },
  {
    num: '02',
    title: 'Partagez votre billetterie',
    desc: "Copiez votre lien unique et partagez-le sur vos réseaux sociaux, WhatsApp ou site web.",
  },
  {
    num: '03',
    title: "Gérez & accueillez",
    desc: "Suivez les ventes en temps réel et scannez les QR codes à l'entrée pour un accueil fluide.",
  },
];

const SECTORS = [
  { icon: <Music2 className="h-5 w-5" />, label: 'Concerts & Festivals' },
  { icon: <Briefcase className="h-5 w-5" />, label: 'Conférences' },
  { icon: <GraduationCap className="h-5 w-5" />, label: 'Formations' },
  { icon: <Utensils className="h-5 w-5" />, label: 'Galas & Soirées' },
  { icon: <Trophy className="h-5 w-5" />, label: 'Compétitions sportives' },
  { icon: <Church className="h-5 w-5" />, label: 'Événements religieux' },
  { icon: <Globe className="h-5 w-5" />, label: 'Foires & Expositions' },
  { icon: <HeartHandshake className="h-5 w-5" />, label: 'Associations & ONG' },
];

const TESTIMONIALS = [
  {
    name: 'Marie K.',
    role: 'Organisatrice de festivals',
    text: "ZAYA a transformé notre façon de gérer les entrées. Plus de files d'attente, tout est fluide depuis le scan QR.",
    stars: 5,
  },
  {
    name: 'Jean-Pierre M.',
    role: 'Responsable événements corporate',
    text: 'Interface intuitive, support réactif. On a vendu 300 billets en 48h pour notre conférence.',
    stars: 5,
  },
  {
    name: 'Fatou D.',
    role: 'Coordinatrice ONG',
    text: 'Les billets gratuits sont parfaits pour nos événements communautaires. Simple, rapide, efficace.',
    stars: 5,
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
      ))}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <Image src="/zaya-logo.svg" alt="ZAYA" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-extrabold tracking-tight">ZAYA</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-300">
            <Link href="#fonctionnalites" className="hover:text-indigo-600 transition-colors">Fonctionnalités</Link>
            <Link href="#comment-ca-marche" className="hover:text-indigo-600 transition-colors">Comment ça marche</Link>
            <Link href="#secteurs" className="hover:text-indigo-600 transition-colors">Secteurs</Link>
            <Link href="/billetterie" className="hover:text-indigo-600 transition-colors">Événements</Link>
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={`${APP_URL}/auth/login`}
              className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 transition-colors"
            >
              Se connecter
            </a>
            <a
              href={`${APP_URL}/auth/register`}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Créer mon événement
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-950 dark:to-indigo-950 pt-20 pb-28 px-4">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-200/30 dark:bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-800 rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-6">
            <Zap className="h-3.5 w-3.5" />
            Billetterie en ligne — Gratuit pour démarrer
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight text-gray-900 dark:text-white mb-6">
            Créez, vendez et gérez<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              vos événements
            </span>{' '}
            en quelques minutes
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            La plateforme tout-en-un pour organiser des événements, vendre des billets en ligne,
            gérer vos équipes et contrôler les accès par QR code.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={`${APP_URL}/auth/register`}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-base font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40"
            >
              Créer ma billetterie gratuitement
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/billetterie"
              className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-base font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Voir les événements
            </Link>
          </div>

          <p className="mt-6 text-xs text-gray-400">
            Aucune carte bancaire requise · Événements gratuits sans commission
          </p>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 bg-white dark:bg-gray-950 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map(s => (
              <div key={s.label}>
                <p className="text-3xl sm:text-4xl font-black text-indigo-600 dark:text-indigo-400 mb-1">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="fonctionnalites" className="py-24 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-4">
              Tout ce qu&apos;il vous faut pour réussir votre événement
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
              De la création à l&apos;accueil des participants, ZAYA couvre chaque étape de votre organisation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="comment-ca-marche" className="py-24 px-4 bg-white dark:bg-gray-950">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-4">
              Lancez-vous en 3 étapes
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              Votre billetterie en ligne en moins de 5 minutes.
            </p>
          </div>

          <div className="relative space-y-8">
            <div className="absolute left-7 top-10 bottom-10 w-0.5 bg-gradient-to-b from-indigo-200 to-purple-200 dark:from-indigo-800 dark:to-purple-800 hidden md:block" />

            {STEPS.map((step, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="relative flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40">
                  <span className="text-white font-black text-lg">{step.num}</span>
                </div>
                <div className="flex-1 pt-2">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{step.title}</h3>
                  <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <a
              href={`${APP_URL}/auth/register`}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-base hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40"
            >
              Commencer maintenant — c&apos;est gratuit
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 px-4 bg-gradient-to-br from-indigo-600 to-purple-700">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Ils font confiance à ZAYA
            </h2>
            <p className="text-indigo-100 text-lg">
              Des organisateurs de toutes tailles partagent leur expérience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div
                key={t.name}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
              >
                <StarRating count={t.stars} />
                <p className="mt-4 text-white/90 text-sm leading-relaxed italic">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{t.name}</p>
                    <p className="text-indigo-200 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sectors ── */}
      <section id="secteurs" className="py-24 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-4">
            Pour tous types d&apos;événements
          </h2>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-12">
            Petites soirées comme grands festivals — ZAYA s&apos;adapte à chaque format.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {SECTORS.map(s => (
              <div
                key={s.label}
                className="flex flex-col items-center gap-2.5 p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                  {s.icon}
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-center leading-snug">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-24 px-4 bg-white dark:bg-gray-950">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-4">
            Transparent sur les tarifs
          </h2>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-10">
            Aucune surprise. Vous ne payez que quand vous vendez.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border-2 border-gray-100 dark:border-gray-800 p-8 text-left">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Événements gratuits</p>
              <p className="text-4xl font-black text-gray-900 dark:text-white mb-2">0 %</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Zéro commission sur les billets gratuits.</p>
              <ul className="space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
                {['Billets illimités', 'QR code inclus', 'Tableau de bord'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border-2 border-indigo-500 p-8 text-left relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">Populaire</div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">Événements payants</p>
              <p className="text-4xl font-black text-gray-900 dark:text-white mb-2">
                2,5 % <span className="text-lg font-medium text-gray-400">/ billet</span>
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Commission uniquement sur les ventes réalisées.</p>
              <ul className="space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
                {['Mobile Money & carte', 'Paiements sécurisés', 'Exports & rapports', 'Support prioritaire'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-gray-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-4">
            Prêt à lancer votre prochain événement ?
          </h2>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-10">
            Rejoignez les organisateurs qui font confiance à ZAYA.
          </p>
          <a
            href={`${APP_URL}/auth/register`}
            className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-xl shadow-indigo-200 dark:shadow-indigo-900/50"
          >
            Créer mon compte gratuitement
            <ChevronRight className="h-5 w-5" />
          </a>
          <p className="mt-4 text-sm text-gray-400">
            Déjà un compte ?{' '}
            <a href={`${APP_URL}/auth/login`} className="text-indigo-600 hover:underline font-medium">
              Se connecter
            </a>
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-400 py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2.5">
                <Image src="/zaya-logo.svg" alt="ZAYA" width={32} height={32} className="rounded-lg" />
                <span className="text-white font-extrabold text-lg">ZAYA</span>
              </div>
              <p className="text-sm leading-relaxed">
                La plateforme de billetterie simple et puissante pour tous vos événements.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Produit</p>
              <ul className="space-y-2.5 text-sm">
                <li><Link href="#fonctionnalites" className="hover:text-white transition-colors">Fonctionnalités</Link></li>
                <li><Link href="#comment-ca-marche" className="hover:text-white transition-colors">Comment ça marche</Link></li>
                <li><Link href="#secteurs" className="hover:text-white transition-colors">Secteurs</Link></li>
                <li><Link href="/billetterie" className="hover:text-white transition-colors">Événements publics</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Organisateurs</p>
              <ul className="space-y-2.5 text-sm">
                <li><a href={`${APP_URL}/auth/register`} className="hover:text-white transition-colors">Créer un compte</a></li>
                <li><a href={`${APP_URL}/auth/login`} className="hover:text-white transition-colors">Se connecter</a></li>
                <li><a href={`${APP_URL}/dashboard`} className="hover:text-white transition-colors">Tableau de bord</a></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Légal</p>
              <ul className="space-y-2.5 text-sm">
                <li><Link href="/cgu" className="hover:text-white transition-colors">CGU</Link></li>
                <li><Link href="/politique-de-confidentialite" className="hover:text-white transition-colors">Confidentialité</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <p>© {new Date().getFullYear()} ZAYA. Tous droits réservés.</p>
            <p>Paiements sécurisés · HTTPS · RGPD</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
