import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatNumberVi, formatVnd, formatVndCompact } from '@dalan/domain';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const money = (n: number | bigint | string | null | undefined): string => formatVnd(Number(n ?? 0));
export const moneyPlain = (n: number | bigint | string | null | undefined): string => formatNumberVi(Number(n ?? 0));
export const moneyShort = (n: number | bigint | string | null | undefined): string => formatVndCompact(Number(n ?? 0));

/** "12 phút", "1g 05p" */
export function elapsed(from: string | Date, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(from).getTime();
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  return `${h}g ${(m % 60).toString().padStart(2, '0')}p`;
}

export function timeHM(value: string | Date): string {
  return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function dateTimeVi(value: string | Date): string {
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

export function qty(value: number | string): string {
  const n = Number(value);
  return Number.isInteger(n) ? n.toString() : n.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}

export function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
