'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/auth';
import type { SocketScanEvent } from '@/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

type SocketEventMap = {
  'scan:event': SocketScanEvent;
  'event:update': { eventId: string; ticketsScanned: number; capacity: number };
  'controller:online': { controllerId: string; name: string };
  'controller:offline': { controllerId: string };
};

export function useSocket(
  eventId: string | null,
  handlers: Partial<{ [K in keyof SocketEventMap]: (data: SocketEventMap[K]) => void }>
) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!eventId) return;

    const token = getAccessToken();
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:event', { eventId });
    });

    socket.on('scan:event', (data: SocketScanEvent) => {
      handlersRef.current['scan:event']?.(data);
    });

    socket.on('event:update', (data: SocketEventMap['event:update']) => {
      handlersRef.current['event:update']?.(data);
    });

    socket.on('controller:online', (data: SocketEventMap['controller:online']) => {
      handlersRef.current['controller:online']?.(data);
    });

    socket.on('controller:offline', (data: SocketEventMap['controller:offline']) => {
      handlersRef.current['controller:offline']?.(data);
    });

    return () => {
      socket.emit('leave:event', { eventId });
      socket.disconnect();
    };
  }, [eventId]);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const isConnected = useCallback(() => {
    return socketRef.current?.connected ?? false;
  }, []);

  return { emit, isConnected };
}
