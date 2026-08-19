'use client';

import Link from 'next/link';
import { ADMIN_TABS } from '@/components/layout/nav-items';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';

const DESCRIPTIONS: Record<string, string> = {
  '/admin/users': 'Create accounts, set roles, reporting lines and per-user permissions.',
  '/admin/organization': 'Departments, positions and the structural reporting tree.',
  '/admin/workflows': 'Build the routes tasks follow, stage by stage.',
  '/admin/roles': 'Roles and the permissions attached to each of them.',
  '/admin/settings': 'Organisation name, defaults and notification behaviour.',
  '/admin/audit': 'Every security-relevant action recorded by the system.',
};

export default function AdminHomePage() {
  const { canAny } = useAuth();
  const tabs = ADMIN_TABS.filter((tab) => !tab.permissions || canAny(...tab.permissions));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link key={tab.href} href={tab.href} className="rounded-lg focus-visible:outline-none">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/30">
              <CardContent className="p-5">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                </span>
                <h2 className="text-sm font-semibold">{tab.label}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {DESCRIPTIONS[tab.href] ?? ''}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
