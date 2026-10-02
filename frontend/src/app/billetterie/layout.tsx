import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export const metadata: Metadata = {
  title: 'ZAYA Billetterie — Vos billets en ligne',
  description: 'Découvrez et achetez vos billets pour les meilleurs événements : concerts, conférences, festivals et plus encore.',
};

export default function BilletterieLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <SiteHeader variant="billetterie" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
