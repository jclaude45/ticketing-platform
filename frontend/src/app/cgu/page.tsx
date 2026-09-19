import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation",
  description: "Conditions générales d'utilisation de la plateforme ZAYA.",
};

export default function CguPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Conditions Générales d&apos;Utilisation</h1>
        <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : septembre 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">1. Objet</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de
            la plateforme <strong>ZAYA</strong> (zaya.live), service de billetterie et de contrôle d'accès
            événementiel. En utilisant notre service, vous acceptez sans réserve les présentes CGU.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">2. Services proposés</h2>
          <p className="text-gray-600 dark:text-gray-300">ZAYA propose :</p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1 mt-2">
            <li>La vente de billets électroniques pour des événements</li>
            <li>La génération de billets sécurisés avec QR code</li>
            <li>Le paiement en ligne (Mobile Money, carte bancaire)</li>
            <li>Un tableau de bord de gestion pour les organisateurs</li>
            <li>Le contrôle d'accès par scan de QR code</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">3. Inscription et compte</h2>
          <p className="text-gray-600 dark:text-gray-300">
            La création d'un compte organisateur nécessite de fournir des informations exactes et à jour.
            Vous êtes responsable de la confidentialité de vos identifiants. ZAYA ne saurait être tenu
            responsable d'un accès non autorisé résultant de votre négligence.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">4. Achat de billets</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Tout achat de billet est définitif. Les billets sont nominatifs et non cessibles à titre onéreux.
            ZAYA délivre un billet électronique sécurisé par QR code immédiatement après confirmation du paiement.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">5. Politique de remboursement</h2>

          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-2">5.1 Annulation par l&apos;organisateur</h3>
          <p className="text-gray-600 dark:text-gray-300">
            En cas d'annulation définitive de l'événement par l'organisateur, les acheteurs sont remboursés
            du montant intégral du billet dans un délai de <strong>14 jours ouvrés</strong> à compter de la
            date d'annulation officielle, par le même moyen de paiement utilisé lors de l'achat.
            Les frais de service ZAYA (le cas échéant) ne sont pas remboursés.
          </p>

          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-2">5.2 Report d&apos;événement</h3>
          <p className="text-gray-600 dark:text-gray-300">
            En cas de report de la date de l'événement, le billet reste valable pour la nouvelle date.
            Si l'acheteur ne peut pas se présenter à la nouvelle date, il peut demander un remboursement
            dans un délai de <strong>7 jours</strong> suivant l'annonce du report, en contactant
            <a href="mailto:contact@zaya.live" className="text-indigo-600 hover:underline mx-1">contact@zaya.live</a>
            avec son numéro de billet.
          </p>

          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-2">5.3 Annulation par l&apos;acheteur</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Sauf disposition contraire explicitement indiquée par l'organisateur sur la page de l'événement,
            les billets achetés ne sont ni remboursables ni échangeables à l'initiative de l'acheteur.
            Ce principe est conforme à l'article L.221-28 du Code de la consommation (exception au droit
            de rétractation pour les prestations de loisirs à date déterminée).
          </p>

          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-2">5.4 Procédure de demande de remboursement</h3>
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Pour toute demande éligible, envoyez un e-mail à{' '}
            <a href="mailto:contact@zaya.live" className="text-indigo-600 hover:underline">contact@zaya.live</a>{' '}
            en indiquant :
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
            <li>Votre numéro de billet (figurant sur le PDF reçu)</li>
            <li>La référence de paiement</li>
            <li>Le motif de la demande</li>
            <li>Vos coordonnées Mobile Money ou bancaires pour le virement</li>
          </ul>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            ZAYA accuse réception sous <strong>48 heures</strong> et traite les remboursements éligibles
            sous <strong>14 jours ouvrés</strong>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">6. Paiements</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Les paiements sont traités par FlexPay, prestataire de paiement tiers. ZAYA ne stocke aucune
            donnée bancaire. En cas de litige de paiement, contactez directement votre opérateur ou banque.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">7. Obligations des organisateurs</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Les organisateurs s'engagent à :
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1 mt-2">
            <li>Fournir des informations exactes sur leurs événements</li>
            <li>Respecter la réglementation applicable aux événements publics</li>
            <li>Ne pas utiliser la plateforme à des fins frauduleuses</li>
            <li>Honorer les billets vendus via ZAYA</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">8. Propriété intellectuelle</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Tous les éléments de la plateforme ZAYA (code, design, logo, marque) sont la propriété exclusive
            de ZAYA et protégés par les lois en vigueur. Toute reproduction sans autorisation est interdite.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">9. Limitation de responsabilité</h2>
          <p className="text-gray-600 dark:text-gray-300">
            ZAYA agit en qualité d'intermédiaire technique. La responsabilité de ZAYA ne saurait être
            engagée en cas d'annulation d'événement par l'organisateur, de problèmes techniques des
            prestataires tiers, ou de force majeure.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">10. Modification des CGU</h2>
          <p className="text-gray-600 dark:text-gray-300">
            ZAYA se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront
            informés par e-mail ou via la plateforme. L'utilisation continue du service après modification
            vaut acceptation des nouvelles CGU.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">11. Contact</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Pour toute question relative aux présentes CGU :{' '}
            <a href="mailto:contact@zaya.live" className="text-indigo-600 hover:underline">contact@zaya.live</a>
          </p>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800 pt-6 mt-8 flex gap-4">
          <Link href="/" className="text-indigo-600 hover:underline text-sm">← Retour à l'accueil</Link>
          <Link href="/politique-de-confidentialite" className="text-indigo-600 hover:underline text-sm">
            Politique de confidentialité
          </Link>
        </div>
      </div>
    </main>
  );
}
