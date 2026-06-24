'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Wifi, XCircle } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import type { SocketScanEvent } from '@/types';
import { cn } from '@/lib/utils';

interface RealtimeFeedProps {
  eventId: string;
}

export function RealtimeFeed({ eventId }: RealtimeFeedProps) {
  const [scans, setScans] = useState<(SocketScanEvent & { id: string })[]>([]);
  const [isLive, setIsLive] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useSocket(eventId, {
    'scan:event': (data) => {
      setIsLive(true);
      setScans((prev) => [
        { ...data, id: crypto.randomUUID() },
        ...prev.slice(0, 19),
      ]);
    },
  });

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [scans]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Live Scan Feed</h3>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600')} />
          <Wifi className={cn('h-3.5 w-3.5', isLive ? 'text-green-500' : 'text-gray-400')} />
          <span className={cn('text-xs font-medium', isLive ? 'text-green-600 dark:text-green-400' : 'text-gray-400')}>
            {isLive ? 'Live' : 'Waiting...'}
          </span>
        </div>
      </div>

      <div ref={listRef} className="h-80 overflow-y-auto scrollbar-hide">
        {scans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Wifi className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Waiting for scans...</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Scans will appear here in real time</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {scans.map((scan) => (
              <motion.div
                key={scan.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0',
                  scan.isValid ? 'hover:bg-green-50/30 dark:hover:bg-green-900/5' : 'hover:bg-red-50/30 dark:hover:bg-red-900/5'
                )}
              >
                {scan.isValid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {scan.serialNumber}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">by {scan.controllerName}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className={cn(
                    'badge text-xs font-medium',
                    scan.isValid
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                  )}>
                    {scan.isValid ? 'Valid' : 'Invalid'}
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">
                    {new Date(scan.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
