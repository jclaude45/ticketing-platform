import Image from 'next/image';
import { ZayaLogo } from './ZayaLogo';
import { SITE_URL } from './site-config';

/**
 * Login / sign-up layout in the public site style: white form column, and on large
 * screens the black-and-white crowd picture with a big headline.
 */
export function AuthShell({
  title, subtitle, children, footer, headline,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  headline: string;
}) {
  return (
    <div className="flex min-h-screen bg-white text-black">
      <div className="flex w-full flex-col px-6 py-6 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
        <a href={SITE_URL} aria-label="ZAYA — accueil" className="self-start">
          <ZayaLogo className="text-[28px] lg:text-[34px]" />
        </a>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-12">
          <h1 className="text-[44px] font-black uppercase leading-[0.95] tracking-tight sm:text-[56px]">{title}</h1>
          <p className="mt-3 text-lg text-[#555]">{subtitle}</p>
          <div className="mt-10">{children}</div>
          <div className="mt-10 space-y-2 text-[15px] text-[#555]">{footer}</div>
        </div>

        <p className="text-xs text-[#9a9a9a]">© Zaya {new Date().getFullYear()}</p>
      </div>

      <div className="relative hidden p-4 lg:block lg:w-1/2">
        <div className="relative h-full overflow-hidden rounded-[48px] bg-[#f2f2f2]">
          <Image src="/zaya-site/foule.webp" alt="" fill priority sizes="50vw" className="object-cover object-[center_30%] grayscale" />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/30 to-transparent" />
          <p className="absolute bottom-14 left-12 right-12 text-[52px] font-black uppercase leading-[0.95] tracking-tight xl:text-[64px]">
            {headline}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Underlined field of the public site forms */
export const authField =
  'w-full border-0 border-b border-[#9a9a9a] bg-transparent px-0.5 pb-2 pt-1 text-lg text-black placeholder:text-[#9a9a9a] focus:border-black focus:outline-none focus:ring-0';

export const authButton =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black text-lg font-semibold uppercase text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50';
