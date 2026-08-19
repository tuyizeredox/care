'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, Copy, GitBranch, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { humanize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WorkflowBuilderDialog } from './workflow-builder';

export interface WorkflowStage {
  id: string;
  name: string;
  description: string | null;
  order: number;
  type: 'WORK' | 'REVIEW' | 'APPROVAL' | 'FINAL';
  assigneeMode: string;
  assigneeUser: { id: string; firstName: string; lastName: string } | null;
  position: { id: string; title: string } | null;
  role: { id: string; key: string; name: string } | null;
  entryStatus: string;
  requiresApproval: boolean;
  slaHours: number | null;
  isFinal: boolean;
}

export interface WorkflowRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  taskType: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  stages: WorkflowStage[];
  _count: { tasks: number };
}

const STAGE_TONE: Record<string, string> = {
  WORK: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  REVIEW: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  APPROVAL: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  FINAL: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

/** Workflow builder: each workflow is a named chain of stages. */
export default function AdminWorkflowsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WorkflowRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'workflows'],
    queryFn: () => api.list<WorkflowRow>('workflows', { query: { pageSize: 50 } }),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post('workflows/' + id + '/duplicate'),
    onSuccess: () => {
      toast.success('Workflow duplicated', { description: 'The copy is inactive until you enable it.' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'workflows'] });
    },
    onError: (error) => {
      toast.error('Could not duplicate the workflow', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const workflows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Different work follows different routes. A task picks the best-matching workflow unless
          the creator chooses one.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New workflow
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No workflows configured"
          description="Create a workflow to define how a type of task travels through the organisation."
          action={<Button onClick={() => setCreating(true)}>Create the first workflow</Button>}
        />
      ) : (
        <div className="space-y-4">
          {workflows.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {workflow.name}
                    <span className="font-mono text-2xs font-normal text-muted-foreground">
                      {workflow.code}
                    </span>
                    {workflow.isDefault ? <Badge variant="default">Default</Badge> : null}
                    {!workflow.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
                  </CardTitle>
                  {workflow.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">{workflow.description}</p>
                  ) : null}
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {[
                      workflow.taskType ? 'Task type: ' + workflow.taskType.name : null,
                      workflow.department ? 'Department: ' + workflow.department.name : null,
                      workflow.project ? 'Project: ' + workflow.project.name : null,
                      workflow._count.tasks + ' task(s) using it',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => duplicate.mutate(workflow.id)}
                    loading={duplicate.isPending && duplicate.variables === workflow.id}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Duplicate
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(workflow)}>
                    Edit
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <ol className="flex flex-wrap items-center gap-2">
                  {workflow.stages.map((stage, index) => (
                    <li key={stage.id} className="flex items-center gap-2">
                      <div
                        className={cn(
                          'rounded-md px-3 py-2 text-xs',
                          STAGE_TONE[stage.type] ?? STAGE_TONE.WORK,
                        )}
                      >
                        <p className="font-medium">{stage.name}</p>
                        <p className="mt-0.5 opacity-80">
                          {stage.position?.title ??
                            (stage.assigneeUser
                              ? stage.assigneeUser.firstName + ' ' + stage.assigneeUser.lastName
                              : humanize(stage.assigneeMode))}
                        </p>
                        {stage.slaHours ? (
                          <p className="mt-0.5 opacity-70">Target: {stage.slaHours}h</p>
                        ) : null}
                      </div>
                      {index < workflow.stages.length - 1 ? (
                        <ArrowDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" aria-hidden />
                      ) : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WorkflowBuilderDialog
        workflow={editing}
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />
    </div>
  );
}
