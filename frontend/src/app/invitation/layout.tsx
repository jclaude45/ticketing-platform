import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

/** A guest's own page: reached by the link of their invitation, never indexed */
export const metadata: Metadata = {
  title: 'Votre invitation',
  robots: { index: false, follow: false },
};

export default function InvitationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <SiteHeader variant="billetterie" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
