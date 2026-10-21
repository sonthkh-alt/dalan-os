'use client';

import Dexie, { type EntityTable } from 'dexie';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { uuid } from './utils';

/**
 * Hàng đợi lệnh ghi khi mất mạng: lệnh được lưu IndexedDB với Idempotency-Key cố định và phát lại
 * theo thứ tự khi có mạng. Dùng cho các thao tác gọi món, yêu cầu khách, bếp (an toàn khi gửi lại).
 */
export interface QueuedCommand {
  id: string;
  createdAt: number;
  method: string;
  path: string;
  body: unknown;
  idempotencyKey: string;
  label: string;
  attempts: number;
  lastError?: string;
  /** Khóa query cần làm mới sau khi gửi thành công. */
  invalidate?: string[][];
}

class StaffDb extends Dexie {
  commands!: EntityTable<QueuedCommand, 'id'>;
  constructor() {
    super('dalan-staff');
    this.version(1).stores({ commands: 'id, createdAt' });
  }
}

let db: StaffDb | null = null;
function getDb(): StaffDb | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!db) db = new StaffDb();
  return db;
}

interface QueueState {
  pending: number;
  online: boolean;
  replaying: boolean;
  setOnline: (v: boolean) => void;
  setPending: (n: number) => void;
  setReplaying: (v: boolean) => void;
}

export const useQueue = create<QueueState>((set) => ({
  pending: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  replaying: false,
  setOnline: (online) => set({ online }),
  setPending: (pending) => set({ pending }),
  setReplaying: (replaying) => set({ replaying }),
}));

async function refreshPending(): Promise<void> {
  const d = getDb();
  if (!d) return;
  useQueue.getState().setPending(await d.commands.count());
}

export interface QueuedResult {
  queued: true;
  id: string;
}

/**
 * Thực hiện lệnh ghi; nếu không có mạng thì xếp hàng và trả về { queued: true }.
 * Lệnh gửi lại dùng cùng Idempotency-Key nên máy chủ không xử lý hai lần.
 */
export async function runOrQueue<T>(input: { method: string; path: string; body?: unknown; label: string; invalidate?: string[][] }): Promise<T | QueuedResult> {
  const idempotencyKey = uuid();
  try {
    return await api<T>(input.method, input.path, input.body, { idempotencyKey });
  } catch (err) {
    if (err instanceof ApiError && err.isNetwork) {
      const d = getDb();
      if (!d) throw err;
      const cmd: QueuedCommand = { id: uuid(), createdAt: Date.now(), method: input.method, path: input.path, body: input.body, idempotencyKey, label: input.label, attempts: 0, invalidate: input.invalidate };
      await d.commands.add(cmd);
      await refreshPending();
      useQueue.getState().setOnline(false);
      return { queued: true, id: cmd.id };
    }
    throw err;
  }
}

export function isQueued(result: unknown): result is QueuedResult {
  return typeof result === 'object' && result !== null && (result as QueuedResult).queued === true;
}

let replayLock = false;
export async function replayQueue(onSuccess?: (cmd: QueuedCommand) => void): Promise<void> {
  const d = getDb();
  if (!d || replayLock) return;
  replayLock = true;
  useQueue.getState().setReplaying(true);
  try {
    const commands = await d.commands.orderBy('createdAt').toArray();
    for (const cmd of commands) {
      try {
        await api(cmd.method, cmd.path, cmd.body, { idempotencyKey: cmd.idempotencyKey });
        await d.commands.delete(cmd.id);
        onSuccess?.(cmd);
      } catch (err) {
        if (err instanceof ApiError && err.isNetwork) {
          useQueue.getState().setOnline(false);
          break; // vẫn mất mạng, giữ nguyên thứ tự
        }
        // Lỗi nghiệp vụ (bàn đã đóng, món hết...): bỏ lệnh để không chặn hàng đợi, ghi lại lỗi
        await d.commands.update(cmd.id, { attempts: cmd.attempts + 1, lastError: (err as Error).message });
        if (cmd.attempts + 1 >= 3) await d.commands.delete(cmd.id);
      }
    }
  } finally {
    await refreshPending();
    useQueue.getState().setReplaying(false);
    replayLock = false;
  }
}

export async function listQueued(): Promise<QueuedCommand[]> {
  const d = getDb();
  return d ? d.commands.orderBy('createdAt').toArray() : [];
}

export async function dropQueued(id: string): Promise<void> {
  await getDb()?.commands.delete(id);
  await refreshPending();
}

/** Theo dõi trạng thái mạng và tự phát lại hàng đợi. */
export function OfflineQueueBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    void refreshPending();
    const onOnline = () => {
      useQueue.getState().setOnline(true);
      void replayQueue((cmd) => {
        for (const key of cmd.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
      });
    };
    const onOffline = () => useQueue.getState().setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(() => {
      if (navigator.onLine) onOnline();
    }, 15_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, [qc]);
  return null;
}
