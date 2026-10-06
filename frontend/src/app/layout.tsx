import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { SocketProvider } from '@/providers/SocketProvider';
import { CookieBanner } from '@/components/CookieBanner';
import { Analytics } from '@/components/Analytics';
import './globals.css';
import { SITE_URL } from '@/components/site/site-config';
import { DEFAULT_DESCRIPTION, SITE_NAME } from '@/lib/seo';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'ZAYA — Billetterie et événements en RDC',
    template: '%s | ZAYA',
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'billetterie en ligne', 'billets', 'événements', 'Kinshasa', 'RDC', 'Congo', 'concert', 'festival', 'soirée',
    'conférence', 'Mobile Money', 'M-Pesa', 'QR code', 'contrôle d’accès', 'organisateur d’événements',
  ],
  authors: [{ name: 'BACK2NEXT' }],
  creator: 'BACK2NEXT',
  publisher: 'BACK2NEXT',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: SITE_NAME,
    title: 'ZAYA — Billetterie et événements en RDC',
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ZAYA — Billetterie et événements en RDC',
    description: DEFAULT_DESCRIPTION,
  },
  formatDetection: { telephone: false, email: false, address: false },
  // Tab icon: app/icon.svg (black, white in dark mode); home screen icon: app/apple-icon.tsx
  other: {
    'google': 'notranslate',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" translate="no" suppressHydrationWarning>
      <head>
        {/* Dashboard theme chosen in the header, applied before the first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(location.pathname.indexOf('/dashboard')===0&&localStorage.getItem('zaya_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            <SocketProvider>
              {children}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  loading: { duration: Infinity },
                  style: {
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                  },
                  success: {
                    iconTheme: { primary: '#6366f1', secondary: '#fff' },
                  },
                }}
              />
              <CookieBanner />
              <Analytics />
            </SocketProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
