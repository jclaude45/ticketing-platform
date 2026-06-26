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

const colorMap: Record<NonNullable<StatsCardProps['color']>, string> = {
  indigo:  'bg-indigo-100  dark:bg-indigo-900/30  text-indigo-600  dark:text-indigo-400',
  purple:  'bg-purple-100  dark:bg-purple-900/30  text-purple-600  dark:text-purple-400',
  violet:  'bg-violet-100  dark:bg-violet-900/30  text-violet-600  dark:text-violet-400',
  green:   'bg-green-100   dark:bg-green-900/30   text-green-600   dark:text-green-400',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  blue:    'bg-blue-100    dark:bg-blue-900/30    text-blue-600    dark:text-blue-400',
  amber:   'bg-amber-100   dark:bg-amber-900/30   text-amber-600   dark:text-amber-400',
  red:     'bg-red-100     dark:bg-red-900/30     text-red-600     dark:text-red-400',
  yellow:  'bg-yellow-100  dark:bg-yellow-900/30  text-yellow-600  dark:text-yellow-400',
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
          <div className="h-11 w-11 rounded-xl bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
      className="stats-card card-hover"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-1">
            {value}
            {suffix && <span className="text-sm font-normal text-gray-400 ml-1">{suffix}</span>}
          </p>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
        </div>
        <div className={cn('flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center', colorMap[color])}>
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
