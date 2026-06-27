'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function PaymentDeclinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Paiement refusé</h1>
        <p className="text-sm text-gray-500">
          Votre paiement a été refusé par la banque. Vérifiez vos informations de carte et réessayez.
        </p>
        <Link
          href="/billetterie"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all"
        >
          Réessayer
        </Link>
      </div>
    </div>
  );
}
