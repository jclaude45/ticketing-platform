import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Politique de confidentialité et de protection des données personnelles de ZAYA.',
};

export default function PolitiqueConfidentialitePage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950 py-16 px-4">
      <div className="max-w-3xl mx-auto prose prose-gray dark:prose-invert">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : juillet 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">1. Responsable du traitement</h2>
          <p className="text-gray-600 dark:text-gray-300">
            ZAYA est responsable du traitement des données personnelles collectées via la plateforme{' '}
            <strong>zaya.live</strong>. Pour toute question relative à vos données, contactez-nous à{' '}
            <a href="mailto:contact@zaya.live" className="text-indigo-600 hover:underline">contact@zaya.live</a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">2. Données collectées</h2>
          <p className="text-gray-600 dark:text-gray-300">Nous collectons les données suivantes :</p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1 mt-2">
            <li>Nom et prénom (lors de l'achat d'un billet ou de la création d'un compte)</li>
            <li>Adresse e-mail</li>
            <li>Numéro de téléphone (optionnel, pour le Mobile Money)</li>
            <li>Données de paiement (traitées par FlexPay — nous ne stockons pas vos données bancaires)</li>
            <li>Données de navigation (adresse IP, navigateur, pages visitées)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">3. Finalités du traitement</h2>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
            <li>Gestion et livraison des billets électroniques</li>
            <li>Traitement des paiements</li>
            <li>Envoi de confirmations par e-mail</li>
            <li>Amélioration de nos services</li>
            <li>Respect de nos obligations légales</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">4. Base légale</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Le traitement est fondé sur l'exécution du contrat (livraison de billets), votre consentement
            (cookies analytics), et nos obligations légales.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">5. Conservation des données</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Vos données sont conservées pendant la durée nécessaire à la réalisation des finalités décrites
            ci-dessus, et au maximum 3 ans après votre dernier achat ou connexion.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">6. Vos droits</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Conformément à la réglementation applicable, vous disposez des droits suivants :
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1 mt-2">
            <li>Droit d'accès à vos données</li>
            <li>Droit de rectification</li>
            <li>Droit à l'effacement (« droit à l'oubli »)</li>
            <li>Droit à la portabilité</li>
            <li>Droit d'opposition au traitement</li>
          </ul>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Pour exercer ces droits, contactez-nous à{' '}
            <a href="mailto:contact@zaya.live" className="text-indigo-600 hover:underline">contact@zaya.live</a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">7. Cookies</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Nous utilisons des cookies strictement nécessaires au fonctionnement du service (authentification,
            session) et, avec votre consentement, des cookies d'analyse d'audience. Vous pouvez gérer vos
            préférences via notre bandeau de cookies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">8. Sécurité</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos
            données contre tout accès non autorisé, perte ou divulgation (chiffrement TLS, authentification
            à deux facteurs, QR codes signés cryptographiquement).
          </p>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800 pt-6 mt-8">
          <Link href="/" className="text-indigo-600 hover:underline text-sm">← Retour à l'accueil</Link>
        </div>
      </div>
    </main>
  );
}
