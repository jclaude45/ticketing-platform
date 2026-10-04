import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY, LegalPage, Ul, type LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Conditions générales de vente',
  description: 'Conditions générales de vente de ZAYA : achat de billets et d’articles, services aux organisateurs, frais et versements.',
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium underline underline-offset-2">{children}</Link>
);
const Mail = () => <a href={`mailto:${COMPANY.email}`} className="underline">{COMPANY.email}</a>;
const Part = ({ children }: { children: React.ReactNode }) => (
  <p className="!mt-0 text-xs font-semibold uppercase tracking-[0.12em] text-[#777]">{children}</p>
);

const SECTIONS: LegalSection[] = [
  {
    id: 'champ',
    title: 'Champ d’application',
    body: (
      <>
        <p>
          Les présentes conditions générales de vente (« CGV ») s’appliquent à tout achat réalisé sur ZAYA, plateforme éditée par{' '}
          {COMPANY.name} (RCCM {COMPANY.rccm}, NIF {COMPANY.nif}). Elles complètent les <A href="/cgu">conditions générales d’utilisation</A>.
        </p>
        <p>Elles comportent deux parties :</p>
        <Ul items={[
          <><strong>Partie A</strong> — l’achat de billets et d’articles par les Acheteurs ;</>,
          <><strong>Partie B</strong> — les services payants de ZAYA aux Organisateurs, la commission sur les ventes et les reversements.</>,
        ]} />
        <p>
          Elles sont établies conformément au droit congolais, notamment l’ordonnance-loi n° 23/010 du 13 mars 2023 portant Code du
          numérique et la loi n° 18/035 du 13 décembre 2018 fixant les règles relatives à la protection du consommateur.
        </p>
      </>
    ),
  },
  {
    id: 'vendeur',
    title: 'Qui vend quoi',
    body: (
      <>
        <Part>Partie A — Acheteurs</Part>
        <p>
          Les billets et les articles de la boutique d’un événement sont vendus par <strong>l’Organisateur</strong> de cet événement, dont le
          nom figure sur la page de vente. ZAYA agit en qualité d’intermédiaire technique et encaisse le paiement au nom et pour le compte
          de l’Organisateur. Les conditions particulières fixées par l’Organisateur (restrictions d’âge, règles d’accès, conditions de
          remboursement plus favorables) sont indiquées sur la page de l’événement et s’ajoutent aux présentes CGV.
        </p>
      </>
    ),
  },
  {
    id: 'prix',
    title: 'Prix et frais de service',
    body: (
      <>
        <p>
          Les prix sont affichés dans la devise choisie par l’Organisateur avant toute commande. Le montant total à payer, articles et
          livraison compris, est récapitulé avant la validation du paiement.
        </p>
        <p>
          ZAYA perçoit des frais de service de <strong>9 % sur la totalité du paiement</strong> (billets, articles et livraison), frais des
          opérateurs de paiement inclus. Selon le choix de l’Organisateur, ces frais sont :
        </p>
        <Ul items={[
          <>pris en charge par l’Organisateur : le prix affiché est le prix payé ;</>,
          <>payés par l’Acheteur : ils sont déjà inclus dans les prix affichés, ce qui est signalé au moment de l’achat (par exemple 109 $ pour un billet dont le prix fixé par l’Organisateur est de 100 $).</>,
        ]} />
        <p>Les billets gratuits et les inscriptions gratuites ne supportent aucun frais.</p>
      </>
    ),
  },
  {
    id: 'commande',
    title: 'Commande et paiement',
    body: (
      <>
        <p>
          L’Acheteur choisit ses billets et ses articles, indique son nom et son adresse e-mail, puis paie par Mobile Money ou par carte
          bancaire. Les paiements sont traités par FlexPay, établissement de paiement opérant en République démocratique du Congo ; ZAYA ne
          conserve aucune donnée de carte bancaire.
        </p>
        <p>
          La commande est ferme dès la confirmation du paiement par l’opérateur. Elle forme un contrat conclu par voie électronique ; les
          enregistrements de la Plateforme font foi de la commande, de sa date et de son montant, sauf preuve contraire. Un récapitulatif
          est envoyé par e-mail.
        </p>
        <p>Une commande non payée ou refusée par l’opérateur est annulée et les places ou articles réservés sont libérés.</p>
      </>
    ),
  },
  {
    id: 'livraison-billets',
    title: 'Remise des billets',
    body: (
      <p>
        Les billets sont émis dès la confirmation du paiement : ils sont affichés à l’écran, téléchargeables en PDF et envoyés à l’adresse
        e-mail indiquée. Chaque billet est nominatif lorsque le nom du titulaire y figure, porte un QR code signé et n’est valable que pour
        l’événement, les jours et l’entrée qu’il indique. L’Acheteur vérifie l’exactitude de son adresse e-mail ; en cas de non-réception,
        il contacte <Mail />.
      </p>
    ),
  },
  {
    id: 'boutique',
    title: 'Articles de la boutique',
    body: (
      <>
        <p>
          Les articles sont décrits par l’Organisateur, qui est responsable de leur conformité. Ils sont, au choix de l’Acheteur parmi les
          options proposées :
        </p>
        <Ul items={[
          'retirés sur le lieu de l’événement, sur présentation du code de commande reçu par e-mail ;',
          'livrés à l’adresse indiquée, moyennant les frais de livraison affichés, dans les délais annoncés par l’Organisateur.',
        ]} />
        <p>
          Un article non conforme ou abîmé est signalé à l’Organisateur, ou à <Mail />, dans les sept jours de sa remise ; il est alors
          échangé ou remboursé.
        </p>
      </>
    ),
  },
  {
    id: 'retractation',
    title: 'Absence de rétractation',
    body: (
      <p>
        Les billets donnent accès à un événement de loisirs à une date ou une période déterminée : ils ne peuvent être ni échangés, ni
        repris, ni remboursés à l’initiative de l’Acheteur, sauf si l’Organisateur le prévoit sur la page de l’événement ou si la loi en
        dispose autrement. Les articles de la boutique suivent la section « Articles de la boutique ».
      </p>
    ),
  },
  {
    id: 'annulation',
    title: 'Annulation, report et remboursement',
    body: (
      <>
        <p>
          <strong>Annulation.</strong> Si l’événement est annulé, l’Acheteur est remboursé de la totalité du montant payé, frais de service
          compris, dans un délai de quatorze jours ouvrés suivant l’annonce de l’annulation, par le moyen de paiement utilisé ou à défaut par
          Mobile Money.
        </p>
        <p>
          <strong>Report ou modification substantielle.</strong> Le billet reste valable pour la nouvelle date ou le nouveau lieu. L’Acheteur
          qui ne peut pas y assister peut demander son remboursement dans les quatorze jours suivant l’annonce du report.
        </p>
        <p>
          <strong>Demande.</strong> Les demandes sont adressées à <Mail /> avec le numéro du billet ou de la commande, la référence du paiement
          et les coordonnées Mobile Money ou bancaires de remboursement. ZAYA en accuse réception sous 48 heures et exécute les remboursements
          accordés pour le compte de l’Organisateur, sur les sommes qu’il détient pour lui.
        </p>
      </>
    ),
  },
  {
    id: 'reclamations',
    title: 'Réclamations des Acheteurs',
    body: (
      <p>
        Toute réclamation relative à une commande, à un paiement ou à l’accès à un événement est adressée à <Mail />. ZAYA y répond dans un
        délai de quinze jours et transmet à l’Organisateur ce qui relève de lui. L’Acheteur consommateur conserve la possibilité de saisir les
        autorités et juridictions compétentes de République démocratique du Congo.
      </p>
    ),
  },
  {
    id: 'offres',
    title: 'Offres pour les Organisateurs',
    body: (
      <>
        <Part>Partie B — Organisateurs</Part>
        <p>
          La billetterie en ligne est gratuite et sans limite. Les services payants et leurs prix sont décrits sur la page{' '}
          <A href="/tarifs">Tarifs</A>, qui fait partie des présentes CGV :
        </p>
        <Ul items={[
          <><strong>Gratuit</strong> (0 $) : 100 billets à imprimer et 20 badges par événement, 2 contrôleurs ;</>,
          <><strong>Starter</strong> (19 $ par mois) : 1 500 billets à imprimer et 100 badges par mois, 10 contrôleurs ;</>,
          <><strong>Pro</strong> (59 $ par mois) : 6 000 billets à imprimer et 400 badges par mois, contrôleurs illimités ;</>,
          <><strong>À l’unité</strong>, au-delà du plan : 0,02 $ par billet à imprimer et 0,20 $ par badge ou accréditation.</>,
        ]} />
        <p>
          Seuls les billets générés depuis le tableau de bord (lots et invitations) et les badges imprimés sont décomptés ; un badge est
          décompté une seule fois. Les billets émis après une vente ou une inscription en ligne ne le sont jamais.
        </p>
      </>
    ),
  },
  {
    id: 'abonnement',
    title: 'Plans et paiement des services',
    body: (
      <>
        <p>
          Les plans Starter et Pro sont payés d’avance, par Mobile Money ou carte via FlexPay, pour une période d’un mois à compter de la
          confirmation du paiement. Ils ne sont pas renouvelés automatiquement : ZAYA prévient l’Organisateur avant l’échéance, et le compte
          repasse au plan Gratuit si le mois suivant n’est pas payé. Un mois payé à l’avance s’ajoute à la suite du mois en cours.
        </p>
        <p>
          Le prix des billets et badges au-delà du plan est affiché avant la génération ; l’Organisateur le valide et le paie, puis la
          génération a lieu. Les unités payées et non utilisées restent disponibles sur son compte.
        </p>
        <p>
          L’Organisateur peut changer de plan ou revenir au plan Gratuit à tout moment, sans engagement. Les sommes déjà payées pour un mois
          commencé ou pour des unités ne sont pas remboursées, sauf manquement de ZAYA.
        </p>
      </>
    ),
  },
  {
    id: 'commission',
    title: 'Commission sur les ventes en ligne',
    body: (
      <>
        <p>
          Sur chaque paiement en ligne d’un événement payant, ZAYA retient <strong>9 % du montant total payé</strong> (billets, articles et
          livraison), frais des opérateurs de paiement inclus. Aucun abonnement ni frais fixe n’est dû pour vendre en ligne.
        </p>
        <p>
          L’Organisateur choisit, pour chaque événement, qui supporte ces frais : lui-même (il reçoit 91 $ sur un billet vendu 100 $) ou
          l’Acheteur (le prix affiché devient 109 $ et l’Organisateur reçoit 100 $). Ce choix s’applique aux commandes passées après sa
          modification.
        </p>
        <p>
          En cas de remboursement d’un Acheteur, notamment après annulation de l’événement, la commission de ZAYA sur la commande remboursée
          reste due par l’Organisateur.
        </p>
      </>
    ),
  },
  {
    id: 'reversements',
    title: 'Reversement des ventes',
    body: (
      <>
        <p>
          ZAYA détient les sommes encaissées pour le compte de l’Organisateur et les lui reverse, commission déduite :
        </p>
        <Ul items={[
          <><strong>90 %</strong> du montant dû trois jours après la fin de l’événement ;</>,
          <><strong>10 %</strong> conservés sept jours supplémentaires pour couvrir les remboursements et réclamations, puis reversés.</>,
        ]} />
        <p>
          Les reversements sont effectués par Mobile Money ou virement bancaire vers les coordonnées que l’Organisateur renseigne dans
          « Mes versements » et dont il doit être titulaire. Ils sont suivis dans son tableau de bord avec leur date et leur référence.
        </p>
        <p>
          Les remboursements accordés aux Acheteurs et les sommes dues à ZAYA sont imputés sur les reversements. Si ceux-ci ne suffisent
          pas, l’Organisateur règle la différence à première demande. ZAYA peut suspendre un reversement en cas d’annulation, de
          réclamations nombreuses, de fraude présumée, de coordonnées manquantes ou sur demande d’une autorité, le temps de la vérification.
        </p>
      </>
    ),
  },
  {
    id: 'droit',
    title: 'Droit applicable et litiges',
    body: (
      <p>
        Les CGV sont régies par le droit de la République démocratique du Congo. Toute réclamation est d’abord adressée à <Mail /> en vue
        d’une solution amiable dans un délai de trente jours. À défaut, le litige est porté devant les juridictions compétentes de Kinshasa ;
        entre professionnels, compétence est attribuée au tribunal de commerce de Kinshasa/Gombe, sous réserve des règles protectrices du
        consommateur.
      </p>
    ),
  },
];

export default function CgvPage() {
  return (
    <LegalPage
      current="/cgv"
      title="Conditions générales de vente"
      intro={
        <p>
          Ce que vous payez, à qui et comment : achat de billets et d’articles pour les Acheteurs, services et reversements pour les
          Organisateurs.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
