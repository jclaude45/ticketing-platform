/**
 * Pricing shown on zaya.live (landing and /tarifs). The quotas themselves are enforced from
 * the plans in the database (Admin → Abonnements): keep both in line.
 */
export const SALES_FEE = '9 %';

export interface PrintPlan {
  name: string;
  price: string;
  priceNote: string;
  features: string[];
  /** Break-even hint */
  note?: string;
  highlight?: boolean;
}

export const PRINT_PLANS: PrintPlan[] = [
  {
    name: 'Gratuit',
    price: '0 $',
    priceNote: 'pour toujours',
    features: ['100 billets à imprimer par événement', '20 badges par événement', '2 contrôleurs', 'Billetterie en ligne illimitée'],
  },
  {
    name: 'Starter',
    price: '19 $',
    priceNote: 'par mois, soit 0,013 $ le billet',
    features: ['1 500 billets à imprimer par mois', '100 badges par mois', '10 contrôleurs', 'Billetterie en ligne illimitée'],
    note: 'Rentable dès 950 billets par mois.',
    highlight: true,
  },
  {
    name: 'Pro',
    price: '59 $',
    priceNote: 'par mois, soit 0,010 $ le billet',
    features: ['6 000 billets à imprimer par mois', '400 badges par mois', 'Contrôleurs illimités', 'Billetterie en ligne illimitée'],
    note: 'Rentable dès 3 000 billets par mois.',
  },
];

export const UNIT_PRICES = { ticket: '0,02 $', badge: '0,20 $' };

export const INCLUDED: { title: string; items: string[] }[] = [
  {
    title: 'Côté contrôle d’accès',
    items: [
      'L’application ZCONTRÔLE gratuite et illimitée',
      'Le scan hors ligne qui fonctionne même sans réseau sur le site',
      'Des billets signés et infalsifiables',
      'Les pass multi-jours avec une entrée par jour',
      'Les badges et accréditations avec zones d’accès et dates de validité',
    ],
  },
  {
    title: 'Côté billetterie',
    items: [
      'Tarifs par jour et pass multi-jours',
      'Éditeur de design des billets',
      'Invitations par e-mail',
      'Boutique merch avec retrait sur place',
      'Exports PDF à l’unité, groupés ou en ZIP',
    ],
  },
  {
    title: 'Côté pilotage',
    items: [
      'Statistiques de vente, taux de remplissage et scans',
      'Audience et carte des pays',
      'Campagnes e-mail et SMS',
      'Tâches, budget et collaborateurs',
      'Historique complet des générations, annulations et scans',
    ],
  },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Les 9 %, c’est moi ou l’acheteur qui les paie ?',
    a: 'Vous décidez. Soit vous les absorbez et vous recevez 91 $ sur un billet à 100 $, soit vous les ajoutez au prix affiché et l’acheteur paie 109 $ pour que vous receviez 100 $.',
  },
  {
    q: 'Quand suis-je payé ?',
    a: 'Trois jours après la fin de votre événement. Nous conservons 10 % pendant sept jours supplémentaires pour couvrir d’éventuels remboursements, puis nous vous les versons.',
  },
  {
    q: 'Que se passe-t-il si je dépasse mon quota ?',
    a: 'Rien ne se bloque. Votre billetterie continue de vendre, vos contrôleurs continuent de scanner, vos statistiques restent accessibles. Seule la génération de nouveaux lots vous est facturée à l’unité, et le montant s’affiche avant que vous validiez.',
  },
  {
    q: 'Les billets vendus en ligne comptent-ils dans mon quota ?',
    a: 'Non. Un billet émis automatiquement après une vente ou une inscription en ligne ne consomme jamais de quota. Seuls les lots que vous générez vous-même depuis votre tableau de bord sont décomptés.',
  },
  {
    q: 'L’application de contrôle est-elle payante ?',
    a: 'Non, jamais. ZCONTRÔLE est gratuite, sans limite de scans ni de billets. Elle est disponible sur Android.',
  },
  {
    q: 'Y a-t-il un engagement ?',
    a: 'Aucun. Vous changez de plan ou vous arrêtez à tout moment.',
  },
  {
    q: 'Puis-je essayer avant de payer ?',
    a: 'Le plan gratuit n’a pas de durée limitée. Vendez vos billets en ligne, scannez vos entrées, consultez vos statistiques, sans rien payer.',
  },
];
