'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox, Paperclip, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { WAITING_REASON_LABELS } from '@/lib/constants';
import { formatDeadline, formatRelative } from '@/lib/format';
import type { TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: 'title', label: 'Task', sortable: true, className: 'min-w-[16rem]' },
  { key: 'project', label: 'Project' },
  { key: 'owner', label: 'Owner' },
  { key: 'department', label: 'Department' },
  { key: 'priority', label: 'Priority', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'deadline', label: 'Deadline', sortable: true },
  { key: 'waitingFor', label: 'Waiting for' },
  { key: 'updatedAt', label: 'Updated', sortable: true },
];

interface TaskTableProps {
  tasks: TaskSummary[];
  loading?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

/** The professional list view: dense, sortable, and scannable. */
export function TaskTable({
  tasks,
  loading,
  sortBy,
  sortOrder = 'desc',
  onSort,
  emptyTitle = 'No tasks found.',
  emptyDescription = 'Try relaxing your filters, or create a new task.',
}: TaskTableProps) {
  if (loading) {
    return (
      <div className="space-y-2 rounded border p-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />;
  }

  const SortIcon = sortOrder === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="rounded border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {COLUMNS.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.key === 'title' ? 'title' : column.key)}
                    className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground"
                    aria-label={'Sort by ' + column.label}
                  >
                    {column.label}
                    {sortBy === column.key ? (
                      <SortIcon className="h-3 w-3" aria-hidden />
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />
                    )}
                  </button>
                ) : (
                  column.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id} className="group">
              <TableCell className="max-w-[22rem]">
                <Link href={'/tasks/' + task.number} className="block rounded">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-2xs text-muted-foreground">#{task.number}</span>
                    <span className="truncate text-sm font-medium group-hover:text-primary">
                      {task.title}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2.5 text-2xs text-muted-foreground">
                    {task.subtaskCount > 0 ? (
                      <span>
                        {task.completedSubtaskCount}/{task.subtaskCount} subtasks
                      </span>
                    ) : null}
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
                  </span>
                  {task.subtaskCount > 0 ? (
                    <Progress
                      value={(task.completedSubtaskCount / task.subtaskCount) * 100}
                      className="mt-1.5 h-1 w-32"
                    />
                  ) : null}
                </Link>
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {task.project?.name ?? '—'}
              </TableCell>

              <TableCell>
                <UserChip user={task.currentOwner} showPosition />
              </TableCell>

              <TableCell className="whitespace-nowrap">
                {task.department ? (
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: task.department.color }}
                      aria-hidden
                    />
                    {task.department.name}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>

              <TableCell>
                <PriorityBadge priority={task.priority} />
              </TableCell>

              <TableCell>
                <StatusBadge status={task.status} />
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <span
                  className={cn(
                    'text-sm',
                    task.deadlineMeta?.isOverdue
                      ? 'font-medium text-destructive'
                      : task.deadlineMeta?.isDueToday
                        ? 'font-medium text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground',
                  )}
                >
                  {formatDeadline(task.deadline, task.deadlineMeta)}
                </span>
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm">
                {task.waitingReason && task.waitingReason !== 'NONE' ? (
                  <span className="text-muted-foreground">
                    {WAITING_REASON_LABELS[task.waitingReason] ?? task.waitingReason}
                    {task.waitingFor ? (
                      <span className="block text-2xs">
                        {task.waitingFor.firstName} {task.waitingFor.lastName}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatRelative(task.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
