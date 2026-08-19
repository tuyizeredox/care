'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Hourglass,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { TaskListCard } from '@/components/dashboard/task-list-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { ErrorState } from '@/components/empty-state';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatPercent, formatRelative } from '@/lib/format';
import type { StatusTotals, TaskSummary } from '@/lib/types';
import { TeamDashboard } from './team-dashboard';
import { OrganizationDashboard } from './organization-dashboard';

interface MyDashboard {
  totals: StatusTotals;
  performance: {
    tasksCompleted: number;
    completedThisMonth: number;
    completionRate: number;
    overdueTasks: number;
    averageCompletion: string | null;
  };
  buckets: {
    assigned: TaskSummary[];
    inProgress: TaskSummary[];
    dueToday: TaskSummary[];
    dueSoon: TaskSummary[];
    overdue: TaskSummary[];
    submitted: TaskSummary[];
    changesRequested: TaskSummary[];
    awaitingMyReview: TaskSummary[];
  };
  pendingApprovals: number;
  waitingOnOthers: TaskSummary[];
  recentActivity: Array<{
    id: string;
    summary: string;
    createdAt: string;
    actor: { firstName: string; lastName: string; avatarUrl: string | null } | null;
    task: { number: number; title: string } | null;
  }>;
}

export default function DashboardPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('me');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: () => api.get<MyDashboard>('dashboard'),
  });

  const showTeam = can('view_team_tasks');
  const showOrganization = can('view_analytics');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="What needs you, what is waiting on other people, and what is running late."
        actions={
          can('create_task') ? (
            <Button asChild>
              <Link href="/tasks/new">New task</Link>
            </Button>
          ) : null
        }
      />

      {isError ? (
        <ErrorState
          title="We could not load your dashboard."
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          {showTeam || showOrganization ? (
            <TabsList>
              <TabsTrigger value="me">My work</TabsTrigger>
              {showTeam ? <TabsTrigger value="team">My team</TabsTrigger> : null}
              {showOrganization ? <TabsTrigger value="org">Organisation</TabsTrigger> : null}
            </TabsList>
          ) : null}

          <TabsContent value="me" className="space-y-6">
            <section
              aria-label="My task summary"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
            >
              <StatCard
                label="Assigned to me"
                value={data?.totals.active ?? 0}
                loading={isLoading}
                href="/tasks?assignedToMe=true"
              />
              <StatCard
                label="Due today"
                value={data?.totals.dueToday ?? 0}
                tone={(data?.totals.dueToday ?? 0) > 0 ? 'warning' : 'default'}
                loading={isLoading}
                href="/tasks?assignedToMe=true&dueToday=true"
              />
              <StatCard
                label="Overdue"
                value={data?.totals.overdue ?? 0}
                tone={(data?.totals.overdue ?? 0) > 0 ? 'danger' : 'default'}
                loading={isLoading}
                href="/tasks?assignedToMe=true&overdue=true"
              />
              <StatCard
                label="Awaiting review"
                value={data?.totals.awaitingReview ?? 0}
                loading={isLoading}
                href="/tasks?needsMyAction=true"
              />
              <StatCard
                label="Approvals for me"
                value={data?.pendingApprovals ?? 0}
                tone={(data?.pendingApprovals ?? 0) > 0 ? 'warning' : 'default'}
                loading={isLoading}
                href="/approvals"
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <TaskListCard
                title="Needs your attention"
                tasks={[
                  ...(data?.buckets.overdue ?? []),
                  ...(data?.buckets.changesRequested ?? []),
                ]}
                loading={isLoading}
                icon={CheckCircle2}
                emptyTitle="Nothing overdue"
                emptyDescription="No overdue work, and nothing has been sent back for changes."
                viewAllHref="/tasks?assignedToMe=true&overdue=true"
              />
              <TaskListCard
                title="In progress"
                tasks={data?.buckets.inProgress}
                loading={isLoading}
                icon={Clock}
                emptyTitle="Nothing in progress"
                emptyDescription="Start a task from your assigned list and it will appear here."
                viewAllHref="/tasks?assignedToMe=true&status=IN_PROGRESS"
              />
              <TaskListCard
                title="Assigned, not started"
                tasks={data?.buckets.assigned}
                loading={isLoading}
                icon={Inbox}
                emptyTitle="Nothing waiting to be picked up"
                viewAllHref="/tasks?assignedToMe=true&status=ASSIGNED"
              />
              <TaskListCard
                title="Waiting for other people"
                tasks={data?.waitingOnOthers}
                loading={isLoading}
                icon={Hourglass}
                showOwner
                emptyTitle="You are not waiting on anyone"
                emptyDescription="Tasks you created that someone else now holds appear here."
                viewAllHref="/tasks?waitingOnOthers=true"
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>My performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 pt-0">
                  <Metric label="Tasks completed" value={data?.performance.tasksCompleted ?? 0} />
                  <Metric
                    label="Completed this month"
                    value={data?.performance.completedThisMonth ?? 0}
                  />
                  <Metric
                    label="Completion rate"
                    value={formatPercent(data?.performance.completionRate)}
                  />
                  <Metric
                    label="Average completion time"
                    value={data?.performance.averageCompletion ?? '—'}
                  />
                  <Metric
                    label="Currently overdue"
                    value={data?.performance.overdueTasks ?? 0}
                    tone={(data?.performance.overdueTasks ?? 0) > 0 ? 'danger' : 'default'}
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle>Recent activity on your work</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {(data?.recentActivity ?? []).length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No activity yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {(data?.recentActivity ?? []).slice(0, 8).map((entry) => (
                        <li key={entry.id} className="flex items-start gap-2.5">
                          <UserAvatar
                            user={
                              entry.actor
                                ? {
                                    id: entry.id,
                                    firstName: entry.actor.firstName,
                                    lastName: entry.actor.lastName,
                                    avatarUrl: entry.actor.avatarUrl,
                                  }
                                : null
                            }
                            className="h-7 w-7"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-snug">
                              {entry.summary}
                              {entry.task ? (
                                <Link
                                  href={'/tasks/' + entry.task.number}
                                  className="ml-1 font-medium text-primary hover:underline"
                                >
                                  #{entry.task.number}
                                </Link>
                              ) : null}
                            </p>
                            <p className="text-2xs text-muted-foreground">
                              {formatRelative(entry.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          {showTeam ? (
            <TabsContent value="team">
              <TeamDashboard />
            </TabsContent>
          ) : null}

          {showOrganization ? (
            <TabsContent value="org">
              <OrganizationDashboard />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          'text-sm font-semibold tabular-nums ' +
          (tone === 'danger' ? 'text-destructive' : 'text-foreground')
        }
      >
        {value}
      </span>
    </div>
  );
}
