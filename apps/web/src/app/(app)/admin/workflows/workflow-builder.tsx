'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import type { WorkflowRow } from './page';

const NONE = '__none__';

type StageType = 'WORK' | 'REVIEW' | 'APPROVAL' | 'FINAL';

interface StageDraft {
  id?: string;
  name: string;
  order: number;
  type: StageType;
  assigneeMode: string;
  positionId?: string;
  entryStatus: string;
  slaHours?: number;
  isFinal: boolean;
}

const ASSIGNEE_MODES: Array<{ value: string; label: string }> = [
  { value: 'UNASSIGNED', label: 'Chosen when the task is created' },
  { value: 'POSITION', label: 'Whoever holds a position' },
  { value: 'DEPARTMENT_HEAD', label: 'Head of the task department' },
  { value: 'PROJECT_MANAGER', label: 'Manager of the project' },
  { value: 'MANAGER_OF_PREVIOUS', label: 'Line manager of the previous holder' },
  { value: 'TASK_CREATOR', label: 'Whoever created the task' },
];

const STATUS_FOR_TYPE: Record<StageType, string> = {
  WORK: 'ASSIGNED',
  REVIEW: 'UNDER_REVIEW',
  APPROVAL: 'SUBMITTED',
  FINAL: 'COMPLETED',
};

const emptyStage = (order: number): StageDraft => ({
  name: '',
  order,
  type: 'WORK',
  assigneeMode: 'UNASSIGNED',
  entryStatus: 'ASSIGNED',
  isFinal: false,
});

