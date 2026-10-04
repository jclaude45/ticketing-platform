'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { ZayaLogo } from './ZayaLogo';
import { StoreButtons } from './StoreButtons';
import { APP_URL, SOCIAL_LINKS } from './site-config';
import { openCookieSettings } from '@/components/CookieBanner';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Zaya',
    links: [
      { label: 'A propos', href: '/' },
      { label: 'Organisateur', href: `${APP_URL}/auth/register` },
      { label: 'Partenariats', href: '/#contact' },
      { label: 'Presse', href: '/#contact' },
    ],
  },
  {
    title: 'Assistance',
    links: [
      { label: "Centre d'Assistance", href: '/#contact' },
      { label: 'Contactez-nous', href: '/#contact' },
      { label: 'Demander un remboursement', href: '/cgv#annulation' },
      { label: 'Tutoriels', href: '/#fonctionnalites' },
    ],
  },
];

const SOCIAL_ICONS: { key: keyof typeof SOCIAL_LINKS; label: string; path: string }[] = [
  { key: 'tiktok', label: 'TikTok', path: 'M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5A2.59 2.59 0 0 1 7.27 15.3a2.6 2.6 0 0 1 3.4-2.47V9.67A5.73 5.73 0 0 0 4.18 15.3a5.7 5.7 0 0 0 5.68 5.7 5.7 5.7 0 0 0 5.68-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z' },
  { key: 'youtube', label: 'YouTube', path: 'M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z' },
  { key: 'instagram', label: 'Instagram', path: 'M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2.2A3.4 3.4 0 0 0 4.2 7.6v8.8a3.4 3.4 0 0 0 3.4 3.4h8.8a3.4 3.4 0 0 0 3.4-3.4V7.6a3.4 3.4 0 0 0-3.4-3.4H7.6ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm5.25-3.7a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z' },
  { key: 'facebook', label: 'Facebook', path: 'M20 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8.6v-7.7H10v-3h2.6V9.1c0-2.6 1.6-4 3.9-4 1.1 0 2.1.1 2.3.1v2.7h-1.6c-1.3 0-1.5.6-1.5 1.5v1.9h3l-.4 3h-2.6V22H20a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z' },
  { key: 'linkedin', label: 'LinkedIn', path: 'M20 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM8 19H5V9.5h3V19ZM6.5 8.2a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5ZM19 19h-3v-4.6c0-1.1 0-2.5-1.5-2.5S12.8 13 12.8 14.3V19h-3V9.5h2.9v1.3h.04a3.2 3.2 0 0 1 2.86-1.57c3.06 0 3.4 2 3.4 4.6V19Z' },
];

/** Footer of the public site: logo, app buttons, link columns (accordions on phones), legal line */
export function SiteFooter() {
  return (
    <footer id="telecharger" className="mx-auto w-full max-w-[1366px] px-6 pb-10 pt-16 lg:px-[140px]">
      <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
        <div className="flex flex-col justify-between gap-8">
          <ZayaLogo className="text-[34px]" />
          <StoreButtons className="hidden lg:flex" />
        </div>

        {/* Desktop: columns */}
        <div className="hidden gap-[70px] lg:flex">
          {COLUMNS.map(col => (
            <div key={col.title} className="space-y-6">
              <p className="text-[17px] font-medium text-black">{col.title}</p>
              <ul className="space-y-6">
                {col.links.map(l => (
                  <li key={l.label}><a href={l.href} className="text-[17px] text-[#1a1a1a] hover:underline underline-offset-4">{l.label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Phones: accordions */}
        <div className="lg:hidden">
          {COLUMNS.map(col => (
            <details key={col.title} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[17px] text-black [&::-webkit-details-marker]:hidden">
                {col.title}
                <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="space-y-3 pb-1 pt-4">
                {col.links.map(l => (
                  <li key={l.label}><a href={l.href} className="text-[15px] text-[#444]">{l.label}</a></li>
                ))}
              </ul>
            </details>
          ))}
          <StoreButtons className="mt-6" />
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-6 border-t border-black pt-8 lg:mt-8 lg:flex-row lg:items-center lg:justify-between">
        <p className="flex items-center gap-1.5 text-sm text-black">
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-black text-[10px] font-bold">C</span>
          Zaya {new Date().getFullYear()}
        </p>
        <nav className="flex flex-wrap gap-x-3 gap-y-2 text-sm text-[#1a1a1a]">
          <Link href="/politique-de-confidentialite" className="hover:underline">Politique de Confidentialité</Link>
          <Link href="/cgu" className="hover:underline">Conditions Générales d&apos;Utilisation</Link>
          <Link href="/cgv" className="hover:underline">Conditions Générales de Vente</Link>
          <button type="button" onClick={openCookieSettings} className="hover:underline">Paramètres des cookies</button>
        </nav>
        <div className="flex items-center gap-3">
          {SOCIAL_ICONS.map(s => {
            const icon = (
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden="true"><path d={s.path} /></svg>
            );
            const href = SOCIAL_LINKS[s.key];
            return href
              ? <a key={s.key} href={href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="text-black hover:opacity-70">{icon}</a>
              : <span key={s.key} aria-label={s.label} className="text-black">{icon}</span>;
          })}
        </div>
      </div>
    </footer>
  );
}
