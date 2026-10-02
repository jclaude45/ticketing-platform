import { cn } from '@/lib/utils';
import { STORE_LINKS } from './site-config';

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.96-.74 1.39 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.88-1.28 1.24-2.52 1.26-2.58-.03-.01-2.4-.92-2.42-3.66ZM14.09 5.85c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28Z" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M6 18c0 .55.45 1 1 1h1v3.5a1.5 1.5 0 0 0 3 0V19h2v3.5a1.5 1.5 0 0 0 3 0V19h1c.55 0 1-.45 1-1V8H6v10ZM3.5 8A1.5 1.5 0 0 0 2 9.5v7a1.5 1.5 0 0 0 3 0v-7A1.5 1.5 0 0 0 3.5 8Zm17 0A1.5 1.5 0 0 0 19 9.5v7a1.5 1.5 0 0 0 3 0v-7A1.5 1.5 0 0 0 20.5 8Zm-4.97-5.84 1.3-1.3a.5.5 0 0 0-.7-.71l-1.48 1.48A5.96 5.96 0 0 0 12 1c-.96 0-1.86.23-2.66.63L7.85.15a.5.5 0 0 0-.7.7l1.31 1.31A5.97 5.97 0 0 0 6 7h12a5.97 5.97 0 0 0-2.47-4.84ZM10 5H9V4h1v1Zm5 0h-1V4h1v1Z" />
    </svg>
  );
}

/** iOS / Android buttons; black by default, grey on the event page */
export function StoreButtons({ tone = 'black', className }: { tone?: 'black' | 'grey'; className?: string }) {
  const btn = cn(
    'inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-white transition-opacity hover:opacity-85',
    tone === 'black' ? 'bg-black' : 'bg-[#707070]',
  );
  return (
    <div className={cn('flex flex-wrap gap-4', className)}>
      <a href={STORE_LINKS.ios ?? '#telecharger'} className={btn} {...(STORE_LINKS.ios && { target: '_blank', rel: 'noopener noreferrer' })}>
        <AppleIcon /> IOS
      </a>
      <a href={STORE_LINKS.android ?? '#telecharger'} className={cn(btn, 'font-semibold')} {...(STORE_LINKS.android && { target: '_blank', rel: 'noopener noreferrer' })}>
        <AndroidIcon /> Android
      </a>
    </div>
  );
}
