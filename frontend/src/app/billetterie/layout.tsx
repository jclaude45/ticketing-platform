import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Billetterie — ZAYA',
  description: 'Achetez vos billets pour les événements à venir',
};

export default function BilleterieLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Public navbar */}
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/billetterie" className="flex items-center gap-2.5">
            <img src="/zaya-logo.svg" alt="ZAYA" className="w-8 h-8 rounded-lg" />
            <span className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">ZAYA</span>
          </Link>
          <Link
            href="/auth/login"
            className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Espace organisateur →
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-16 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center">
          <p className="text-sm text-gray-400">Propulsé par <strong className="text-gray-600 dark:text-gray-400">ZAYA</strong></p>
        </div>
      </footer>
    </div>
  );
}
