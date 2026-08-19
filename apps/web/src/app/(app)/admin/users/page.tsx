'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserCog } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Pagination } from '@/components/pagination';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
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
import { humanize } from '@/lib/format';
import type { UserSummary } from '@/lib/types';

const NONE = '__none__';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  email: z.string().email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include upper case, lower case and a number.'),
  roleId: z.string().min(1, 'Choose a role.'),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  managerId: z.string().optional(),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface AdminUser extends UserSummary {
  status: string;
  role: { id: string; key: string; name: string };
  manager: UserSummary | null;
  lastLoginAt: string | null;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', page, search],
    queryFn: () => api.list<AdminUser>('users', { query: { page, pageSize: 25, search } }),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Array<{ id: string; name: string; key: string }>>('roles'),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('departments'),
  });
  const { data: positions } = useQuery({
    queryKey: ['positions', 'options'],
    queryFn: () => api.get<Array<{ id: string; title: string }>>('positions'),
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const createUser = useMutation({
    mutationFn: (values: FormValues) =>
      api.post('users', {
        ...values,
        departmentId: values.departmentId === NONE ? undefined : values.departmentId,
        positionId: values.positionId === NONE ? undefined : values.positionId,
        managerId: values.managerId === NONE ? undefined : values.managerId,
      }),
    onSuccess: () => {
      toast.success('User created');
      setCreateOpen(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast.error('Could not create the user', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const resetPassword = useMutation({
    mutationFn: (userId: string) => api.post<{ temporaryPassword?: string }>('users/' + userId + '/reset-password'),
    onSuccess: (result) => {
      toast.success('Password reset', {
        description: result?.temporaryPassword
          ? 'Temporary password: ' + result.temporaryPassword
          : 'The user must set a new password at next sign-in.',
        duration: 10000,
      });
    },
    onError: (error) => {
      toast.error('Could not reset the password', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const users = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search users…"
          className="max-w-xs"
          aria-label="Search users"
        />
        <Button onClick={() => setCreateOpen(true)}>
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
        <EmptyState icon={UserCog} title="No users found" />
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <UserChip user={person} href={'/people/' + person.id} />
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
                      <Badge variant={person.status === 'ACTIVE' ? 'success' : 'warning'}>
                        {humanize(person.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resetPassword.mutate(person.id)}
                        loading={resetPassword.isPending && resetPassword.variables === person.id}
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden />
                        Reset password
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data?.meta ? (
            <Pagination meta={data.meta} onPageChange={setPage} itemLabel="users" />
          ) : null}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a user</DialogTitle>
            <DialogDescription>
              The account is active immediately. Reporting lines drive team visibility.
            </DialogDescription>
          </DialogHeader>

          <form
            id="create-user-form"
            onSubmit={form.handleSubmit((values) => createUser.mutate(values))}
            className="space-y-3"
            noValidate
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="firstName" label="First name" required error={form.formState.errors.firstName?.message}>
                <Input id="firstName" {...form.register('firstName')} />
              </FormField>
              <FormField id="lastName" label="Last name" required error={form.formState.errors.lastName?.message}>
                <Input id="lastName" {...form.register('lastName')} />
              </FormField>
            </div>

            <FormField id="email" label="Email" required error={form.formState.errors.email?.message}>
              <Input id="email" type="email" {...form.register('email')} />
            </FormField>

            <FormField
              id="password"
              label="Temporary password"
              required
              error={form.formState.errors.password?.message}
            >
              <Input id="password" type="text" {...form.register('password')} />
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="roleId"
                label="Role"
                required
                error={form.formState.errors.roleId?.message}
                options={(roles ?? []).map((role) => ({ id: role.id, name: role.name }))}
                allowNone={false}
              />
              <SelectField
                control={form.control}
                name="departmentId"
                label="Department"
                options={(departments ?? []).map((department) => ({
                  id: department.id,
                  name: department.name,
                }))}
              />
              <SelectField
                control={form.control}
                name="positionId"
                label="Position"
                options={(positions ?? []).map((position) => ({
                  id: position.id,
                  name: position.title,
                }))}
              />
              <SelectField
                control={form.control}
                name="managerId"
                label="Reports to"
                options={users.map((person) => ({
                  id: person.id,
                  name: person.firstName + ' ' + person.lastName,
                }))}
              />
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" loading={createUser.isPending}>
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormField({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SelectField({
  control,
  name,
  label,
  options,
  required,
  error,
  allowNone = true,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  name: keyof FormValues;
  label: string;
  options: Array<{ id: string; name: string }>;
  required?: boolean;
  error?: string;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={String(name)} required={required}>
        {label}
      </Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <SelectTrigger id={String(name)}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {allowNone ? <SelectItem value={NONE}>None</SelectItem> : null}
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
