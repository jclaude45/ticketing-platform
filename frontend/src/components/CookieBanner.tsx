'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'zaya_cookie_consent';
const OPEN_EVENT = 'zaya:cookie-settings';

export type CookieConsent = 'accepted' | 'rejected' | null;

export function getCookieConsent(): CookieConsent {
  if (typeof window === 'undefined') return null;
  return (localStorage.getItem(STORAGE_KEY) as CookieConsent) ?? null;
}

/** Reopens the banner on its settings (footer link "Paramètres des cookies") */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
    const open = () => {
      setAnalytics(getCookieConsent() === 'accepted');
      setSettings(true);
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const respond = (choice: 'accepted' | 'rejected') => {
    const previous = getCookieConsent();
    localStorage.setItem(STORAGE_KEY, choice);
    setVisible(false);
    setSettings(false);
    // Analytics scripts start (or stop) on a fresh page load
    if (choice !== previous && (choice === 'accepted' || previous === 'accepted')) window.location.reload();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentement aux cookies"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white px-6 py-5 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] sm:px-7"
    >
      <div className="mx-auto flex max-w-[1366px] flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex-1 text-black">
          <div className="flex items-start justify-between gap-4">
            <p className="text-lg">A propos des cookies sur ce site</p>
            <button onClick={() => respond('rejected')} className="flex-shrink-0 pt-1 text-xs text-[#707070] underline underline-offset-2 hover:text-black">
              Continuer sans accepter
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-snug">
            Nous utilisons les cookies nécessaires au fonctionnement du service et, avec votre accord, des cookies
            pour analyser les performances et l&apos;utilisation du site et améliorer son contenu.{' '}
            <Link href="/politique-de-confidentialite" className="underline underline-offset-2">En savoir plus</Link>
          </p>

          {settings && (
            <div className="mt-4 space-y-3 rounded-xl bg-[#F7F7F7] p-4 text-sm">
              <label className="flex items-center justify-between gap-4">
                <span><strong className="font-semibold">Nécessaires</strong> — connexion, panier, sécurité. Toujours actifs.</span>
                <input type="checkbox" checked disabled className="h-4 w-4 accent-black" />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span><strong className="font-semibold">Mesure d&apos;audience</strong> — statistiques de visite anonymes.</span>
                <input type="checkbox" checked={analytics} onChange={e => setAnalytics(e.target.checked)} className="h-4 w-4 accent-black" />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:flex-shrink-0">
          <button
            onClick={() => respond('accepted')}
            className="rounded-full bg-black px-7 py-3 text-[17px] font-medium text-white transition-opacity hover:opacity-85"
          >
            Autoriser tous les cookies
          </button>
          {settings ? (
            <button
              onClick={() => respond(analytics ? 'accepted' : 'rejected')}
              className="rounded-full bg-[#707070] px-7 py-3 text-[17px] font-medium text-white transition-opacity hover:opacity-85"
            >
              Enregistrer mes choix
            </button>
          ) : (
            <button
              onClick={() => { setAnalytics(false); setSettings(true); }}
              className="rounded-full bg-[#707070] px-7 py-3 text-[17px] font-medium text-white transition-opacity hover:opacity-85"
            >
              Paramètres des cookies
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
