import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ContactSection } from '@/components/site/ContactSection';
import { QuoteButton } from '@/components/site/QuoteButton';
import { ServiceCard } from '@/components/site/ServiceCards';
import { SERVICES } from '@/components/site/services';

export const metadata: Metadata = {
  title: 'Services ZAYA',
  description:
    'Billetterie, contrôle d’accès, agents de sécurité, impression de billets, bracelets et badges, terminaux : les services ZAYA pour organisateurs, sur devis.',
};

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-white text-black">
      <SiteHeader variant="landing" />

      <section className="px-6 pb-24 pt-16 lg:pb-32 lg:pt-28">
        <div className="mx-auto max-w-[900px] text-center">
          <h1 className="t-display">
            Nos services
          </h1>
          <p className="t-lead mx-auto mt-8 max-w-[640px] text-[#222]">De la vente des billets au contrôle des entrées, nous nous occupons de votre événement</p>
        </div>

        {/* Experience */}
        <div className="mx-auto mt-14 flex max-w-[820px] flex-col items-center gap-6 rounded-[32px] bg-[#181818] px-8 py-10 text-center text-white sm:flex-row sm:gap-10 sm:px-12 sm:text-left lg:mt-20">
          <p className="flex-shrink-0 leading-none">
            <span className="block text-[96px] font-black tracking-tight sm:text-[110px]">12</span>
            <span className="block text-lg uppercase tracking-[0.2em] text-white/70">ans d’expérience</span>
          </p>
          <p className="t-lead text-white/90">
            Depuis 12 ans, nous accompagnons les organisateurs sur le terrain, aux côtés de partenaires parmi les meilleurs dans leur domaine :
            sécurité, impression, contrôle d’accès et vente.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-[1150px] lg:mt-24">
          <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#707070]">Sur la plateforme</h3>
          <div className="mt-10 flex flex-wrap justify-center gap-x-12 gap-y-16 lg:gap-y-20">
            {SERVICES.filter(s => s.group === 'plateforme').map(s => <ServiceCard key={s.slug} service={s} />)}
          </div>
          <div className="mt-12 text-center">
            <a href="/tarifs" className="inline-block rounded-full border border-black px-6 py-3 text-lg uppercase text-black transition-colors hover:bg-black hover:text-white">
              Voir les tarifs
            </a>
          </div>
        </div>

        <div className="mx-auto mt-24 max-w-[1150px] lg:mt-32">
          <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#707070]">Sur le terrain · sur devis</h3>
          <p className="t-lead mx-auto mt-3 max-w-[560px] text-center text-[#222]">
            Chaque événement est différent : ces services sont chiffrés selon votre date, votre lieu et votre public.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-x-12 gap-y-16 lg:gap-y-20">
            {SERVICES.filter(s => s.group === 'terrain').map(s => <ServiceCard key={s.slug} service={s} />)}
          </div>
        </div>

        <div className="mt-20 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <QuoteButton className="inline-block rounded-full bg-black px-6 py-3 text-lg uppercase text-white transition-opacity hover:opacity-85">
            Demander un devis
          </QuoteButton>
          <a href="#contact" className="inline-block rounded-full border border-black px-6 py-3 text-lg uppercase text-black transition-colors hover:bg-black hover:text-white">
            Contacter l’équipe ZAYA
          </a>
        </div>
      </section>

      <ContactSection />

      <SiteFooter />
    </div>
  );
}
