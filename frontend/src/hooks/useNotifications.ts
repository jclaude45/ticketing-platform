'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { notificationsApi } from '@/lib/api';
import { useSocketContext } from '@/providers/SocketProvider';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string | null;
  createdAt: string;
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const { socket } = useSocketContext();

  const { data, isLoading } = useQuery<AppNotification[]>({
    queryKey: ['notifications'],
    queryFn: () =>
      notificationsApi.getAll().then((r) => {
        const d = (r.data as any);
        return d.data ?? d;
      }),
    staleTime: 10_000,
    refetchInterval: 15_000,   // fallback polling every 15s if WebSocket misses
    refetchOnWindowFocus: true,
  });

  // Listen for real-time new notifications
  useEffect(() => {
    if (!socket) return;
    const handler = (notification: AppNotification) => {
      queryClient.setQueryData<AppNotification[]>(['notifications'], (prev) =>
        prev ? [notification, ...prev] : [notification],
      );
    };
    socket.on('notification:new', handler);
    return () => { socket.off('notification:new', handler); };
  }, [socket, queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<AppNotification[]>(['notifications'], (prev) =>
        prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? [],
      );
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.setQueryData<AppNotification[]>(['notifications'], (prev) =>
        prev?.map((n) => ({ ...n, read: true })) ?? [],
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => notificationsApi.remove(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<AppNotification[]>(['notifications'], (prev) =>
        prev?.filter((n) => n.id !== id) ?? [],
      );
    },
  });

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, isLoading, markRead, markAllRead, remove };
}
