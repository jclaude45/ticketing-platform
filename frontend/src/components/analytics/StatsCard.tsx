'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  // Accept pre-rendered ReactNode so callers can pass <Icon className="..." />
  icon: ReactNode;
  color?: 'indigo' | 'purple' | 'green' | 'blue' | 'red' | 'yellow' | 'violet' | 'amber' | 'emerald';
  description?: string;
  suffix?: string;
  isLoading?: boolean;
}

// Plain icon like the app rows: ink, the status colours keep their meaning
const iconColor: Record<NonNullable<StatsCardProps['color']>, string> = {
  indigo: 'text-black dark:text-white', purple: 'text-black dark:text-white', violet: 'text-black dark:text-white',
  blue: 'text-black dark:text-white', amber: 'text-black dark:text-white',
  green: 'text-green-600', emerald: 'text-green-600', red: 'text-red-600', yellow: 'text-amber-500',
};

export function StatsCard({
  title, value, change, changeType = 'neutral',
  icon, color = 'indigo', description, suffix, isLoading,
}: StatsCardProps) {
  if (isLoading) {
    return (
      <div className="stats-card animate-pulse">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-6 w-6 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  return (
    <motion.div className="stats-card">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl sm:text-3xl font-black tracking-tight text-black dark:text-white mt-1">
            {value}
            {suffix && <span className="text-sm font-normal text-gray-400 ml-1">{suffix}</span>}
          </p>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
        </div>
        <div className={cn('flex-shrink-0 flex items-center justify-center', iconColor[color])}>
          {icon}
        </div>
      </div>
      {change && (
        <div className="mt-4 flex items-center gap-1.5">
          {changeType === 'positive' ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : changeType === 'negative' ? (
            <TrendingDown className="h-4 w-4 text-red-500" />
          ) : null}
          <span className={cn('text-sm font-medium',
            changeType === 'positive' ? 'text-green-600 dark:text-green-400' :
            changeType === 'negative' ? 'text-red-600 dark:text-red-400' :
            'text-gray-500 dark:text-gray-400'
          )}>
            {change}
          </span>
          <span className="text-xs text-gray-400">vs mois dernier</span>
        </div>
      )}
    </motion.div>
  );
}
