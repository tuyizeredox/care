'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { TaskListCard } from '@/components/dashboard/task-list-card';
import { UserChip } from '@/components/user-chip';
import { ErrorState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { api } from '@/lib/api-client';
import { formatDuration, formatPercent, formatRelative } from '@/lib/format';
import type { TaskSummary, UserSummary } from '@/lib/types';
import { fullName } from '@/lib/utils';

interface PersonProfile extends UserSummary {
  phone: string | null;
  bio: string | null;
  status: string;
  lastLoginAt: string | null;
  role: { id: string; key: string; name: string; level: number };
  manager: UserSummary | null;
  reports: UserSummary[];
  projectMemberships: Array<{
    role: string;
    project: { id: string; name: string; code: string; color: string; status: string };
  }>;
  stats: {
    activeTasks: number;
    completedTasks: number;
    overdueTasks: number;
    awaitingReview: number;
    createdTasks: number;
    completionRate: number;
    averageCompletionSeconds: number | null;
  };
}

/**
 * Person profile. Shows role, team and workload - deliberately not contact
 * details beyond work email and phone, or anything from their account record.
 */
export default function PersonPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const { data: person, isLoading, isError } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get<PersonProfile>('users/' + userId),
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'by-owner', userId],
    queryFn: () =>
      api.list<TaskSummary>('tasks', { query: { ownerId: [userId], pageSize: 10 } }),
    enabled: Boolean(person),
  });

  const { data: activity } = useQuery({
    queryKey: ['user', userId, 'activity'],
    queryFn: () =>
      api.get<Array<{ id: string; summary: string; createdAt: string; task: { number: number } | null }>>(
        'users/' + userId + '/activity',
      ),
    enabled: Boolean(person),
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !person) {
    return (
      <ErrorState
        title="We could not open this profile."
        action={
          <Link href="/organization" className="text-sm font-medium text-primary hover:underline">
            Back to the directory
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <Link
            href="/organization"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Organisation
          </Link>
        }
        title={fullName(person)}
        description={person.position?.title ?? person.jobTitle ?? undefined}
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <UserAvatar user={person} className="h-16 w-16 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{fullName(person)}</h2>
              <Badge variant="secondary">{person.role.name}</Badge>
              {person.status !== 'ACTIVE' ? (
                <Badge variant="warning">{person.status.toLowerCase()}</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[person.position?.title, person.department?.name].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <a
                href={'mailto:' + person.email}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {person.email}
              </a>
              {person.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {person.phone}
                </span>
              ) : null}
            </div>
          </div>

          {person.manager ? (
            <div className="shrink-0 rounded-md border px-3 py-2">
              <p className="eyebrow">Reports to</p>
              <div className="mt-1">
                <UserChip
                  user={person.manager}
                  showPosition
                  href={'/people/' + person.manager.id}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active tasks" value={person.stats.activeTasks} />
        <StatCard label="Completed" value={person.stats.completedTasks} tone="success" />
        <StatCard
          label="Overdue"
          value={person.stats.overdueTasks}
          tone={person.stats.overdueTasks > 0 ? 'danger' : 'default'}
        />
        <StatCard label="Completion rate" value={formatPercent(person.stats.completionRate)} />
        <StatCard
          label="Average completion"
          value={formatDuration(person.stats.averageCompletionSeconds)}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TaskListCard
            title="Current work"
            tasks={tasks?.data}
            emptyTitle="No open tasks"
            emptyDescription="Nothing is currently assigned to this person."
            viewAllHref={'/tasks?ownerId=' + person.id}
            limit={8}
          />
        </div>

        <div className="space-y-4">
          {person.reports.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Direct reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0">
                {person.reports.map((report) => (
                  <UserChip
                    key={report.id}
                    user={report}
                    showPosition
                    href={'/people/' + report.id}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}

          {person.projectMemberships.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Projects</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {person.projectMemberships.map((membership) => (
                  <Link
                    key={membership.project.id}
                    href={'/projects/' + membership.project.id}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: membership.project.color }}
                        aria-hidden
                      />
                      <span className="truncate">{membership.project.name}</span>
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {membership.role.toLowerCase()}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(activity ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="space-y-2">
                  {(activity ?? []).slice(0, 8).map((entry) => (
                    <li key={entry.id} className="text-xs leading-snug">
                      <span>{entry.summary}</span>
                      {entry.task ? (
                        <Link
                          href={'/tasks/' + entry.task.number}
                          className="ml-1 font-medium text-primary hover:underline"
                        >
                          #{entry.task.number}
                        </Link>
                      ) : null}
                      <span className="ml-1 text-muted-foreground">
                        · {formatRelative(entry.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
