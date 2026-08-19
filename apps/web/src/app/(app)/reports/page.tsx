'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileBarChart, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ReportDefinition {
  type: string;
  title: string;
  description: string;
}

interface ReportResult {
  type: string;
  title: string;
  description: string;
  generatedAt: string;
  columns: Array<{ key: string; label: string; numeric?: boolean }>;
  rows: Array<Record<string, string | number | null>>;
  summary: Array<{ label: string; value: string | number }>;
}

const ALL = '__all__';

export default function ReportsPage() {
  const { can } = useAuth();
  const [type, setType] = useState('task-completion');
  const [departmentId, setDepartmentId] = useState(ALL);
  const [projectId, setProjectId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: definitions } = useQuery({
    queryKey: ['reports', 'definitions'],
    queryFn: () => api.get<ReportDefinition[]>('reports'),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('departments'),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => api.list<{ id: string; name: string }>('projects', { query: { pageSize: 100 } }),
  });

  const filters = {
    type,
    departmentId: departmentId === ALL ? undefined : departmentId,
    projectId: projectId === ALL ? undefined : projectId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'generate', filters],
    queryFn: () => api.get<ReportResult>('reports/generate', { query: filters }),
  });

  const exportReport = useMutation({
    mutationFn: (format: 'csv' | 'excel' | 'pdf') =>
      api.download('reports/export', { ...filters, format }),
    onSuccess: () => toast.success('Report downloaded'),
    onError: (error) => {
      toast.error('Export failed', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Filter, review and export performance reports across the organisation."
        actions={
          can('export_reports') ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReport.mutate('csv')}
                loading={exportReport.isPending && exportReport.variables === 'csv'}
              >
                <FileText className="h-4 w-4" aria-hidden />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReport.mutate('excel')}
                loading={exportReport.isPending && exportReport.variables === 'excel'}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReport.mutate('pdf')}
                loading={exportReport.isPending && exportReport.variables === 'pdf'}
              >
                <Download className="h-4 w-4" aria-hidden />
                PDF
              </Button>
            </>
          ) : null
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="report-type">Report</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(definitions ?? []).map((definition) => (
                  <SelectItem key={definition.type} value={definition.type}>
                    {definition.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-department">Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger id="report-department">
                <SelectValue />
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="report-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {(projects?.data ?? []).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-to">To</Label>
            <Input
              id="report-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !report ? (
        <EmptyState icon={FileBarChart} title="Choose a report to run" />
      ) : (
        <>
          {report.summary.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {report.summary.map((entry) => (
                <div key={entry.label} className="rounded-lg border bg-card p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {entry.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{entry.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{report.title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {report.description} · Generated {formatDateTime(report.generatedAt)} ·{' '}
                {report.rows.length} row(s)
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {report.rows.length === 0 ? (
                <EmptyState
                  title="No data for these filters."
                  description="Widen the date range or clear a filter."
                  className="m-4 border-dashed"
                />
              ) : (
                <div className="overflow-x-auto scroll-slim">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        {report.columns.map((column) => (
                          <th
                            key={column.key}
                            className={cn(
                              'whitespace-nowrap px-4 py-2.5 font-medium',
                              column.numeric ? 'text-right' : 'text-left',
                            )}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.rows.slice(0, 200).map((row, index) => (
                        <tr key={index} className="hover:bg-muted/30">
                          {report.columns.map((column) => (
                            <td
                              key={column.key}
                              className={cn(
                                'px-4 py-2.5',
                                column.numeric ? 'text-right tabular-nums' : '',
                              )}
                            >
                              {row[column.key] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {report.rows.length > 200 ? (
                    <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                      Showing the first 200 rows. Export the report to see all{' '}
                      {report.rows.length}.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
