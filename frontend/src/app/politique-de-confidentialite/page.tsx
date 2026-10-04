import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY, LegalPage, Ul, type LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Comment ZAYA (BACK2NEXT) collecte, utilise et protège les données personnelles, conformément au Code du numérique de la RDC.',
};

const Mail = () => <a href={`mailto:${COMPANY.email}`} className="underline">{COMPANY.email}</a>;

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
        <thead>
          <tr className="border-b-2 border-black">
            {head.map(h => <th key={h} className="py-2 pr-4 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-200 align-top">
              {r.map((c, j) => <td key={j} className="py-2.5 pr-4">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Responsable du traitement',
    body: (
      <>
        <p>
          Les données personnelles traitées par ZAYA le sont par <strong>{COMPANY.name}</strong>, RCCM {COMPANY.rccm}, NIF {COMPANY.nif},
          {' '}{COMPANY.address}. Contact pour toute question relative aux données : <Mail />.
        </p>
        <p>
          Cette politique est établie conformément à l’ordonnance-loi n° 23/010 du 13 mars 2023 portant Code du numérique, qui encadre la
          protection des données à caractère personnel en République démocratique du Congo.
        </p>
        <p>
          <strong>Rôle des Organisateurs.</strong> Pour les listes de participants, d’invités et de membres d’équipe de ses événements,
          l’Organisateur détermine pourquoi il les collecte : il en est responsable, et ZAYA les traite pour son compte, sur ses instructions
          et uniquement pour fournir le service. Pour les comptes, la sécurité, les paiements et la facturation, ZAYA est responsable.
        </p>
      </>
    ),
  },
  {
    id: 'donnees',
    title: 'Données collectées',
    body: (
      <Table
        head={['Personnes', 'Données']}
        rows={[
          ['Acheteurs et participants', 'Nom, adresse e-mail, téléphone si Mobile Money, billets et commandes, adresse de livraison si choisie, référence et statut des paiements, historique des entrées scannées.'],
          ['Organisateurs et collaborateurs', 'Nom, e-mail, mot de passe chiffré, photo de profil facultative, paramètres de double authentification, événements, coordonnées de versement (Mobile Money ou compte bancaire), paiements à ZAYA, journal des actions.'],
          ['Membres d’équipe accrédités', 'Nom, fonction, e-mail et téléphone facultatifs, photo du badge si l’Organisateur l’ajoute, zones et dates d’accès.'],
          ['Contrôleurs', 'Nom, e-mail, identifiant de l’appareil, scans effectués (date, porte, résultat).'],
          ['Visiteurs des pages d’événement', 'Empreinte anonymisée calculée à partir de l’adresse IP (l’adresse elle-même n’est pas conservée), pays, région et ville approximatifs, site de provenance, type d’appareil.'],
        ]}
      />
    ),
  },
  {
    id: 'finalites',
    title: 'Finalités et bases légales',
    body: (
      <Table
        head={['Pourquoi', 'Sur quelle base']}
        rows={[
          ['Créer et gérer les comptes, publier les événements', 'Exécution du contrat (CGU)'],
          ['Vendre, émettre, envoyer et contrôler les billets et badges', 'Exécution du contrat (CGV)'],
          ['Encaisser les paiements, reverser les ventes, facturer les services', 'Exécution du contrat et obligations légales'],
          ['Sécuriser la plateforme, prévenir la fraude et la falsification des billets', 'Intérêt légitime de ZAYA et des Organisateurs'],
          ['Statistiques de vente et d’audience fournies à l’Organisateur', 'Intérêt légitime (données agrégées)'],
          ['Campagnes e-mail et SMS d’un Organisateur', 'Consentement du destinataire, recueilli par l’Organisateur'],
          ['Répondre aux demandes, réclamations et autorités', 'Obligations légales et intérêt légitime'],
        ]}
      />
    ),
  },
  {
    id: 'destinataires',
    title: 'Destinataires',
    body: (
      <>
        <p>Les données ne sont jamais vendues. Elles ne sont communiquées qu’aux personnes qui en ont besoin :</p>
        <Ul items={[
          'l’Organisateur de l’événement concerné et les personnes qu’il habilite (collaborateurs, contrôleurs), pour ses participants, son équipe et ses ventes ;',
          'le personnel habilité de BACK2NEXT ;',
          'les prestataires techniques de ZAYA, tenus à la confidentialité : Hetzner Online GmbH (hébergement des serveurs, Union européenne), FlexPay (paiements Mobile Money et carte, RDC), Mailtrap (envoi des e-mails), Twilio (envoi des SMS lorsque ce service est activé), IPinfo (localisation approximative des visiteurs) ;',
          'les autorités administratives ou judiciaires, sur demande légalement fondée.',
        ]} />
      </>
    ),
  },
  {
    id: 'transferts',
    title: 'Transferts hors de la RDC',
    body: (
      <p>
        Certaines données sont hébergées ou traitées hors de la République démocratique du Congo, notamment dans l’Union européenne
        (hébergement) et aux États-Unis (envoi d’e-mails et de SMS, localisation des visiteurs). Ces transferts sont limités à ce qui est
        nécessaire au service et encadrés par des engagements contractuels de confidentialité et de sécurité de nos prestataires, dans le
        respect des conditions posées par le Code du numérique.
      </p>
    ),
  },
  {
    id: 'conservation',
    title: 'Durées de conservation',
    body: (
      <Table
        head={['Données', 'Durée']}
        rows={[
          ['Compte Organisateur ou collaborateur', 'Tant que le compte est actif ; anonymisé 3 ans après la dernière connexion s’il n’a plus d’événement, ou à sa fermeture'],
          ['Billets, invités, équipes et commandes de la boutique', '3 ans après la fin de l’événement, puis anonymisés'],
          ['Paiements, reçus, reversements et pièces comptables', '10 ans, conformément au droit comptable OHADA, puis anonymisés'],
          ['Scans et journal des actions', '3 ans'],
          ['Mesure d’audience', '13 mois, puis supprimée'],
          ['Coordonnées de versement', 'Tant que le compte est actif'],
        ]}
      />
    ),
  },
  {
    id: 'droits',
    title: 'Vos droits',
    body: (
      <>
        <p>Vous disposez, dans les conditions du Code du numérique, des droits :</p>
        <Ul items={[
          'd’être informé et d’accéder à vos données ;',
          'de les faire rectifier ou compléter ;',
          'de les faire effacer lorsqu’elles ne sont plus nécessaires ou ont été traitées illicitement ;',
          'de vous opposer à un traitement fondé sur l’intérêt légitime, et à tout moment à la prospection ;',
          'de retirer votre consentement, sans effet sur les traitements passés.',
        ]} />
        <p>
          Écrivez à <Mail /> en précisant votre demande ; une pièce justifiant votre identité peut être demandée. Nous répondons dans un délai
          d’un mois. Les demandes portant sur la liste des participants d’un événement sont transmises à son Organisateur.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir l’autorité de protection des données à caractère personnel
          instituée par le Code du numérique.
        </p>
      </>
    ),
  },
  {
    id: 'securite',
    title: 'Sécurité',
    body: (
      <p>
        ZAYA applique des mesures adaptées : chiffrement des échanges (HTTPS), mots de passe chiffrés, double authentification, chiffrement des
        clés de signature, signature électronique de chaque billet, sauvegardes régulières, accès aux données limités au personnel habilité.
        En cas de violation de données présentant un risque pour les personnes, ZAYA en informe l’autorité compétente et les personnes
        concernées dans les conditions prévues par la loi.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies et stockage local',
    body: (
      <>
        <p>ZAYA utilise :</p>
        <Ul items={[
          'des cookies et éléments de stockage nécessaires au service : session et sécurité de connexion, panier, préférences d’affichage (thème, mode liste ou icônes), mémorisation de votre choix sur les cookies ;',
          'une mesure d’audience des pages d’événement, sans cookie publicitaire, décrite ci-dessus.',
        ]} />
        <p>Aucun cookie publicitaire ni de réseau social n’est déposé. Vous pouvez modifier votre choix depuis le bandeau cookies.</p>
      </>
    ),
  },
  {
    id: 'mineurs',
    title: 'Mineurs',
    body: (
      <p>
        La création d’un compte est réservée aux personnes majeures. Un billet peut être acheté pour un mineur par un adulte, qui fournit
        alors ses propres coordonnées.
      </p>
    ),
  },
  {
    id: 'modifications',
    title: 'Modifications',
    body: (
      <p>
        Cette politique peut évoluer. La date de mise à jour figure en haut de la page ; les utilisateurs inscrits sont informés des
        changements importants. Voir aussi les{' '}
        <Link href="/cgu" className="underline">conditions générales d’utilisation</Link> et les{' '}
        <Link href="/cgv" className="underline">conditions générales de vente</Link>.
      </p>
    ),
  },
];

export default function PolitiqueConfidentialitePage() {
  return (
    <LegalPage
      current="/politique-de-confidentialite"
      title="Politique de confidentialité"
      intro={<p>Quelles données ZAYA collecte, pourquoi, avec qui elles sont partagées, combien de temps elles sont gardées, et comment exercer vos droits.</p>}
      sections={SECTIONS}
    />
  );
}
