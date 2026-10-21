'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeEnvelope } from '@dalan/contracts';
import { create } from 'zustand';
import { API_URL } from './api';
import { useAuth } from './auth-store';
import { useQueue } from './offline-queue';

interface RealtimeState {
  connected: boolean;
  lastSeq: number;
  /** Sự kiện mới nhất, để các màn hình (KDS) bật âm báo. */
  lastEvent: RealtimeEnvelope | null;
}

export const useRealtime = create<RealtimeState>(() => ({ connected: false, lastSeq: 0, lastEvent: null }));

let socket: Socket | null = null;

/** Làm mới query theo loại sự kiện. Khóa query thống nhất trong toàn app (xem query-keys.ts). */
export function invalidateForEvent(qc: QueryClient, e: RealtimeEnvelope): void {
  const payload = (e.payload ?? {}) as Record<string, unknown>;
  const sessionId = (payload.sessionId as string | undefined) ?? (e.aggregateType === 'session' ? e.aggregateId : undefined);
  const [resource] = e.type.split('.');
  switch (resource) {
    case 'session':
    case 'order':
    case 'service':
      void qc.invalidateQueries({ queryKey: ['floor'] });
      void qc.invalidateQueries({ queryKey: ['requests'] });
      if (sessionId) void qc.invalidateQueries({ queryKey: ['session', sessionId] });
      if (resource === 'order') void qc.invalidateQueries({ queryKey: ['kds'] });
      break;
    case 'kitchen':
      void qc.invalidateQueries({ queryKey: ['kds'] });
      if (sessionId) void qc.invalidateQueries({ queryKey: ['session', sessionId] });
      void qc.invalidateQueries({ queryKey: ['floor'] });
      break;
    case 'bill':
    case 'payment':
      if (sessionId) void qc.invalidateQueries({ queryKey: ['session', sessionId] });
      if (payload.billId) void qc.invalidateQueries({ queryKey: ['bill', payload.billId as string] });
      void qc.invalidateQueries({ queryKey: ['floor'] });
      void qc.invalidateQueries({ queryKey: ['shift'] });
      break;
    case 'menu':
      void qc.invalidateQueries({ queryKey: ['menu'] });
      break;
    case 'shift':
      void qc.invalidateQueries({ queryKey: ['shift'] });
      break;
    case 'print':
      void qc.invalidateQueries({ queryKey: ['print-jobs'] });
      break;
    case 'reservation':
      void qc.invalidateQueries({ queryKey: ['reservations'] });
      if (sessionId) void qc.invalidateQueries({ queryKey: ['floor'] });
      break;
    case 'event':
      void qc.invalidateQueries({ queryKey: ['events'] });
      if (payload.eventId) void qc.invalidateQueries({ queryKey: ['event', payload.eventId as string] });
      break;
    case 'customer':
      void qc.invalidateQueries({ queryKey: ['customers'] });
      if (payload.customerId) void qc.invalidateQueries({ queryKey: ['customer', payload.customerId as string] });
      break;
    default:
      break;
  }
}

/** Kết nối Socket.IO namespace /rt khi đã đăng nhập; tải bù sự kiện bị lỡ khi kết nối lại. */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const token = useAuth((s) => s.accessToken);
  const stationCode = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      socket?.disconnect();
      socket = null;
      useRealtime.setState({ connected: false });
      return;
    }
    if (typeof window !== 'undefined') stationCode.current = window.localStorage.getItem('dalan-kds-station');
    const s = io(`${API_URL}/rt`, {
      auth: { token, stationCode: stationCode.current ?? undefined },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socket = s;
    s.on('connect', () => {
      useRealtime.setState({ connected: true });
      useQueue.getState().setOnline(true);
      const lastSeq = useRealtime.getState().lastSeq;
      s.emit('sync', { lastSeq }, (res: { events?: RealtimeEnvelope[] }) => {
        for (const e of res?.events ?? []) {
          invalidateForEvent(qc, e);
          if (e.seq > useRealtime.getState().lastSeq) useRealtime.setState({ lastSeq: e.seq });
        }
      });
    });
    s.on('disconnect', () => useRealtime.setState({ connected: false }));
    s.on('event', (e: RealtimeEnvelope) => {
      invalidateForEvent(qc, e);
      useRealtime.setState({ lastSeq: Math.max(useRealtime.getState().lastSeq, e.seq), lastEvent: e });
    });
    return () => {
      s.disconnect();
      if (socket === s) socket = null;
    };
  }, [token, qc]);

  return null;
}

/** Đổi trạm KDS cần kết nối lại để vào phòng trạm. */
export function reconnectRealtime(): void {
  const current = socket;
  if (!current) return;
  const token = useAuth.getState().accessToken;
  if (!token) return;
  current.auth = { token, stationCode: window.localStorage.getItem('dalan-kds-station') ?? undefined };
  current.disconnect().connect();
}