/** Create or edit a workflow and its stage chain. */
export function WorkflowBuilderDialog({
  workflow,
  open,
  onOpenChange,
}: {
  workflow: WorkflowRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [taskTypeId, setTaskTypeId] = useState(NONE);
  const [departmentId, setDepartmentId] = useState(NONE);
  const [isActive, setIsActive] = useState(true);
  const [stages, setStages] = useState<StageDraft[]>([emptyStage(1)]);

  const { data: taskTypes } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('task-types'),
    enabled: open,
  });
  const { data: departments } = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('departments'),
    enabled: open,
  });
  const { data: positions } = useQuery({
    queryKey: ['positions', 'options'],
    queryFn: () => api.get<Array<{ id: string; title: string }>>('positions'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (workflow) {
      setName(workflow.name);
      setCode(workflow.code);
      setDescription(workflow.description ?? '');
      setTaskTypeId(workflow.taskType?.id ?? NONE);
      setDepartmentId(workflow.department?.id ?? NONE);
      setIsActive(workflow.isActive);
      setStages(
        workflow.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          order: stage.order,
          type: stage.type,
          assigneeMode: stage.assigneeMode,
          positionId: stage.position?.id,
          entryStatus: stage.entryStatus,
          slaHours: stage.slaHours ?? undefined,
          isFinal: stage.isFinal,
        })),
      );
    } else {
      setName('');
      setCode('');
      setDescription('');
      setTaskTypeId(NONE);
      setDepartmentId(NONE);
      setIsActive(true);
      setStages([emptyStage(1)]);
    }
  }, [open, workflow]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        taskTypeId: taskTypeId === NONE ? undefined : taskTypeId,
        departmentId: departmentId === NONE ? undefined : departmentId,
        isActive,
        stages: stages.map((stage, index) => ({
          id: stage.id,
          name: stage.name.trim(),
          order: index + 1,
          type: stage.type,
          assigneeMode: stage.assigneeMode,
          positionId: stage.assigneeMode === 'POSITION' ? stage.positionId : undefined,
          entryStatus: STATUS_FOR_TYPE[stage.type],
          requiresApproval: stage.type === 'APPROVAL',
          slaHours: stage.slaHours,
          isFinal: index === stages.length - 1,
        })),
        transitions: stages.slice(0, -1).map((_stage, index) => ({
          fromOrder: index + 1,
          toOrder: index + 2,
        })),
      };

      return workflow
        ? api.patch('workflows/' + workflow.id, payload)
        : api.post('workflows', { ...payload, code: code.trim().toUpperCase() });
    },
    onSuccess: () => {
      toast.success(workflow ? 'Workflow updated' : 'Workflow created');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'workflows'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not save the workflow', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const updateStage = (index: number, patch: Partial<StageDraft>) => {
    setStages((current) =>
      current.map((stage, position) => (position === index ? { ...stage, ...patch } : stage)),
    );
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    setStages(next.map((stage, position) => ({ ...stage, order: position + 1 })));
  };

  const valid = name.trim().length > 1 && (workflow || code.trim().length > 1) &&
    stages.length > 0 && stages.every((stage) => stage.name.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{workflow ? 'Edit workflow' : 'New workflow'}</DialogTitle>
          <DialogDescription>
            Stages run in order. Each stage decides who holds the task and what status it takes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="workflow-name" required>
                Name
              </Label>
              <Input
                id="workflow-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Procurement request"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workflow-code" required>
                Code
              </Label>
              <Input
                id="workflow-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="PROCUREMENT"
                disabled={Boolean(workflow)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workflow-description">Description</Label>
            <Textarea
              id="workflow-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="workflow-tasktype">Task type</Label>
              <Select value={taskTypeId} onValueChange={setTaskTypeId}>
                <SelectTrigger id="workflow-tasktype">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any task type</SelectItem>
                  {(taskTypes ?? []).map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="workflow-department">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="workflow-department">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any department</SelectItem>
                  {(departments ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2 pb-1.5">
              <Switch id="workflow-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="workflow-active" className="font-normal">
                Active
              </Label>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Stages</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStages([...stages, emptyStage(stages.length + 1)])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add stage
              </Button>
            </div>

            <ol className="space-y-2">
              {stages.map((stage, index) => (
                <li key={index} className="rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold">
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={stage.name}
                        onChange={(event) => updateStage(index, { name: event.target.value })}
                        placeholder="Stage name, e.g. Technical review"
                        aria-label={'Stage ' + (index + 1) + ' name'}
                      />

                      <div className="grid gap-2 sm:grid-cols-3">
                        <Select
                          value={stage.type}
                          onValueChange={(value) =>
                            updateStage(index, {
                              type: value as StageType,
                              entryStatus: STATUS_FOR_TYPE[value as StageType],
                            })
                          }
                        >
                          <SelectTrigger aria-label="Stage type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WORK">Work</SelectItem>
                            <SelectItem value="REVIEW">Review</SelectItem>
                            <SelectItem value="APPROVAL">Approval</SelectItem>
                            <SelectItem value="FINAL">Final</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={stage.assigneeMode}
                          onValueChange={(value) => updateStage(index, { assigneeMode: value })}
                        >
                          <SelectTrigger aria-label="Who holds it">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNEE_MODES.map((mode) => (
                              <SelectItem key={mode.value} value={mode.value}>
                                {mode.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Input
                          type="number"
                          min={1}
                          value={stage.slaHours ?? ''}
                          onChange={(event) =>
                            updateStage(index, {
                              slaHours: event.target.value ? Number(event.target.value) : undefined,
                            })
                          }
                          placeholder="Target hours"
                          aria-label="Target turnaround in hours"
                        />
                      </div>

                      {stage.assigneeMode === 'POSITION' ? (
                        <Select
                          value={stage.positionId ?? ''}
                          onValueChange={(value) => updateStage(index, { positionId: value })}
                        >
                          <SelectTrigger aria-label="Position">
                            <SelectValue placeholder="Choose a position" />
                          </SelectTrigger>
                          <SelectContent>
                            {(positions ?? []).map((position) => (
                              <SelectItem key={position.id} value={position.id}>
                                {position.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveStage(index, -1)}
                        disabled={index === 0}
                        aria-label="Move stage up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveStage(index, 1)}
                        disabled={index === stages.length - 1}
                        aria-label="Move stage down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setStages(stages.filter((_stage, position) => position !== index))
                        }
                        disabled={stages.length === 1}
                        aria-label="Remove stage"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid} loading={save.isPending}>
            {workflow ? 'Save workflow' : 'Create workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
