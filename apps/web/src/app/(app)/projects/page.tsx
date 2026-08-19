'use client';

import { useQuery } from '@tanstack/react-query';
import { FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, humanize } from '@/lib/format';
import type { DepartmentRef, UserSummary } from '@/lib/types';

interface ProjectRow {
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
  _count: { tasks: number; members: number };
  stats: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    progress: number;
  };
}

export default function ProjectsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'list', search],
    queryFn: () => api.list<ProjectRow>('projects', { query: { search, pageSize: 50 } }),
  });

  const projects = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description="Delivery progress, workload and overdue work for each project."
        actions={
          can('manage_projects') ? (
            <Button asChild>
              <Link href="/admin/projects">
                <Plus className="h-4 w-4" aria-hidden />
                Manage projects
              </Link>
            </Button>
          ) : null
        }
      />

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search projects…"
        className="max-w-md"
        aria-label="Search projects"
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-52 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects found"
          description="Projects group related tasks and give each one a delivery view."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={'/projects/' + project.id}
              className="rounded focus-visible:outline-none"
            >
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color }}
                          aria-hidden
                        />
                        <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                      </div>
                      <p className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
                        {project.code}
                        {project.department ? ' · ' + project.department.name : ''}
                      </p>
                    </div>
                    <Badge variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {humanize(project.status)}
                    </Badge>
                  </div>

                  {project.description ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium tabular-nums">{project.stats.progress}%</span>
                    </div>
                    <Progress value={project.stats.progress} />
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/50 py-1.5">
                      <dt className="text-2xs text-muted-foreground">Active</dt>
                      <dd className="text-sm font-semibold tabular-nums">{project.stats.active}</dd>
                    </div>
                    <div className="rounded-md bg-muted/50 py-1.5">
                      <dt className="text-2xs text-muted-foreground">Done</dt>
                      <dd className="text-sm font-semibold tabular-nums">
                        {project.stats.completed}
                      </dd>
                    </div>
                    <div className="rounded-md bg-muted/50 py-1.5">
                      <dt className="text-2xs text-muted-foreground">Overdue</dt>
                      <dd
                        className={
                          'text-sm font-semibold tabular-nums ' +
                          (project.stats.overdue > 0 ? 'text-destructive' : '')
                        }
                      >
                        {project.stats.overdue}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                    <UserChip user={project.manager} emptyLabel="No manager" />
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {project.endDate ? 'Ends ' + formatDate(project.endDate) : '—'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
