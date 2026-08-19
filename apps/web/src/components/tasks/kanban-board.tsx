'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GripVertical, MessageSquare, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PriorityBadge } from '@/components/status-badge';
import { UserChip } from '@/components/user-chip';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { KANBAN_COLUMNS, STATUS_META, type TaskStatus } from '@/lib/constants';
import { formatDeadline } from '@/lib/format';
import type { TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Kanban board.
 *
 * Dropping a card asks the API to change status; the API enforces the workflow
 * rules, so an invalid move is refused server-side and reported here rather
 * than being silently allowed in the UI.
 */
export function KanbanBoard({
  tasks,
  loading,
  canMove,
}: {
  tasks: TaskSummary[];
  loading?: boolean;
  canMove: boolean;
}) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<TaskSummary | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const move = useMutation({
    mutationFn: ({ task, status }: { task: TaskSummary; status: TaskStatus }) =>
      api.patch('tasks/' + task.id + '/status', { status }),
    onSuccess: (_result, variables) => {
      toast.success('Task moved', {
        description: '#' + variables.task.number + ' is now ' + STATUS_META[variables.status].label.toLowerCase() + '.',
      });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      toast.error('This move is not allowed', {
        description:
          error instanceof ApiError
            ? error.message
            : 'The workflow does not permit that transition.',
      });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((entry) => entry.id === event.active.id);
    setDragging(task ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const task = tasks.find((entry) => entry.id === active.id);
    const status = over.id as TaskStatus;
    if (!task || task.status === status) return;

    move.mutate({ task, status });
  };

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto scroll-slim pb-3">
        {KANBAN_COLUMNS.map((status) => (
          <div key={status} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto scroll-slim pb-3">
        {KANBAN_COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            canMove={canMove}
          />
        ))}
      </div>

      <DragOverlay>
        {dragging ? <KanbanCard task={dragging} canMove={false} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  tasks,
  canMove,
}: {
  status: TaskStatus;
  tasks: TaskSummary[];
  canMove: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];

  return (
    <section
      ref={setNodeRef}
      aria-label={meta.label}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded border bg-muted/30 transition-colors',
        isOver && 'border-primary bg-primary/[0.05]',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden />
          <h3 className="text-sm font-medium">{meta.label}</h3>
        </span>
        <span className="rounded bg-background px-1.5 py-0.5 text-2xs font-medium tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto scroll-slim p-2">
        {tasks.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
        ) : (
          tasks.map((task) => <KanbanCard key={task.id} task={task} canMove={canMove} />)
        )}
      </div>
    </section>
  );
}

function KanbanCard({
  task,
  canMove,
  overlay = false,
}: {
  task: TaskSummary;
  canMove: boolean;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canMove,
  });

  const style = transform
    ? { transform: 'translate3d(' + transform.x + 'px, ' + transform.y + 'px, 0)' }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md border bg-card p-2.5 shadow-sm transition-shadow',
        isDragging && !overlay && 'opacity-40',
        overlay && 'rotate-1 shadow-lg',
      )}
    >
      <div className="flex items-start gap-1.5">
        {canMove ? (
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none rounded text-muted-foreground active:cursor-grabbing"
            aria-label={'Move ' + task.title}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <Link href={'/tasks/' + task.number} className="block rounded">
            <p className="font-mono text-2xs text-muted-foreground">#{task.number}</p>
            <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug hover:text-primary">
              {task.title}
            </p>
          </Link>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={task.priority} />
            {task.project ? (
              <span className="truncate rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
                {task.project.code}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <UserChip user={task.currentOwner} />
            <span
              className={cn(
                'shrink-0 whitespace-nowrap text-2xs',
                task.deadlineMeta?.isOverdue
                  ? 'font-medium text-destructive'
                  : 'text-muted-foreground',
              )}
            >
              {formatDeadline(task.deadline, task.deadlineMeta)}
            </span>
          </div>

          {task._count.comments > 0 || task._count.attachments > 0 ? (
            <div className="mt-1.5 flex items-center gap-2.5 text-2xs text-muted-foreground">
              {task._count.comments > 0 ? (
                <span className="inline-flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" aria-hidden />
                  {task._count.comments}
                </span>
              ) : null}
              {task._count.attachments > 0 ? (
                <span className="inline-flex items-center gap-0.5">
                  <Paperclip className="h-3 w-3" aria-hidden />
                  {task._count.attachments}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
