'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/stat-card';
import { TaskListCard } from '@/components/dashboard/task-list-card';
import { BreakdownPieChart, ComparisonBarChart, TrendLineChart } from '@/components/dashboard/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { api } from '@/lib/api-client';
import { formatPercent, formatRelative, humanize } from '@/lib/format';
import { WAITING_REASON_LABELS } from '@/lib/constants';
import type { DepartmentRef, StatusTotals, TaskSummary, UserSummary } from '@/lib/types';

interface DepartmentRow extends StatusTotals {
  department: DepartmentRef;
  averageCompletion: string | null;
}

interface OrganizationDashboardData {
  totals: StatusTotals;
  averageCompletion: string | null;
  departments: DepartmentRow[];
  projects: Array<StatusTotals & { project: { id: string; name: string; code: string } }>;
  highPriority: TaskSummary[];
  waitingFor: {
    byReason: Array<{ reason: string; count: number }>;
    byPerson: Array<{ user: UserSummary | null; count: number }>;
  };
  completionTrend: Array<{ week: string; created: number; completed: number }>;
  recentActivity: Array<{
    id: string;
    summary: string;
    createdAt: string;
    actor: { firstName: string; lastName: string } | null;
    task: { number: number; title: string } | null;
  }>;
}

/** Country Director view: how the whole organisation is performing. */
export function OrganizationDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'organization'],
    queryFn: () => api.get<OrganizationDashboardData>('dashboard/organization'),
  });

  const departmentChart = (data?.departments ?? []).map((row) => ({
    label: row.department.name,
    Active: row.active,
    Completed: row.completed,
    Overdue: row.overdue,
  }));

  const trendChart = (data?.completionTrend ?? []).map((point) => ({
    label: point.week.slice(5),
    Created: point.created,
    Completed: point.completed,
  }));

  const waitingChart = (data?.waitingFor.byReason ?? []).map((row) => ({
    label: WAITING_REASON_LABELS[row.reason] ?? humanize(row.reason),
    value: row.count,
  }));

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total tasks" value={data?.totals.total ?? 0} loading={isLoading} />
        <StatCard
          label="Active"
          value={data?.totals.active ?? 0}
          loading={isLoading}
        />
        <StatCard
          label="Completion rate"
          value={formatPercent(data?.totals.completionRate)}
          tone="success"
          loading={isLoading}
        />
        <StatCard
          label="Overdue"
          value={data?.totals.overdue ?? 0}
          hint={formatPercent(data?.totals.overduePercentage) + ' of active work'}
          tone={(data?.totals.overdue ?? 0) > 0 ? 'danger' : 'default'}
          loading={isLoading}
        />
        <StatCard
          label="Average completion"
          value={data?.averageCompletion ?? '—'}
          loading={isLoading}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Department comparison</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : departmentChart.length === 0 ? (
              <EmptyState title="No department data yet" className="border-0" />
            ) : (
              <ComparisonBarChart
                data={departmentChart}
                series={[
                  { key: 'Active', name: 'Active', color: '#4338CA' },
                  { key: 'Completed', name: 'Completed', color: '#10B981' },
                  { key: 'Overdue', name: 'Overdue', color: '#EF4444' },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>What work is waiting for</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <BreakdownPieChart data={waitingChart} />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Created vs completed, by week</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <TrendLineChart
                data={trendChart}
                series={[
                  { key: 'Created', name: 'Created', color: '#0EA5E9' },
                  { key: 'Completed', name: 'Completed', color: '#10B981' },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Who the organisation is waiting on</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            ) : (data?.waitingFor.byPerson ?? []).length === 0 ? (
              <EmptyState icon={Hourglass} title="Nothing outstanding" className="border-0" />
            ) : (
              <ul className="space-y-2.5">
                {(data?.waitingFor.byPerson ?? []).slice(0, 8).map((row, index) => (
                  <li
                    key={row.user?.id ?? index}
                    className="flex items-center justify-between gap-3"
                  >
                    <UserChip user={row.user} showPosition />
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TaskListCard
          title="High-priority active work"
          tasks={data?.highPriority}
          loading={isLoading}
          showOwner
          icon={AlertTriangle}
          emptyTitle="No critical or high-priority work open"
          viewAllHref="/tasks?priority=HIGH,CRITICAL"
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Latest activity across the organisation</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <ul className="space-y-2.5">
                {(data?.recentActivity ?? []).slice(0, 10).map((entry) => (
                  <li key={entry.id} className="text-sm leading-snug">
                    <span className="font-medium">
                      {entry.actor ? entry.actor.firstName + ' ' + entry.actor.lastName : 'System'}
                    </span>{' '}
                    <span className="text-muted-foreground">{entry.summary.toLowerCase()}</span>
                    {entry.task ? (
                      <Link
                        href={'/tasks/' + entry.task.number}
                        className="ml-1 font-medium text-primary hover:underline"
                      >
                        #{entry.task.number}
                      </Link>
                    ) : null}
                    <span className="ml-1 text-2xs text-muted-foreground">
                      · {formatRelative(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Department performance</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 text-left font-medium">Department</th>
                  <th className="py-2 text-right font-medium">Active</th>
                  <th className="py-2 text-right font-medium">Completed</th>
                  <th className="py-2 text-right font-medium">Overdue</th>
                  <th className="py-2 text-right font-medium">Completion rate</th>
                  <th className="py-2 text-right font-medium">Avg. completion</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.departments ?? []).map((row) => (
                  <tr key={row.department.id} className="hover:bg-muted/40">
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: row.department.color }}
                          aria-hidden
                        />
                        {row.department.name}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{row.active}</td>
                    <td className="py-2.5 text-right tabular-nums">{row.completed}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={row.overdue > 0 ? 'font-medium text-destructive' : ''}>
                        {row.overdue}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatPercent(row.completionRate)}
                    </td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {row.averageCompletion ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
