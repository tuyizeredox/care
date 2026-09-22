'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveRestore,
  KeyRound,
  MoreHorizontal,
  Pencil,
  PauseCircle,
  PlayCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { UserChip } from '@/components/user-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatRelative, humanize } from '@/lib/format';
import type { UserSummary } from '@/lib/types';
import { DeleteUserDialog } from './delete-user-dialog';
import { USER_STATUSES, UserFormDialog } from './user-form-dialog';
import { UserPermissionsDialog } from './user-permissions-dialog';

export interface AdminUser extends UserSummary {
  status: string;
  phone: string | null;
  role: { id: string; key: string; name: string };
  manager: UserSummary | null;
  lastLoginAt: string | null;
  _count?: { reports: number };
}

const ALL = '__all__';
const DELETED = '__deleted__';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  INVITED: 'secondary',
  SUSPENDED: 'warning',
  DEACTIVATED: 'destructive',
};

type PendingAction = { kind: 'suspend' | 'reset-password'; user: AdminUser };

const errorDescription = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Please try again.';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: me, can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const showingDeleted = status === DELETED;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', page, search, status],
    queryFn: () =>
      api.list<AdminUser>('users', {
        query: {
          page,
          pageSize: 25,
          search,
          status: status === ALL || showingDeleted ? undefined : status,
          deleted: showingDeleted || undefined,
        },
      }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const resetPassword = useMutation({
    mutationFn: (userId: string) =>
      api.post<{ temporaryPassword?: string }>('users/' + userId + '/reset-password'),
    onSuccess: (result) => {
      toast.success('Password reset', {
        description: result?.temporaryPassword
          ? 'Temporary password: ' + result.temporaryPassword
          : 'The user must set a new password at next sign-in.',
        duration: 30000,
      });
      setPending(null);
    },
    onError: (error) => {
      toast.error('Could not reset the password', { description: errorDescription(error) });
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: string }) =>
      api.patch('users/' + userId, { status: next }),
    onSuccess: (_result, { next }) => {
      toast.success(next === 'ACTIVE' ? 'Account reactivated' : 'Account suspended');
      setPending(null);
      refresh();
    },
    onError: (error) => {
      toast.error('Could not change the account status', {
        description: errorDescription(error),
      });
    },
  });

  const restore = useMutation({
    mutationFn: (userId: string) => api.post('users/' + userId + '/restore'),
    onSuccess: () => {
      toast.success('Account restored', {
        description: 'It is active again. Reset the password if the person needs a new one.',
      });
      refresh();
    },
    onError: (error) => {
      toast.error('Could not restore the account', { description: errorDescription(error) });
    },
  });

  const users = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search users…"
            className="w-64"
            aria-label="Search users"
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {USER_STATUSES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
              <SelectItem value={DELETED}>Deleted accounts</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          New user
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title={showingDeleted ? 'No deleted accounts' : 'No users found'}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((person) => {
                  const isSelf = person.id === me?.id;
                  return (
                    <TableRow key={person.id}>
                      <TableCell>
                        <UserChip
                          user={person}
                          href={showingDeleted ? null : '/people/' + person.id}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {person.position?.title ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {person.department?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{person.role?.name}</Badge>
                      </TableCell>
                      <TableCell>
                        <UserChip user={person.manager} emptyLabel="—" />
                      </TableCell>
                      <TableCell>
                        {showingDeleted ? (
                          <Badge variant="destructive">Deleted</Badge>
                        ) : (
                          <Badge variant={STATUS_BADGE[person.status] ?? 'secondary'}>
                            {humanize(person.status)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {person.lastLoginAt ? formatRelative(person.lastLoginAt) : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        {showingDeleted ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => restore.mutate(person.id)}
                            loading={restore.isPending && restore.variables === person.id}
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
                            Restore
                          </Button>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={'Actions for ' + person.firstName + ' ' + person.lastName}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditing(person);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil aria-hidden />
                                Edit details
                              </DropdownMenuItem>
                              {can('manage_roles') && !isSelf ? (
                                <DropdownMenuItem onSelect={() => setPermissionsFor(person)}>
                                  <ShieldCheck aria-hidden />
                                  Permissions
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onSelect={() => setPending({ kind: 'reset-password', user: person })}
                              >
                                <KeyRound aria-hidden />
                                Reset password
                              </DropdownMenuItem>
                              {isSelf ? null : (
                                <>
                                  {person.status === 'ACTIVE' ? (
                                    <DropdownMenuItem
                                      onSelect={() => setPending({ kind: 'suspend', user: person })}
                                    >
                                      <PauseCircle aria-hidden />
                                      Suspend
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        setStatusMutation.mutate({
                                          userId: person.id,
                                          next: 'ACTIVE',
                                        })
                                      }
                                    >
                                      <PlayCircle aria-hidden />
                                      Reactivate
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setDeleting(person)}
                                  >
                                    <Trash2 aria-hidden />
                                    Delete user
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {data?.meta ? (
            <Pagination meta={data.meta} onPageChange={setPage} itemLabel="users" />
          ) : null}
        </>
      )}

      <UserFormDialog
        key={editing?.id ?? 'new'}
        user={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        isSelf={editing !== null && editing.id === me?.id}
      />

      <UserPermissionsDialog
        user={permissionsFor}
        onOpenChange={(open) => !open && setPermissionsFor(null)}
      />

      <DeleteUserDialog user={deleting} onOpenChange={(open) => !open && setDeleting(null)} />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === 'suspend'
            ? 'Suspend ' + pending.user.firstName + ' ' + pending.user.lastName + '?'
            : 'Reset the password for ' +
              (pending ? pending.user.firstName + ' ' + pending.user.lastName : '') +
              '?'
        }
        description={
          pending?.kind === 'suspend'
            ? 'They are signed out at once and cannot sign in until reactivated. Their tasks stay with them.'
            : 'Their current password stops working and they are signed out. You will see a temporary password to pass on.'
        }
        confirmLabel={pending?.kind === 'suspend' ? 'Suspend account' : 'Reset password'}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'suspend') {
            setStatusMutation.mutate({ userId: pending.user.id, next: 'SUSPENDED' });
          } else {
            resetPassword.mutate(pending.user.id);
          }
        }}
        loading={setStatusMutation.isPending || resetPassword.isPending}
      />
    </div>
  );
}
