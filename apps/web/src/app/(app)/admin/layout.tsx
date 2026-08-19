'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { ADMIN_TABS } from '@/components/layout/nav-items';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canAny } = useAuth();

  const tabs = ADMIN_TABS.filter((tab) => !tab.permissions || canAny(...tab.permissions));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Administration"
        description="Users, organisation structure, workflows and system settings."
      />

      <nav className="flex flex-wrap gap-1 border-b pb-px" aria-label="Administration sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
