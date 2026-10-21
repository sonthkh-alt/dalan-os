'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from './api';

export interface RealtimeEvent {
  id: string;
  seq: number;
  type: string;
  aggregateType: string;
  aggregateId: string;
  branchId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Kết nối Socket.IO namespace /rt bằng token phiên khách; mỗi sự kiện của phiên làm mới
 * dữ liệu phiên (đơn, bill, yêu cầu). Tự kết nối lại khi mất mạng.
 */
export function useGuestRealtime(guestToken: string | null, onEvent?: (event: RealtimeEvent) => void): void {
  const queryClient = useQueryClient();
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!guestToken) return;
    const socket: Socket = io(`${API_BASE}/rt`, {
      auth: { token: guestToken },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
    socket.on('event', (event: RealtimeEvent) => {
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
      if (event.type.startsWith('bill.') || event.type.startsWith('payment.')) {
        void queryClient.invalidateQueries({ queryKey: ['bill'] });
      }
      if (event.type === 'menu.item.soldout' || event.type === 'menu.changed') {
        void queryClient.invalidateQueries({ queryKey: ['guest-menu'] });
      }
      handler.current?.(event);
    });
    socket.on('connect', () => {
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
    });
    return () => {
      socket.disconnect();
    };
  }, [guestToken, queryClient]);
}
