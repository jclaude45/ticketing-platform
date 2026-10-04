import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { cn } from '@/lib/utils';

/** Company behind ZAYA, shown on every legal page */
export const COMPANY = {
  name: 'BACK2NEXT',
  rccm: 'CD/KNG/RCCM/26-B-03430',
  nif: 'A2636279N',
  address: '10, avenue Katakokombe, Quartier Joli Parc, Commune de Ngaliema, Kinshasa, République démocratique du Congo',
  email: 'contact@zaya.live',
};

/** Date shown at the top of the legal pages: update it with every change of the texts */
export const LEGAL_UPDATED = '4 octobre 2026';

export const LEGAL_PAGES = [
  { href: '/cgu', label: 'Conditions générales d’utilisation' },
  { href: '/cgv', label: 'Conditions générales de vente' },
  { href: '/politique-de-confidentialite', label: 'Politique de confidentialité' },
];

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** A legal page of zaya.live: title, table of contents, numbered sections */
export function LegalPage({ title, intro, sections, current }: { title: string; intro: React.ReactNode; sections: LegalSection[]; current: string }) {
  return (
    <div className="min-h-screen bg-white text-black">
      <SiteHeader variant="landing" />
      <main className="px-6 pb-24 pt-14 lg:pt-20">
        <div className="mx-auto max-w-[1100px]">
          <nav className="mb-10 flex flex-wrap gap-2 text-sm">
            {LEGAL_PAGES.map(p => (
              <Link
                key={p.href}
                href={p.href}
                className={cn('rounded-full border px-4 py-1.5 transition-colors',
                  p.href === current ? 'border-black bg-black text-white' : 'border-gray-300 text-[#333] hover:border-black')}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <h1 className="text-4xl font-black uppercase tracking-tight sm:text-6xl">{title}</h1>
          <p className="mt-3 text-sm text-[#555]">Dernière mise à jour : {LEGAL_UPDATED}</p>
          <div className="mt-8 max-w-[760px] text-lg leading-relaxed text-[#222]">{intro}</div>

          <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <p className="mb-3 text-xs uppercase tracking-[0.12em] text-[#777]">Sommaire</p>
              <ol className="space-y-2 text-sm">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-[#333] hover:text-black hover:underline underline-offset-4">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </aside>
            <div className="min-w-0 space-y-12">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-gray-200 pt-8">
                  <h2 className="text-2xl font-bold tracking-tight">{i + 1}. {s.title}</h2>
                  <div className="legal-body mt-4 space-y-4 text-[16px] leading-relaxed text-[#2a2a2a]">{s.body}</div>
                </section>
              ))}
              <p className="border-t border-gray-200 pt-8 text-sm text-[#555]">
                ZAYA est un service édité par {COMPANY.name}, RCCM {COMPANY.rccm}, NIF {COMPANY.nif}, {COMPANY.address}.
                Contact : <a href={`mailto:${COMPANY.email}`} className="underline">{COMPANY.email}</a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Bulleted list of the legal pages */
export function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}
