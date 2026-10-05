import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export const metadata: Metadata = pageMeta({
  title: 'Billetterie : concerts, festivals, soirées et conférences en RDC',
  description:
    'Trouvez les prochains événements à Kinshasa et en RDC et achetez vos billets en ligne par Mobile Money ou carte. Billets envoyés par e-mail avec QR code.',
  path: '/billetterie',
});

export default function BilletterieLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <SiteHeader variant="billetterie" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
