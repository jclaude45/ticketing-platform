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
        <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : juillet 2026</p>

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
            Tout achat de billet est définitif sauf disposition contraire de l'organisateur. Les billets
            sont nominatifs et ne peuvent être revendus. En cas d'annulation d'un événement, les modalités
            de remboursement sont définies par l'organisateur.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">5. Paiements</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Les paiements sont traités par FlexPay, prestataire de paiement tiers. ZAYA ne stocke aucune
            donnée bancaire. En cas de litige de paiement, contactez directement votre opérateur ou banque.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">6. Obligations des organisateurs</h2>
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
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">7. Propriété intellectuelle</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Tous les éléments de la plateforme ZAYA (code, design, logo, marque) sont la propriété exclusive
            de ZAYA et protégés par les lois en vigueur. Toute reproduction sans autorisation est interdite.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">8. Limitation de responsabilité</h2>
          <p className="text-gray-600 dark:text-gray-300">
            ZAYA agit en qualité d'intermédiaire technique. La responsabilité de ZAYA ne saurait être
            engagée en cas d'annulation d'événement par l'organisateur, de problèmes techniques des
            prestataires tiers, ou de force majeure.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">9. Modification des CGU</h2>
          <p className="text-gray-600 dark:text-gray-300">
            ZAYA se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront
            informés par e-mail ou via la plateforme. L'utilisation continue du service après modification
            vaut acceptation des nouvelles CGU.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">10. Contact</h2>
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
