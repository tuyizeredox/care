'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ClipboardList,
  Hourglass,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/stat-card';
import { TaskListCard } from '@/components/dashboard/task-list-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { api } from '@/lib/api-client';
import type { StatusTotals, TaskSummary, UserSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TeamDashboardData {
  teamSize: number;
  totals: StatusTotals;
  averageCompletionHours: number | null;
  workload: Array<{
    user: UserSummary;
    activeTasks: number;
    overdueTasks: number;
    awaitingReview: number;
  }>;
  awaitingReview: TaskSummary[];
  overdue: TaskSummary[];
  bottlenecks: Array<TaskSummary & { heldFor: string; heldForSeconds: number }>;
}

/**
 * Manager view: team workload, what is late, what needs reviewing, and which
 * tasks have been sitting with one person the longest.
 */
export function TeamDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'team'],
    queryFn: () => api.get<TeamDashboardData>('dashboard/team'),
  });

  const busiest = Math.max(1, ...(data?.workload ?? []).map((row) => row.activeTasks));

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team members"
          value={data?.teamSize ?? 0}
          loading={isLoading}
        />
        <StatCard
          label="Active team tasks"
          value={data?.totals.active ?? 0}
          loading={isLoading}
        />
        <StatCard
          label="Overdue"
          value={data?.totals.overdue ?? 0}
          tone={(data?.totals.overdue ?? 0) > 0 ? 'danger' : 'default'}
          loading={isLoading}
        />
        <StatCard
          label="Awaiting review"
          value={data?.totals.awaitingReview ?? 0}
          tone={(data?.totals.awaitingReview ?? 0) > 0 ? 'warning' : 'default'}
          loading={isLoading}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle>Employee workload</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (data?.workload ?? []).length === 0 ? (
              <EmptyState
                icon={Users}
                title="No direct reports"
                description="Team workload appears once people report to you."
                className="border-0"
              />
            ) : (
              <ul className="space-y-3">
                {(data?.workload ?? []).map((row) => (
                  <li key={row.user.id}>
                    <Link
                      href={'/people/' + row.user.id}
                      className="flex items-center gap-3 rounded-md p-1 transition-colors hover:bg-accent/60"
                    >
                      <UserChip user={row.user} showPosition className="w-52 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Progress
                          value={(row.activeTasks / busiest) * 100}
                          indicatorClassName={cn(
                            row.overdueTasks > 0 ? 'bg-amber-500' : 'bg-primary',
                          )}
                          aria-label={row.activeTasks + ' active tasks'}
                        />
                      </div>
                      <div className="flex w-40 shrink-0 justify-end gap-3 text-xs tabular-nums">
                        <span title="Active tasks">{row.activeTasks} active</span>
                        <span
                          title="Overdue tasks"
                          className={cn(
                            row.overdueTasks > 0 ? 'font-medium text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {row.overdueTasks} late
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Sitting longest with one person</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (data?.bottlenecks ?? []).length === 0 ? (
              <EmptyState
                icon={Hourglass}
                title="Nothing is stuck"
                description="No task has been held unusually long."
                className="border-0"
              />
            ) : (
              <ul className="-mx-2 divide-y">
                {(data?.bottlenecks ?? []).slice(0, 6).map((task) => (
                  <li key={task.id}>
                    <Link
                      href={'/tasks/' + task.number}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{task.title}</span>
                        <span className="mt-0.5 block">
                          <UserChip user={task.currentOwner} />
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        {task.heldFor}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TaskListCard
          title="Awaiting review or approval"
          tasks={data?.awaitingReview}
          loading={isLoading}
          showOwner
          icon={ClipboardList}
          emptyTitle="Nothing waiting on a reviewer"
          viewAllHref="/tasks?status=SUBMITTED,UNDER_REVIEW"
        />
        <TaskListCard
          title="Overdue team work"
          tasks={data?.overdue}
          loading={isLoading}
          showOwner
          icon={AlertTriangle}
          emptyTitle="Nothing overdue"
          emptyDescription="Your team is on top of its deadlines."
          viewAllHref="/tasks?overdue=true"
        />
      </section>
    </div>
  );
}
