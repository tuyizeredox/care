import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div id="main-content">{children}</div>
    </AppShell>
  );
}
