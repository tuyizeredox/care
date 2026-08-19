'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronDown, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserAvatar } from '@/components/ui/avatar';
import { api } from '@/lib/api-client';
import type { UserSummary } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';

interface ChartNode {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  position: { id: string; title: string; level?: number } | null;
  department: { id: string; name: string; code?: string; color: string } | null;
  activeTaskCount?: number;
  reports: ChartNode[];
}

interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string | null;
  head: UserSummary | null;
  _count?: { members: number; positions: number };
}

/** Organisation directory: departments, people and the reporting tree. */
export default function OrganizationPage() {
  const [search, setSearch] = useState('');

  const { data: chart, isLoading: chartLoading } = useQuery({
    queryKey: ['organization', 'chart'],
    queryFn: () => api.get<ChartNode[]>('organization/chart'),
  });

  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ['departments', 'directory'],
    queryFn: () => api.get<DepartmentRow[]>('departments'),
  });

  const { data: people, isLoading: peopleLoading } = useQuery({
    queryKey: ['users', 'directory', search],
    queryFn: () =>
      api.list<UserSummary>('users/directory', { query: { search, pageSize: 200 } }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Organisation"
        description="Departments, people, positions and who reports to whom."
      />

      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart">Org chart</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Reporting structure</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {chartLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : (chart ?? []).length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="No reporting structure yet"
                  description="Assign managers to employees to build the org chart."
                  className="border-0"
                />
              ) : (
                <ul className="space-y-1">
                  {(chart ?? []).map((node) => (
                    <OrgNode key={node.id} node={node} depth={0} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          {departmentsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Skeleton key={index} className="h-36 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(departments ?? []).map((department) => (
                <Card key={department.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: department.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">{department.name}</h3>
                        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                          {department.code}
                        </p>
                        {department.description ? (
                          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                            {department.description}
                          </p>
                        ) : null}
                        <div className="mt-3 border-t pt-2.5">
                          <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
                            Department head
                          </p>
                          <UserChip
                            user={department.head}
                            showPosition
                            href={department.head ? '/people/' + department.head.id : null}
                          />
                        </div>
                        {department._count ? (
                          <p className="mt-2 flex items-center gap-1 text-2xs text-muted-foreground">
                            <Users className="h-3 w-3" aria-hidden />
                            {department._count.members} people ·{' '}
                            {department._count.positions} positions
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="people" className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people by name, email or position…"
            className="max-w-md"
            aria-label="Search people"
          />

          {peopleLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : (people?.data ?? []).length === 0 ? (
            <EmptyState icon={Users} title="Nobody matched that search" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(people?.data ?? []).map((person) => (
                <Link
                  key={person.id}
                  href={'/people/' + person.id}
                  className="rounded border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar user={person} className="h-10 w-10" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{fullName(person)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {person.position?.title ?? person.jobTitle ?? '—'}
                      </p>
                      {person.department ? (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-2xs text-muted-foreground">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: person.department.color }}
                            aria-hidden
                          />
                          {person.department.name}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgNode({ node, depth }: { node: ChartNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasReports = node.reports.length > 0;

  return (
    <li>
      <div
        className="flex items-center gap-1.5 rounded-md py-1"
        style={{ paddingLeft: depth * 20 }}
      >
        {hasReports ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="w-[1.375rem]" aria-hidden />
        )}

        <Link
          href={'/people/' + node.id}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:bg-accent/40',
            depth === 0 && 'border-primary/30 bg-primary/[0.04]',
          )}
        >
          <UserAvatar user={node} className="h-7 w-7" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{fullName(node)}</span>
            <span className="block truncate text-2xs text-muted-foreground">
              {node.position?.title ?? '—'}
            </span>
          </span>
          {node.department ? (
            <span
              className="hidden shrink-0 rounded px-1.5 py-0.5 text-2xs sm:inline"
              style={{
                backgroundColor: node.department.color + '1A',
                color: node.department.color,
              }}
            >
              {node.department.name}
            </span>
          ) : null}
          {hasReports ? (
            <span className="shrink-0 text-2xs text-muted-foreground">
              {node.reports.length} report(s)
            </span>
          ) : null}
        </Link>
      </div>

      {hasReports && expanded ? (
        <ul className="space-y-1">
          {node.reports.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
