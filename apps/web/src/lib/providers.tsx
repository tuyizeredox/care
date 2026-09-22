'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from './auth-context';
import { ApiError } from './api-client';
import { registerServiceWorker } from './pwa';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Never retry an authorisation or validation failure.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  useEffect(registerServiceWorker, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <AuthProvider>
          {children}
          <Toaster />
          <InstallPrompt />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
