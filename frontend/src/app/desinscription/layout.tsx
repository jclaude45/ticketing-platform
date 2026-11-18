import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

/** Reached from the link at the bottom of campaign e-mails, never indexed */
export const metadata: Metadata = {
  title: 'Désinscription',
  robots: { index: false, follow: false },
};

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <SiteHeader variant="billetterie" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
