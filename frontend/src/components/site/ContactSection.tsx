import { ContactForm } from './ContactForm';

/** « Parle-nous » block with the contact / quote form (landing and Services pages) */
export function ContactSection() {
  return (
    <section id="contact" className="scroll-mt-20 px-6 pb-20 lg:px-[108px]">
      <div className="mx-auto flex max-w-[1150px] flex-col gap-12 lg:flex-row lg:gap-[150px]">
        <div className="lg:w-[220px] lg:flex-shrink-0">
          <h2 className="text-[44px] font-light uppercase leading-[0.9] lg:text-5xl">Parle-nous</h2>
          <p className="mt-2 whitespace-nowrap text-lg">Prêt à passer au direct&nbsp;?</p>
        </div>
        <div className="w-full max-w-[610px]">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
