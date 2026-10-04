'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ZayaLogo } from './ZayaLogo';
import { APP_URL } from './site-config';

type NavLink = { label: string; href: string };

const LANDING_LINKS: NavLink[] = [
  { label: 'Accueil', href: '/#accueil' },
  { label: 'Services', href: '/#services' },
  { label: 'Tarifs', href: '/tarifs' },
  { label: 'Billetterie', href: '/billetterie' },
  { label: 'Contact', href: '/#contact' },
];

const TICKETING_LINKS: NavLink[] = [
  { label: 'Event', href: '/billetterie' },
  { label: 'À propos', href: '/' },
  { label: 'Organisateurs', href: `${APP_URL}/auth/register` },
  { label: 'Partenaires', href: '/#contact' },
  { label: 'connecter', href: `${APP_URL}/auth/login` },
];

/**
 * Header of the public site. "landing": translucent bar over the hero picture, yellow
 * "Créer un événement" and outlined "Connecter"; "billetterie": white bar, black "Télécharger".
 */
export function SiteHeader({ variant }: { variant: 'landing' | 'billetterie' }) {
  const [open, setOpen] = useState(false);
  const links = variant === 'landing' ? LANDING_LINKS : TICKETING_LINKS;

  // The open menu covers the page: no scrolling behind it
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const actions = variant === 'landing' ? (
    <>
      <a href={`${APP_URL}/auth/register`} className="rounded-full bg-[#FFDD00] px-4 py-2.5 text-[15px] font-medium uppercase text-black transition-opacity hover:opacity-85">
        Créer un événement
      </a>
      <a href={`${APP_URL}/auth/login`} className="rounded-full border border-black px-4 py-2 text-[15px] uppercase text-black transition-colors hover:bg-black hover:text-white">
        Connecter
      </a>
    </>
  ) : (
    <a href="#telecharger" className="rounded-full bg-black px-12 py-2.5 text-[15px] uppercase text-white transition-opacity hover:opacity-85">
      Télécharger
    </a>
  );

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full',
        variant === 'landing' ? 'bg-white/75 backdrop-blur-md' : 'bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]',
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-[1366px] items-center justify-between gap-6 px-6 lg:h-[76px] lg:px-16">
        <Link href={variant === 'landing' ? '/' : '/billetterie'} aria-label="ZAYA — accueil">
          <ZayaLogo className="text-[26px] lg:text-[34px]" />
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-[#1a1a1a] lg:flex xl:gap-9">
          {links.map(l => (
            <a key={l.label} href={l.href} className="transition-colors hover:text-black hover:underline underline-offset-4">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-6 lg:flex">{actions}</div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white lg:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Rendered in <body>: the header's backdrop blur would otherwise confine this fixed
          panel to the header bar (a backdrop-filter makes it the containing block) */}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-white lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex h-[72px] items-center justify-between px-6">
            <ZayaLogo className="text-[26px]" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-6 pt-6">
            {links.map(l => (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)} className="border-b border-gray-100 py-4 text-2xl font-medium text-black">
                {l.label}
              </a>
            ))}
            <div className="flex flex-col items-start gap-4 py-8" onClick={() => setOpen(false)}>{actions}</div>
          </nav>
        </div>,
        document.body,
      )}
    </header>
  );
}
