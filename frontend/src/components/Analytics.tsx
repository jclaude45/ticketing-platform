'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { getCookieConsent } from './CookieBanner';

// Google Analytics 4 — set NEXT_PUBLIC_GA_ID in your .env
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function Analytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(getCookieConsent() === 'accepted');
  }, []);

  if (!GA_ID || !consented) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
