'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { formatDeadline } from '@/lib/format';
import type { TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TaskListCardProps {
  title: string;
  tasks: TaskSummary[] | undefined;
  loading?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  icon?: LucideIcon;
  viewAllHref?: string;
  /** Show the owner instead of the deadline - used on team views. */
  showOwner?: boolean;
  limit?: number;
}

/** Compact task list used throughout the dashboards. */
export function TaskListCard({
  title,
  tasks,
  loading,
  emptyTitle,
  emptyDescription,
  icon,
  viewAllHref,
  showOwner = false,
  limit = 6,
}: TaskListCardProps) {
  const visible = (tasks ?? []).slice(0, limit);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{title}</CardTitle>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1 pt-0">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={icon}
            title={emptyTitle}
            description={emptyDescription}
            className="border-0 py-8"
          />
        ) : (
          <ul className="-mx-2 divide-y">
            {visible.map((task) => (
              <li key={task.id}>
                <Link
                  href={'/tasks/' + task.number}
                  className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-2xs text-muted-foreground">
                        #{task.number}
                      </span>
                      <span className="truncate text-sm font-medium">{task.title}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <StatusBadge status={task.status} />
                      {showOwner ? (
                        <UserChip user={task.currentOwner} />
                      ) : (
                        <span
                          className={cn(
                            'text-xs',
                            task.deadlineMeta?.isOverdue
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {formatDeadline(task.deadline, task.deadlineMeta)}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
