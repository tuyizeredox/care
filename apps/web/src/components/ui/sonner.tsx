'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast } from 'sonner';

/** Toast host. Mounted once in Providers. */
export function Toaster() {
  const { theme = 'light' } = useTheme();

  return (
    <Sonner
      theme={theme as 'light' | 'dark' | 'system'}
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: 'group rounded-lg border shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}

export { toast };
