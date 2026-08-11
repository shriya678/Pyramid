'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * TanStack Query provider. Client-scoped — one QueryClient per browser tab,
 * created in useState so React Fast Refresh doesn't blow away the cache
 * on every save during dev.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Server data is only invalidated by explicit mutations, so the
            // default 30s staleTime avoids reflighting the same query when
            // components remount (e.g. modal open/close).
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
