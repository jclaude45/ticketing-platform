'use client';

import { Crown, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface UpgradePlanModalProps {
  open: boolean;
  onClose: () => void;
  featureName?: string;
}

export function UpgradePlanModal({ open, onClose, featureName }: UpgradePlanModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 max-w-md w-full relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
            <Crown size={32} className="text-amber-400" />
          </div>

          <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-4">
            Passez à un plan supérieur
          </h2>

          <p className="text-sm text-gray-500 mt-2">
            {featureName ?? 'Cette fonctionnalité'} n&apos;est pas disponible dans votre abonnement actuel.
          </p>

          <Link
            href="/dashboard/subscription"
            onClick={onClose}
            className="mt-6 w-full block bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 font-semibold text-center transition-colors"
          >
            Voir les plans disponibles
          </Link>

          <button
            onClick={onClose}
            className="mt-3 w-full border border-gray-200 text-gray-600 rounded-xl py-3 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            Plus tard
          </button>

          <p className="mt-4 text-xs text-gray-400">
            Contactez votre administrateur pour activer un plan.
          </p>
        </div>
      </div>
    </div>
  );
}
