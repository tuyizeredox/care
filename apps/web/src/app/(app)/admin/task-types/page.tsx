'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shapes, Tag } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { RowActions } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { TagDialog, TaskTypeDialog } from './catalog-dialogs';

export interface TaskTypeRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  _count: { tasks: number; workflows: number };
}

export interface TagRow {
  id: string;
  name: string;
  color: string;
  _count: { tasks: number };
}

type PendingDelete = { kind: 'task-type'; row: TaskTypeRow } | { kind: 'tag'; row: TagRow };

/** The vocabularies tasks are classified with: task types and tags. */
export default function AdminTaskTypesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManageTypes = can('manage_workflows');
  const canManageTags = can('manage_settings');

  const [typeDialog, setTypeDialog] = useState<{ row: TaskTypeRow | null } | null>(null);
  const [tagDialog, setTagDialog] = useState<{ row: TagRow | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const { data: taskTypes, isLoading: typesLoading } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => api.get<TaskTypeRow[]>('task-types'),
    enabled: canManageTypes,
  });
  const { data: tags, isLoading: tagsLoading } = useQuery({
    queryKey: ['tags', 'admin'],
    queryFn: () => api.get<TagRow[]>('tags'),
    enabled: canManageTags,
  });

  const remove = useMutation({
    mutationFn: (target: PendingDelete) =>
      api.delete((target.kind === 'tag' ? 'tags/' : 'task-types/') + target.row.id),
    onSuccess: (_result, target) => {
      toast.success(target.kind === 'tag' ? 'Tag deleted' : 'Task type deleted');
      setPendingDelete(null);
      void queryClient.invalidateQueries({
        queryKey: [target.kind === 'tag' ? 'tags' : 'task-types'],
      });
    },
    onError: (error) => {
      toast.error('Could not delete', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canManageTypes ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>Task types</CardTitle>
            <Button size="sm" onClick={() => setTypeDialog({ row: null })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New task type
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {typesLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (taskTypes ?? []).length === 0 ? (
              <EmptyState icon={Shapes} title="No task types yet" />
            ) : (
              <ul className="divide-y rounded-md border">
                {(taskTypes ?? []).map((taskType) => (
                  <li key={taskType.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {taskType.name}
                        <span className="font-mono text-2xs font-normal text-muted-foreground">
                          {taskType.code}
                        </span>
                      </p>
                      {taskType.description ? (
                        <p className="truncate text-2xs text-muted-foreground">
                          {taskType.description}
                        </p>
                      ) : null}
                      <p className="text-2xs text-muted-foreground">
                        {taskType._count.tasks} task(s) · {taskType._count.workflows} workflow(s)
                      </p>
                    </div>
                    <RowActions
                      label={taskType.name}
                      onEdit={() => setTypeDialog({ row: taskType })}
                      onDelete={() => setPendingDelete({ kind: 'task-type', row: taskType })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canManageTags ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>Tags</CardTitle>
            <Button size="sm" onClick={() => setTagDialog({ row: null })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New tag
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {tagsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (tags ?? []).length === 0 ? (
              <EmptyState
                icon={Tag}
                title="No tags yet"
                description="People can also create tags as they label tasks."
              />
            ) : (
              <ul className="divide-y rounded-md border">
                {(tags ?? []).map((tag) => (
                  <li key={tag.id} className="flex items-center gap-3 px-3 py-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{tag.name}</span>
                    <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                      {tag._count.tasks} task(s)
                    </span>
                    <RowActions
                      label={tag.name}
                      onEdit={() => setTagDialog({ row: tag })}
                      onDelete={() => setPendingDelete({ kind: 'tag', row: tag })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <TaskTypeDialog
        key={'type-' + (typeDialog?.row?.id ?? 'new')}
        taskType={typeDialog?.row ?? null}
        open={typeDialog !== null}
        onOpenChange={(open) => !open && setTypeDialog(null)}
      />

      <TagDialog
        key={'tag-' + (tagDialog?.row?.id ?? 'new')}
        tag={tagDialog?.row ?? null}
        open={tagDialog !== null}
        onOpenChange={(open) => !open && setTagDialog(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={
          pendingDelete?.kind === 'tag'
            ? 'Delete the “' + pendingDelete.row.name + '” tag?'
            : 'Delete the ' + (pendingDelete?.row.name ?? '') + ' task type?'
        }
        description={
          pendingDelete?.kind === 'tag'
            ? 'It is removed from the ' +
              pendingDelete.row._count.tasks +
              ' task(s) that carry it. Past task history is not changed.'
            : 'It can no longer be chosen for new tasks. Existing tasks keep it so reports stay accurate.'
        }
        confirmLabel={pendingDelete?.kind === 'tag' ? 'Delete tag' : 'Delete task type'}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
        loading={remove.isPending}
      />
    </div>
  );
}
