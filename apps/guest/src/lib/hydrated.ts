'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** true sau khi đã chạy trên trình duyệt (tránh lệch SSR với store lưu localStorage). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
