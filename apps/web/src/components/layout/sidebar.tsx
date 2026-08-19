'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth-context';
import { cn, fullName } from '@/lib/utils';
import { NAV_SECTIONS } from './nav-items';

interface SidebarProps {
  /** Mobile drawer state. On desktop the rail is always visible. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, canAny } = useAuth();

  const isActive = (href: string): boolean =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permissions || canAny(...item.permissions)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[15rem] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="rounded">
            <Brand />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto scroll-slim px-3 py-4">
          {visibleSections.map((section, index) => (
            <div key={section.label} className={cn(index > 0 && 'mt-6')}>
              <p className="eyebrow px-2 pb-2">{section.label}</p>
              <ul className="space-y-px">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded px-2 py-1.5 text-[13px] transition-colors',
                          active
                            ? 'bg-sidebar-accent font-medium text-foreground'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                        )}
                      >
                        {/* A 2px rule reads as selection without shouting. */}
                        <span
                          className={cn(
                            'absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary transition-opacity',
                            active ? 'opacity-100' : 'opacity-0',
                          )}
                          aria-hidden
                        />
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {user ? (
          <div className="border-t border-sidebar-border p-3">
            <Link
              href="/profile"
              onClick={onClose}
              className="flex items-center gap-2.5 rounded px-1.5 py-1.5 transition-colors hover:bg-sidebar-accent/60"
            >
              <UserAvatar user={user} className="h-7 w-7" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {fullName(user)}
                </span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {user.position?.title ?? user.role?.name}
                </span>
              </span>
            </Link>
          </div>
        ) : null}
      </aside>
    </>
  );
}
