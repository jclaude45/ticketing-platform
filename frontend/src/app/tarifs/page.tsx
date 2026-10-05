import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { APP_URL } from '@/components/site/site-config';
import { FAQ, INCLUDED, PRINT_PLANS, SALES_FEE, UNIT_PRICES } from '@/components/site/pricing';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Tarifs ZAYA',
  description:
    'La billetterie en ligne est gratuite. Vous ne payez que ce que vous imprimez — et 9 % sur les billets que vous vendez.',
};

function CreateButton({ className }: { className?: string }) {
  return (
    <a
      href={`${APP_URL}/auth/register`}
      className={cn('inline-block rounded-full bg-black px-6 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85', className)}
    >
      Créer mon événement
    </a>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white text-black">
      <SiteHeader variant="landing" />

      {/* ── Headline ── */}
      <section className="px-6 pb-20 pt-16 text-center lg:pb-28 lg:pt-28">
        <h1 className="t-display">Tarifs ZAYA</h1>
        <p className="t-lead mx-auto mt-8 max-w-[640px] text-[#222]">
          La billetterie en ligne est gratuite. Vous ne payez que ce que vous imprimez — et {SALES_FEE} sur les billets que vous vendez.
        </p>
        <CreateButton className="mt-10" />
        <p className="mt-3 text-sm text-[#555]">Aucune carte bancaire requise.</p>
      </section>

      {/* ── Free event / paid event ── */}
      <section className="px-6 pb-24 lg:pb-32">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[32px] bg-[#F2F2F2] p-8 lg:p-12">
            <p className="text-sm uppercase tracking-[0.12em] text-[#555]">Événement gratuit</p>
            <p className="mt-3 text-5xl font-black tracking-tight lg:text-6xl">0 $</p>
            <p className="mt-6 t-lead text-[#222]">
              Si votre événement est gratuit, vous ne payez rien : billets illimités envoyés par e-mail, scan illimité avec l’application ZCONTRÔLE, statistiques et historique compris, sans limite de durée.
            </p>
          </div>
          <div className="rounded-[32px] bg-[#181818] p-8 text-white lg:p-12">
            <p className="text-sm uppercase tracking-[0.12em] text-white/60">Événement payant</p>
            <p className="mt-3 text-5xl font-black tracking-tight text-[#FFDD00] lg:text-6xl">{SALES_FEE}</p>
            <p className="mt-6 t-lead text-white/85">
              Si votre événement est payant, vous versez {SALES_FEE} par billet vendu, tout compris. Les frais de paiement mobile money et carte sont inclus. Aucun abonnement, aucun frais fixe. Vous choisissez qui paie : vous ou l’acheteur. Votre argent vous est versé trois jours après votre événement.
            </p>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-[640px] t-lead text-center text-[#222]">
          Dans les deux cas, vous ne payez que si vous générez des billets ou des badges à imprimer.
        </p>
      </section>

      {/* ── Print plans ── */}
      <section id="formules" className="scroll-mt-20 px-6 pb-24 lg:pb-32">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="t-title">Billets et badges à imprimer</h2>
          <p className="mt-4 t-lead text-[#222]">
            Pour imprimer vos billets et vos badges, trois formules. La billetterie en ligne reste gratuite dans tous les cas.
          </p>
        </div>
        <div className="mx-auto mt-14 grid max-w-[1150px] grid-cols-1 gap-6 sm:max-w-[420px] lg:max-w-[1150px] lg:grid-cols-3">
          {PRINT_PLANS.map(p => (
            <div key={p.name} className="flex flex-col">
              <div className={cn('mb-4 flex h-[26px] items-center justify-center rounded-lg text-[15px] uppercase', p.highlight ? 'bg-black text-white' : 'invisible')}>
                Le plus choisi
              </div>
              <div className="flex flex-1 flex-col bg-[#F7F7F7]">
                <div className="rounded-[32px] bg-[#181818] px-6 py-12 text-center text-white">
                  <p className="text-[32px] tracking-wide">{p.name}</p>
                  <p className="mt-3 text-[80px] font-light leading-none tracking-tight sm:text-[96px]">{p.price}</p>
                  <p className="mt-3 text-sm uppercase text-white/70">{p.priceNote}</p>
                </div>
                <ul className="flex-1">
                  {p.features.map(f => (
                    <li key={f} className="border-b border-[#d0d0d0] px-8 py-5 text-[17px] font-semibold text-[#4a4a4a] last:border-b-0">{f}</li>
                  ))}
                </ul>
                {p.note && <p className="px-8 pb-5 text-sm text-[#555]">{p.note}</p>}
                <a href={`${APP_URL}/auth/register`} className="block bg-black py-4 text-center text-xl font-semibold text-white transition-opacity hover:opacity-85">
                  sélectionnez
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-[820px] rounded-[32px] border-2 border-black p-8 text-center lg:p-12">
          <h3 className="t-heading">Vous organisez un seul événement ?</h3>
          <p className="mt-4 t-lead text-[#222]">
            Payez à l’unité, sans engagement : <strong>{UNIT_PRICES.ticket} le billet</strong> prêt à imprimer,{' '}
            <strong>{UNIT_PRICES.badge} le badge</strong> ou l’accréditation. Le prix s’affiche avant la génération. Vous validez, puis vous générez.
          </p>
        </div>
      </section>

      {/* ── Included ── */}
      <section className="bg-[#F2F2F2] px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="t-title text-center">Tout le reste est compris</h2>
          <p className="mt-3 t-lead text-center text-[#222]">Y compris dans le plan gratuit.</p>
          <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
            {INCLUDED.map(g => (
              <div key={g.title}>
                <h3 className="border-b-2 border-black pb-3 text-xl font-bold">{g.title}</h3>
                <ul className="mt-4 space-y-3">
                  {g.items.map(i => (
                    <li key={i} className="flex gap-3 text-[16px] leading-snug text-[#222]">
                      <Check className="mt-0.5 h-5 w-5 flex-shrink-0" strokeWidth={2.5} />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-[820px]">
          <h2 className="t-title text-center">Questions fréquentes</h2>
          <div className="mt-12 border-t border-[#d0d0d0]">
            {FAQ.map(f => (
              <details key={f.q} className="group border-b border-[#d0d0d0] py-6">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-xl font-semibold">
                  {f.q}
                  <span className="mt-1 text-2xl leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 t-lead text-[#222]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Last call ── */}
      <section className="px-6 pb-28 text-center">
        <h2 className="t-title mx-auto max-w-[760px]">Votre premier événement vous attend.</h2>
        <p className="mx-auto mt-6 max-w-[600px] t-lead text-[#222]">
          Créez votre compte, publiez votre événement, vendez vos premiers billets. Vous ne paierez rien tant que vous n’imprimerez rien.
        </p>
        <CreateButton className="mt-10" />
      </section>

      <SiteFooter />
    </div>
  );
}
