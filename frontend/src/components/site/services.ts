/** Services ZAYA sells to organizers (landing page "Services" and the quote form) */

export type ServiceGroup = 'plateforme' | 'terrain';

export interface Service {
  slug: string;
  group: ServiceGroup;
  title: string;
  /** Name in the quote form and in the e-mail sent to the team */
  name: string;
  text: string;
}

export const SERVICES: Service[] = [
  // ── On the platform: priced on the Tarifs page ──
  {
    slug: 'planification',
    group: 'plateforme',
    name: 'Plateforme de gestion d’événements',
    title: 'Planifiez comme un pro.',
    text: 'Notre plateforme de bout en bout dispose de tous les outils dont vous avez besoin pour créer et gérer vos événements : types de billets personnalisés, équipes, tâches et budget.',
  },
  {
    slug: 'billetterie',
    group: 'plateforme',
    name: 'Billetterie en ligne et en cash',
    title: 'Vendez des billets en ligne, en cash, en un clin d’œil !',
    text: 'Grâce aux ventes en temps réel, à l’attribution marketing et aux informations sur l’audience, vous pouvez planifier votre prochain événement en toute confiance.',
  },
  {
    slug: 'zcontrole',
    group: 'plateforme',
    name: 'Application zcontrole',
    title: 'zcontrole pour des entrées fluides.',
    text: 'Notre application de contrôle transforme les smartphones de votre équipe en terminaux de scan : chaque billet est vérifié en une seconde, même sans connexion.',
  },

  // ── On site: on quote ──
  {
    slug: 'experts-controle',
    group: 'terrain',
    name: 'Experts en contrôle d’accès',
    title: 'Des experts du contrôle à vos entrées.',
    text: 'Nos contrôleurs formés scannent les billets, organisent les files d’attente et règlent les cas difficiles, pour que chaque entrée reste rapide et sûre.',
  },
  {
    slug: 'securite-barricades',
    group: 'terrain',
    name: 'Agents de sécurité et barricades',
    title: 'Agents de sécurité et barricades.',
    text: 'Selon la taille de votre événement, nous déployons agents de sécurité, barrières et couloirs d’accès pour que le public entre et circule sans débordement.',
  },
  {
    slug: 'impression-billets',
    group: 'terrain',
    name: 'Impression de billets',
    title: 'Impression de billets.',
    text: 'Vos billets imprimés, numérotés et protégés par QR code, prêts à être vendus en guichet ou dans vos points de vente.',
  },
  {
    slug: 'bracelets',
    group: 'terrain',
    name: 'Production de bracelets',
    title: 'Production de bracelets.',
    text: 'Des bracelets à vos couleurs, avec QR code, pour les festivals, les zones VIP et les événements sur plusieurs jours.',
  },
  {
    slug: 'badges',
    group: 'terrain',
    name: 'Impression de badges',
    title: 'Impression de badges.',
    text: 'Des badges nominatifs pour vos équipes, artistes, presse et invités, avec QR code pour contrôler l’accès à chaque zone.',
  },
  {
    slug: 'terminaux',
    group: 'terrain',
    name: 'Terminaux de vente',
    title: 'Terminaux magiques pour des ventes à la vitesse de l’éclair.',
    text: 'Nous mettons à votre disposition des terminaux pour des ventes physiques en plusieurs guichets, idéaux pour les événements sur le terrain. Suivez vos ventes en temps réel.',
  },
  {
    slug: 'terminaux-controle',
    group: 'terrain',
    name: 'Terminaux de contrôle',
    title: 'Terminaux de contrôle prêts à scanner.',
    text: 'Nous fournissons des terminaux de scan configurés pour votre événement : vos équipes contrôlent les billets et les badges dès l’ouverture des portes, même sans connexion.',
  },
  {
    slug: 'activation-ventes',
    group: 'terrain',
    name: 'Activation des ventes sur le terrain',
    title: 'Activation des ventes sur le terrain.',
    text: 'Nos équipes vont à la rencontre de votre public, dans la rue, les campus et les lieux de passage, pour faire connaître votre événement et vendre vos billets.',
  },
];

/** Choices of the quote form, after the services */
export const QUOTE_OTHER = ['Plusieurs services', 'Autre demande'];

/** Event the "Demander un devis" buttons send to the contact form (same page) */
export const QUOTE_EVENT = 'zaya:quote';

/** Opens the contact form, with the service chosen when given */
export function requestQuote(service?: string) {
  window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: { service: service ?? '' } }));
  document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
