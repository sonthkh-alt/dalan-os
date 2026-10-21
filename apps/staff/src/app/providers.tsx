'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ToastViewport } from '@/components/ui/toast';
import { RealtimeBridge } from '@/lib/socket';
import { OfflineQueueBridge } from '@/lib/offline-queue';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            retry: (count, error) => {
              const status = (error as { status?: number }).status;
              if (status && status >= 400 && status < 500) return false;
              return count < 2;
            },
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <RealtimeBridge />
      <OfflineQueueBridge />
      {children}
      <ToastViewport />
    </QueryClientProvider>
  );
}
