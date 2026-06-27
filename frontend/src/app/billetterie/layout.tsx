import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ZAYA Billetterie — Vos billets en ligne',
  description: 'Découvrez et achetez vos billets pour les meilleurs événements : concerts, conférences, festivals et plus encore.',
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zaya.live';

export default function BilletterieLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">

      {/* Navbar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200/70 dark:border-gray-800/70 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/billetterie" className="flex items-center gap-2.5 flex-shrink-0">
            <img src="/zaya-logo.svg" alt="ZAYA" className="w-8 h-8 rounded-lg" />
            <span className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">ZAYA</span>
            <span className="hidden sm:block text-xs font-medium text-gray-400 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5">Billetterie</span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Link href="/billetterie" className="hover:text-gray-900 dark:hover:text-white transition-colors">Événements</Link>
          </nav>

          {/* CTA */}
          <a
            href={`${APP_URL}/auth/login`}
            className="flex-shrink-0 text-sm font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm"
          >
            Espace organisateur
          </a>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="mt-20 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <img src="/zaya-logo.svg" alt="ZAYA" className="w-7 h-7 rounded-lg" />
                <span className="font-extrabold text-gray-900 dark:text-white">ZAYA</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                La plateforme de billetterie en ligne simple et sécurisée pour tous vos événements.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Billetterie</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/billetterie" className="hover:text-indigo-600 transition-colors">Tous les événements</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Organisateurs</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href={`${APP_URL}/auth/register`} className="hover:text-indigo-600 transition-colors">Créer un compte</a></li>
                <li><a href={`${APP_URL}/auth/login`} className="hover:text-indigo-600 transition-colors">Se connecter</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-gray-400">© {new Date().getFullYear()} ZAYA. Tous droits réservés.</p>
            <p className="text-xs text-gray-400">Paiements sécurisés via FlexPay</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
