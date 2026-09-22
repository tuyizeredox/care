'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
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
import type { UserSummary } from '@/lib/types';
import type { AdminUser } from './page';

/** Mirrors OPEN_STATUSES in the API: the ones that block deleting an owner. */
const OPEN_STATUSES = [
  'ASSIGNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'BLOCKED',
];

interface OpenTask {
  id: string;
  number: number;
  title: string;
}

interface DeleteResult {
  reportsMoved: number;
  departmentsWithoutHead: number;
  projectsWithoutManager: number;
}

const plural = (count: number, noun: string) => count + ' ' + noun + (count === 1 ? '' : 's');

/**
 * Deleting an account keeps everything the person did on record. Open tasks
 * must have a new owner first, so the dialog reassigns them through the normal
 * assign endpoint (each move lands in the task's journey) before deleting.
 */
export function DeleteUserDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const open = user !== null;
  const [reassignTo, setReassignTo] = useState('');

  const openTaskQuery = (ownerId: string) =>
    api.list<OpenTask>('tasks', {
      query: { ownerId, status: OPEN_STATUSES, pageSize: 200 },
    });

  const { data: openTasks, isLoading } = useQuery({
    queryKey: ['admin', 'users', user?.id, 'open-tasks'],
    queryFn: () => openTaskQuery(user?.id ?? ''),
    enabled: open,
  });
  const { data: directory } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => api.get<UserSummary[]>('users/directory'),
    enabled: open && (openTasks?.meta.total ?? 0) > 0,
  });

  const taskCount = openTasks?.meta.total ?? 0;

  const remove = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('No user selected');
      if (taskCount > 0) {
        const note =
          'Reassigned by an administrator: ' +
          user.firstName +
          ' ' +
          user.lastName +
          '’s account is being deleted.';
        // Each successful assign removes the task from this query, so this drains.
        for (;;) {
          const page = await openTaskQuery(user.id);
          if (page.data.length === 0) break;
          for (const task of page.data) {
            await api.post('tasks/' + task.id + '/assign', { assigneeId: reassignTo, note });
          }
        }
      }
      return api.delete<DeleteResult>('users/' + user.id);
    },
    onSuccess: (result) => {
      const effects = [
        result.reportsMoved > 0
          ? plural(result.reportsMoved, 'direct report') + ' moved to their manager'
          : null,
        result.departmentsWithoutHead > 0
          ? plural(result.departmentsWithoutHead, 'department') + ' now need a new head'
          : null,
        result.projectsWithoutManager > 0
          ? plural(result.projectsWithoutManager, 'project') + ' now need a new manager'
          : null,
      ].filter(Boolean);
      toast.success('User deleted', {
        description: effects.length > 0 ? effects.join('; ') + '.' : undefined,
        duration: effects.length > 0 ? 10000 : undefined,
      });
      setReassignTo('');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not delete the user', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const reports = user?._count?.reports ?? 0;
  const manager = user?.manager
    ? user.manager.firstName + ' ' + user.manager.lastName
    : 'no manager';

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReassignTo('');
        onOpenChange(next);
      }}
      title={'Delete ' + (user ? user.firstName + ' ' + user.lastName : 'user') + '?'}
      description="They are signed out and can no longer sign in. Their task history, comments and audit entries are kept, and the account can be restored later."
      confirmLabel={taskCount > 0 ? 'Reassign tasks and delete' : 'Delete user'}
      onConfirm={() => remove.mutate()}
      loading={remove.isPending}
      disabled={isLoading || (taskCount > 0 && !reassignTo)}
    >
      <div className="space-y-3 text-sm">
        {reports > 0 ? (
          <p className="text-muted-foreground">
            Their {plural(reports, 'direct report')} will report to {manager} instead.
          </p>
        ) : null}

        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : taskCount > 0 ? (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="font-medium">
              {user?.firstName} currently holds {plural(taskCount, 'open task')}.
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {(openTasks?.data ?? []).slice(0, 5).map((task) => (
                <li key={task.id} className="truncate">
                  #{task.number} {task.title}
                </li>
              ))}
              {taskCount > 5 ? <li>and {taskCount - 5} more</li> : null}
            </ul>
            <FormField id="reassign-to" label="Hand them to" required>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger id="reassign-to" className="bg-background">
                  <SelectValue placeholder="Choose a colleague" />
                </SelectTrigger>
                <SelectContent>
                  {(directory ?? [])
                    .filter((person) => person.id !== user?.id)
                    .map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.firstName} {person.lastName}
                        {person.position ? ' · ' + person.position.title : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
