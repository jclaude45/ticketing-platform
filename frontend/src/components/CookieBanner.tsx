'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'zaya_cookie_consent';

export type CookieConsent = 'accepted' | 'rejected' | null;

export function getCookieConsent(): CookieConsent {
  if (typeof window === 'undefined') return null;
  return (localStorage.getItem(STORAGE_KEY) as CookieConsent) ?? null;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
  }, []);

  const respond = (choice: 'accepted' | 'rejected') => {
    localStorage.setItem(STORAGE_KEY, choice);
    setVisible(false);
    // Reload only if accepting so analytics scripts can initialize
    if (choice === 'accepted') window.location.reload();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentement aux cookies"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-2xl"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 text-sm text-gray-600 dark:text-gray-300">
          <p>
            Nous utilisons des cookies nécessaires au fonctionnement du service et, avec votre accord,
            des cookies d'analyse d'audience pour améliorer notre plateforme.{' '}
            <Link href="/politique-de-confidentialite" className="text-indigo-600 hover:underline font-medium">
              En savoir plus
            </Link>
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={() => respond('rejected')}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Refuser
          </button>
          <button
            onClick={() => respond('accepted')}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
