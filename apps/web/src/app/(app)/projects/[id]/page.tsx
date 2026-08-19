'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { TaskTable } from '@/components/tasks/task-table';
import { UserChip } from '@/components/user-chip';
import { ErrorState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';
import { formatDate, humanize } from '@/lib/format';
import type { DepartmentRef, TaskSummary, UserSummary } from '@/lib/types';

interface ProjectDetail {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  color: string;
  startDate: string | null;
  endDate: string | null;
  manager: UserSummary | null;
  department: DepartmentRef | null;
  members: Array<{ id: string; role: string; user: UserSummary }>;
  workflows: Array<{ id: string; name: string; code: string; isActive: boolean }>;
  stats: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    blocked: number;
    awaitingReview: number;
    progress: number;
    averageCompletionHours: number | null;
  };
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<ProjectDetail>('projects/' + projectId),
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', 'by-project', projectId],
    queryFn: () =>
      api.list<TaskSummary>('tasks', {
        query: { projectId: [projectId], pageSize: 50, sortBy: 'deadline', sortOrder: 'asc' },
      }),
    enabled: Boolean(project),
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <ErrorState
        title="We could not open this project."
        action={
          <Link href="/projects" className="text-sm font-medium text-primary hover:underline">
            Back to projects
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
            href="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Projects
          </Link>
        }
        title={project.name}
        description={project.description ?? undefined}
        actions={<Badge variant="secondary">{humanize(project.status)}</Badge>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total tasks" value={project.stats.total} />
        <StatCard label="Active" value={project.stats.active} />
        <StatCard label="Completed" value={project.stats.completed} tone="success" />
        <StatCard
          label="Overdue"
          value={project.stats.overdue}
          tone={project.stats.overdue > 0 ? 'danger' : 'default'}
        />
        <StatCard label="Awaiting review" value={project.stats.awaitingReview} />
      </section>

      <div className="grid gap-5 lg:grid-cols-4">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Delivery progress</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {project.stats.completed} of {project.stats.total} tasks completed
                </span>
                <span className="font-semibold tabular-nums">{project.stats.progress}%</span>
              </div>
              <Progress value={project.stats.progress} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Project tasks</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <TaskTable
                tasks={tasks?.data ?? []}
                loading={tasksLoading}
                emptyTitle="No tasks in this project yet"
                emptyDescription="Create a task and assign it to this project."
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              <Row label="Code">{project.code}</Row>
              <Row label="Department">{project.department?.name ?? '—'}</Row>
              <Row label="Manager">
                <UserChip
                  user={project.manager}
                  href={project.manager ? '/people/' + project.manager.id : null}
                />
              </Row>
              <Row label="Start">{formatDate(project.startDate)}</Row>
              <Row label="End">{formatDate(project.endDate)}</Row>
              <Row label="Average completion">
                {project.stats.averageCompletionHours
                  ? project.stats.averageCompletionHours + ' hours'
                  : '—'}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                Team
              </CardTitle>
              <span className="text-xs text-muted-foreground">{project.members.length}</span>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {project.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                project.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-2">
                    <UserChip
                      user={member.user}
                      showPosition
                      href={'/people/' + member.user.id}
                    />
                    <Badge variant="secondary" className="shrink-0">
                      {member.role.toLowerCase()}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {project.workflows.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Workflows</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {project.workflows.map((workflow) => (
                  <p key={workflow.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{workflow.name}</span>
                    {!workflow.isActive ? (
                      <Badge variant="secondary" className="shrink-0">
                        inactive
                      </Badge>
                    ) : null}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}
