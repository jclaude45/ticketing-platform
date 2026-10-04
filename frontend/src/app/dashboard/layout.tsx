'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';
import { WorkspaceBanner } from '@/components/layout/WorkspaceBanner';
import { TrialBanner } from '@/components/layout/TrialBanner';
import { ZayaLogo } from '@/components/site/ZayaLogo';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  // Controllers have their own restricted space and never see the organizer dashboard
  const isController = user?.role === 'CONTROLLER';
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    } else if (!isLoading && isController) {
      router.replace('/controle');
    }
  }, [isAuthenticated, isLoading, isController, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <ZayaLogo className="animate-pulse text-[34px] dark:text-white" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || isController) return null;

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <div className={cn('fixed lg:relative z-50 lg:z-auto h-full transition-transform duration-200', !sidebarOpen && '-translate-x-full lg:translate-x-0')}>
        <Sidebar />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <WorkspaceBanner />
        <TrialBanner />
        <motion.main
          className="flex-1 overflow-y-auto p-4 md:p-5 lg:p-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
