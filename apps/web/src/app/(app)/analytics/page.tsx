'use client';

import { useQuery } from '@tanstack/react-query';
import { Info, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { HorizontalBarChart } from '@/components/dashboard/charts';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api-client';
import type { UserSummary } from '@/lib/types';

interface BottleneckPerson {
  user: UserSummary | null;
  department: { id: string; name: string; color: string } | null;
  handledTasks: number;
  currentlyHolding: number;
  averageSeconds: number;
  averageHold: string;
  medianHold: string;
  longestHold: string;
  totalHold: string;
}

interface BottleneckStage {
  stage: {
    id: string;
    name: string;
    order: number;
    type: string;
    slaHours: number | null;
    workflow: { id: string; name: string; code: string } | null;
  } | null;
  passes: number;
  averageSeconds: number;
  averageHold: string;
  medianHold: string;
  longestHold: string;
  slaBreaches: number;
  slaBreachRate: number;
}

interface AnalyticsOverview {
  people: {
    rows: BottleneckPerson[];
    overallAverage: string;
    slowStages: BottleneckPerson[];
  };
  departments: Array<{
    department: { id: string; name: string; color: string } | null;
    handledTasks: number;
    averageSeconds: number;
    averageHold: string;
    medianHold: string;
  }>;
  stages: BottleneckStage[];
  aging: {
    buckets: Array<{ label: string; count: number }>;
    total: number;
  };
  workflows: Array<{
    workflow: { id: string; name: string; code: string };
    active: number;
    completed: number;
    averageCycle: string;
    medianCycle: string;
    averageHandovers: number;
  }>;
}

const ALL = '__all__';

/**
 * Bottleneck analytics. Framed as workflow analysis throughout: the goal is
 * finding where a process stalls, not ranking individuals.
 */
export default function AnalyticsPage() {
  const [departmentId, setDepartmentId] = useState<string>(ALL);

  const { data: departments } = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('departments'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'overview', departmentId],
    queryFn: () =>
      api.get<AnalyticsOverview>('analytics/overview', {
        query: { departmentId: departmentId === ALL ? undefined : departmentId },
      }),
  });

  const stageChart = (data?.stages ?? []).slice(0, 10).map((row) => ({
    label: row.stage?.name ?? 'Unassigned',
    value: Math.round((row.averageSeconds / 3600) * 10) / 10,
  }));

  const departmentChart = (data?.departments ?? []).map((row) => ({
    label: row.department?.name ?? 'Unassigned',
    value: Math.round((row.averageSeconds / 3600) * 10) / 10,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bottleneck analysis"
        description="How long work waits at each point in a workflow, so you can see where it gets stuck."
        actions={
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All departments</SelectItem>
              {(departments ?? []).map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          These figures measure how long tasks sit at each stage. A slow stage usually points to
          unclear handover rules, a capacity gap or a missing approval step — read it as workflow
          analysis, not individual performance.
        </p>
      </div>

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">By stage</TabsTrigger>
          <TabsTrigger value="people">By person</TabsTrigger>
          <TabsTrigger value="departments">By department</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="stages" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Average hold time per workflow stage</CardTitle>
              <CardDescription>Hours a task typically waits at each stage.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : stageChart.length === 0 ? (
                <EmptyState title="Not enough completed work to analyse yet" className="border-0" />
              ) : (
                <HorizontalBarChart data={stageChart} unit="hours" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto scroll-slim">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Stage</th>
                      <th className="px-4 py-2.5 text-left font-medium">Workflow</th>
                      <th className="px-4 py-2.5 text-right font-medium">Passes</th>
                      <th className="px-4 py-2.5 text-right font-medium">Average</th>
                      <th className="px-4 py-2.5 text-right font-medium">Median</th>
                      <th className="px-4 py-2.5 text-right font-medium">Longest</th>
                      <th className="px-4 py-2.5 text-right font-medium">Over target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.stages ?? []).map((row, index) => (
                      <tr key={(row.stage?.id ?? 'none') + index} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">{row.stage?.name ?? 'Unassigned'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {row.stage?.workflow?.name ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.passes}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                          {row.averageHold}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.medianHold}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.longestHold}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.stage?.slaHours ? (
                            <Badge variant={row.slaBreachRate > 25 ? 'warning' : 'secondary'}>
                              {row.slaBreachRate}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="people">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Average time work waits with each person</CardTitle>
              <CardDescription>
                Organisation average: {data?.people.overallAverage ?? '—'}. Long holds often reflect
                workload or unclear next steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto scroll-slim">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Person</th>
                      <th className="px-4 py-2.5 text-left font-medium">Department</th>
                      <th className="px-4 py-2.5 text-right font-medium">Tasks handled</th>
                      <th className="px-4 py-2.5 text-right font-medium">Holding now</th>
                      <th className="px-4 py-2.5 text-right font-medium">Average hold</th>
                      <th className="px-4 py-2.5 text-right font-medium">Median</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.people.rows ?? []).map((row, index) => (
                      <tr key={(row.user?.id ?? 'none') + index} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <UserChip user={row.user} showPosition />
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {row.department?.name ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.handledTasks}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.currentlyHolding}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                          {row.averageHold}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.medianHold}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Average hold time per department</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : departmentChart.length === 0 ? (
                <EmptyState title="No data for this filter" className="border-0" />
              ) : (
                <HorizontalBarChart data={departmentChart} unit="hours" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto scroll-slim">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Workflow</th>
                      <th className="px-4 py-2.5 text-right font-medium">Active</th>
                      <th className="px-4 py-2.5 text-right font-medium">Completed</th>
                      <th className="px-4 py-2.5 text-right font-medium">Average cycle</th>
                      <th className="px-4 py-2.5 text-right font-medium">Median cycle</th>
                      <th className="px-4 py-2.5 text-right font-medium">Avg. handovers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.workflows ?? []).map((row) => (
                      <tr key={row.workflow.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">{row.workflow.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.active}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.completed}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.averageCycle}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.medianCycle}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.averageHandovers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>How long open work has been outstanding</CardTitle>
              <CardDescription>{data?.aging.total ?? 0} open tasks.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-3 sm:grid-cols-5">
                {(data?.aging.buckets ?? []).map((bucket) => (
                  <div key={bucket.label} className="rounded-lg border p-4 text-center">
                    <p className="text-2xl font-semibold tabular-nums">{bucket.count}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{bucket.label}</p>
                  </div>
                ))}
              </div>
              {(data?.aging.buckets ?? []).length === 0 ? (
                <EmptyState
                  icon={TrendingDown}
                  title="No open work to age"
                  className="mt-3 border-0"
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
