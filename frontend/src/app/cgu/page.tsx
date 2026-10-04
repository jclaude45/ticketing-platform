import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY, LegalPage, Ul, type LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description: "Conditions générales d'utilisation de ZAYA, plateforme de billetterie et de contrôle d'accès éditée par BACK2NEXT.",
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium underline underline-offset-2">{children}</Link>
);

const SECTIONS: LegalSection[] = [
  {
    id: 'editeur',
    title: 'Éditeur et hébergement',
    body: (
      <>
        <p>
          La plateforme ZAYA, accessible aux adresses zaya.live et app.zaya.live ainsi que par l’application mobile ZCONTRÔLE,
          est éditée par <strong>{COMPANY.name}</strong>, société de droit congolais immatriculée au Registre du Commerce et du Crédit
          Mobilier sous le numéro <strong>{COMPANY.rccm}</strong>, numéro d’identification fiscale <strong>{COMPANY.nif}</strong>,
          dont le siège est situé au {COMPANY.address} (ci-après « BACK2NEXT » ou « ZAYA »).
        </p>
        <p>Contact : <a href={`mailto:${COMPANY.email}`} className="underline">{COMPANY.email}</a>.</p>
        <p>
          La plateforme est hébergée sur des serveurs de la société Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Allemagne,
          situés dans l’Union européenne.
        </p>
      </>
    ),
  },
  {
    id: 'objet',
    title: 'Objet et cadre légal',
    body: (
      <>
        <p>
          Les présentes conditions générales d’utilisation (« CGU ») définissent les règles d’accès et d’utilisation de ZAYA par
          toute personne qui la consulte ou s’y inscrit. Elles s’appliquent avec les{' '}
          <A href="/cgv">conditions générales de vente</A> (achats de billets et d’articles, services payants aux organisateurs) et la{' '}
          <A href="/politique-de-confidentialite">politique de confidentialité</A>.
        </p>
        <p>
          Elles sont établies conformément au droit de la République démocratique du Congo, notamment l’ordonnance-loi n° 23/010 du
          13 mars 2023 portant Code du numérique, la loi n° 18/035 du 13 décembre 2018 fixant les règles relatives à la protection du
          consommateur et les Actes uniformes de l’OHADA.
        </p>
        <p>
          La création d’un compte, l’achat d’un billet ou l’utilisation de l’application vaut acceptation des CGU, recueillie par voie
          électronique. La version en vigueur est celle publiée sur cette page à la date d’utilisation.
        </p>
      </>
    ),
  },
  {
    id: 'definitions',
    title: 'Définitions',
    body: (
      <Ul items={[
        <><strong>Plateforme</strong> : le site zaya.live, le tableau de bord app.zaya.live et l’application ZCONTRÔLE.</>,
        <><strong>Organisateur</strong> : la personne physique ou morale qui crée un événement et y vend ou distribue des billets, des badges ou des articles.</>,
        <><strong>Acheteur</strong> : la personne qui achète ou réserve un billet ou un article sur la Plateforme.</>,
        <><strong>Participant</strong> : le titulaire d’un billet ou d’un badge, acheteur ou invité.</>,
        <><strong>Contrôleur</strong> : la personne autorisée par un Organisateur à scanner les billets et badges à l’entrée.</>,
        <><strong>Collaborateur</strong> : la personne invitée par un Organisateur à travailler dans son espace.</>,
      ]} />
    ),
  },
  {
    id: 'services',
    title: 'Services proposés',
    body: (
      <>
        <p>ZAYA met à disposition :</p>
        <Ul items={[
          'une billetterie en ligne permettant aux Organisateurs de publier leurs événements et de vendre ou distribuer des billets électroniques signés et munis d’un QR code ;',
          'une boutique permettant de vendre des articles retirés sur place ou livrés ;',
          'la génération de billets et de badges à imprimer, avec zones d’accès et dates de validité ;',
          'le contrôle d’accès par l’application ZCONTRÔLE, y compris hors ligne ;',
          'des outils de gestion : statistiques, invitations, campagnes e-mail et SMS, tâches, budget, collaborateurs et historique.',
        ]} />
        <p>
          Certains services sont payants dans les conditions prévues aux <A href="/cgv">CGV</A> et sur la page <A href="/tarifs">Tarifs</A>.
        </p>
      </>
    ),
  },
  {
    id: 'role',
    title: 'Rôle de ZAYA',
    body: (
      <>
        <p>
          ZAYA est un prestataire technique et un intermédiaire. <strong>L’Organisateur est seul responsable de son événement</strong> :
          son existence, son contenu, sa tenue, sa sécurité, ses autorisations administratives, les informations publiées, les prix qu’il
          fixe, l’accueil des Participants et les articles qu’il vend.
        </p>
        <p>
          Pour les ventes en ligne, ZAYA encaisse les paiements au nom et pour le compte de l’Organisateur, puis lui reverse les sommes
          dues selon les <A href="/cgv">CGV</A>. Le contrat de vente du billet ou de l’article est conclu entre l’Acheteur et l’Organisateur.
        </p>
      </>
    ),
  },
  {
    id: 'compte',
    title: 'Compte et sécurité',
    body: (
      <>
        <p>
          L’inscription est réservée aux personnes majeures et capables de contracter, ou aux personnes morales représentées par une
          personne habilitée. L’utilisateur fournit des informations exactes et à jour et les tient à jour.
        </p>
        <p>
          Les identifiants sont personnels et confidentiels. L’utilisateur est responsable de toute action réalisée depuis son compte et
          s’engage à prévenir ZAYA sans délai de toute utilisation non autorisée. La double authentification est recommandée pour les
          Organisateurs et obligatoire pour les comptes d’administration.
        </p>
        <p>
          Un Organisateur peut inviter des Collaborateurs et créer des Contrôleurs ; il reste responsable des actions qu’ils effectuent dans
          son espace et du respect des présentes CGU par ceux-ci.
        </p>
      </>
    ),
  },
  {
    id: 'organisateurs',
    title: 'Engagements des Organisateurs',
    body: (
      <>
        <p>L’Organisateur s’engage à :</p>
        <Ul items={[
          'publier des informations exactes et complètes sur ses événements (date, lieu, prix, conditions d’accès, restrictions d’âge) ;',
          'détenir les autorisations nécessaires à la tenue de l’événement et au respect des règles de sécurité et d’ordre public ;',
          'honorer tous les billets émis par la Plateforme, y compris ceux vendus en ligne ;',
          'informer sans délai les Participants et ZAYA de toute annulation, de tout report ou de toute modification substantielle ;',
          'rembourser les Acheteurs dans les cas prévus aux CGV et à la loi ;',
          'n’utiliser les données des Participants que pour l’organisation de son événement et dans le respect de la politique de confidentialité et du Code du numérique ;',
          'n’envoyer des campagnes e-mail ou SMS qu’à des destinataires qui l’ont accepté, en indiquant le moyen de se désinscrire ;',
          'renseigner des coordonnées de versement exactes et dont il est titulaire.',
        ]} />
        <p>
          L’Organisateur garantit ZAYA contre toute réclamation d’un Participant ou d’un tiers liée à son événement, à ses contenus ou au non-respect de ces engagements.
        </p>
      </>
    ),
  },
  {
    id: 'usages',
    title: 'Usages interdits',
    body: (
      <>
        <p>Il est interdit d’utiliser ZAYA pour :</p>
        <Ul items={[
          'publier un événement fictif, trompeur ou illicite, ou vendre des articles contrefaits ou interdits ;',
          'revendre des billets à un prix supérieur à leur prix d’origine sans l’accord de l’Organisateur ;',
          'falsifier, dupliquer ou reproduire des billets ou des badges, ou tenter de contourner leur signature ;',
          'accéder sans autorisation aux comptes, aux données ou aux systèmes, extraire massivement des données ou perturber le service ;',
          'diffuser des contenus portant atteinte aux droits d’autrui, à l’ordre public ou aux bonnes mœurs ;',
          'blanchir des capitaux ou réaliser toute opération frauduleuse.',
        ]} />
        <p>
          ZAYA peut retirer un contenu, suspendre un événement, bloquer les reversements concernés ou suspendre un compte en cas de
          manquement, de fraude présumée ou sur demande d’une autorité compétente, après en avoir informé l’utilisateur sauf urgence ou
          obligation légale contraire.
        </p>
      </>
    ),
  },
  {
    id: 'billets',
    title: 'Billets, badges et contrôle d’accès',
    body: (
      <>
        <p>
          Chaque billet et chaque badge porte un QR code signé électroniquement. Il est valable pour l’événement, les jours et les zones
          qu’il indique. Un billet simple permet une entrée ; un pass multi-jours permet une entrée par jour couvert.
        </p>
        <p>
          Le Participant conserve son billet et ne le communique pas : seul le premier passage d’un billet valide est accepté. ZAYA et
          l’Organisateur ne sont pas responsables de l’utilisation d’un billet copié ou transmis par son titulaire.
        </p>
        <p>
          Les Contrôleurs utilisent l’application ZCONTRÔLE. En mode hors ligne, la liste des billets est conservée sur l’appareil et les
          scans sont transmis au retour du réseau ; l’Organisateur veille à la sécurité des appareils qu’il utilise.
        </p>
      </>
    ),
  },
  {
    id: 'propriete',
    title: 'Propriété intellectuelle',
    body: (
      <>
        <p>
          La Plateforme, son code, ses interfaces, la marque ZAYA, ses logos et ses contenus appartiennent à BACK2NEXT ou à ses
          partenaires. Toute reproduction ou exploitation non autorisée est interdite.
        </p>
        <p>
          L’Organisateur reste propriétaire de ses contenus (affiches, textes, visuels de billets, photos d’articles). Il garantit en détenir
          les droits et accorde à BACK2NEXT, pour la durée de publication, une licence gratuite et non exclusive pour les afficher et les
          diffuser sur la Plateforme et dans la promotion de son événement.
        </p>
      </>
    ),
  },
  {
    id: 'disponibilite',
    title: 'Disponibilité et responsabilité',
    body: (
      <>
        <p>
          ZAYA met en œuvre les moyens raisonnables pour assurer l’accès au service à tout moment, sans obligation de résultat. Le service
          peut être interrompu pour maintenance, mise à jour ou en cas d’incident ; ZAYA s’efforce d’en limiter la durée et d’en prévenir
          les Organisateurs à l’avance lorsque c’est possible.
        </p>
        <p>
          ZAYA n’est pas responsable : du déroulement, de l’annulation ou du report d’un événement ; des contenus et articles des
          Organisateurs ; des pannes des réseaux de télécommunication, des opérateurs de paiement ou des appareils des utilisateurs ; des
          cas de force majeure. Dans les autres cas, la responsabilité de ZAYA envers un Organisateur est limitée au montant des sommes
          que celui-ci lui a versées au cours des douze derniers mois, sauf faute lourde ou intentionnelle.
        </p>
        <p>Ces limitations ne privent pas l’Acheteur consommateur des droits que lui reconnaît la loi.</p>
      </>
    ),
  },
  {
    id: 'donnees',
    title: 'Données personnelles',
    body: (
      <p>
        Les données personnelles sont traitées conformément au Code du numérique et à la{' '}
        <A href="/politique-de-confidentialite">politique de confidentialité</A>, qui précise les données collectées, leurs finalités,
        leurs destinataires, leur durée de conservation et les droits des personnes.
      </p>
    ),
  },
  {
    id: 'resiliation',
    title: 'Durée et fermeture du compte',
    body: (
      <>
        <p>
          Les CGU s’appliquent pendant toute la durée d’utilisation. L’utilisateur peut fermer son compte à tout moment depuis
          Paramètres → Profil → « Fermer mon compte », ou en écrivant à{' '}
          <a href={`mailto:${COMPANY.email}`} className="underline">{COMPANY.email}</a>. Ses données personnelles sont alors effacées ;
          les ventes et paiements passés sont conservés sans son nom.
        </p>
        <p>
          La fermeture d’un compte Organisateur ne dispense pas d’honorer les billets déjà vendus, ni de régler les sommes dues ; les
          reversements en cours sont effectués selon les CGV. Certaines données sont conservées pour les durées légales indiquées dans la
          politique de confidentialité.
        </p>
      </>
    ),
  },
  {
    id: 'modification',
    title: 'Modification des CGU',
    body: (
      <p>
        ZAYA peut faire évoluer les CGU. Les utilisateurs inscrits sont informés de toute modification substantielle par e-mail ou sur la
        Plateforme au moins quinze jours avant son entrée en vigueur. Ceux qui la refusent peuvent fermer leur compte avant cette date ; à
        défaut, la nouvelle version s’applique.
      </p>
    ),
  },
  {
    id: 'droit',
    title: 'Droit applicable et litiges',
    body: (
      <>
        <p>Les CGU sont régies par le droit de la République démocratique du Congo.</p>
        <p>
          En cas de difficulté, l’utilisateur écrit d’abord à <a href={`mailto:${COMPANY.email}`} className="underline">{COMPANY.email}</a> ;
          ZAYA y répond dans un délai de quinze jours et recherche une solution amiable. À défaut d’accord dans un délai de trente jours,
          le litige est porté devant les juridictions compétentes de Kinshasa, sous réserve des règles de compétence protectrices du
          consommateur.
        </p>
      </>
    ),
  },
];

export default function CguPage() {
  return (
    <LegalPage
      current="/cgu"
      title="Conditions générales d’utilisation"
      intro={<p>Les règles d’utilisation de ZAYA, la plateforme de billetterie et de contrôle d’accès de {COMPANY.name}.</p>}
      sections={SECTIONS}
    />
  );
}
