'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, type Control } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import type { UserSummary } from '@/lib/types';
import type { AdminUser } from './page';

const NONE = '__none__';

export const USER_STATUSES: Array<{ value: string; label: string; description: string }> = [
  { value: 'ACTIVE', label: 'Active', description: 'Can sign in and receive work.' },
  { value: 'SUSPENDED', label: 'Suspended', description: 'Signed out and blocked until reactivated.' },
  { value: 'INVITED', label: 'Invited', description: 'Account prepared, not yet in use.' },
  { value: 'DEACTIVATED', label: 'Deactivated', description: 'Kept on record but cannot sign in.' },
];

const buildSchema = (isCreate: boolean) =>
  z
    .object({
      firstName: z.string().trim().min(1, 'First name is required.'),
      lastName: z.string().trim().min(1, 'Last name is required.'),
      email: z.string().trim().email('Enter a valid email address.'),
      password: z.string().optional(),
      jobTitle: z.string().optional(),
      phone: z.string().optional(),
      roleId: z.string().min(1, 'Choose a role.'),
      departmentId: z.string().optional(),
      positionId: z.string().optional(),
      managerId: z.string().optional(),
      status: z.string().optional(),
    })
    .superRefine((values, ctx) => {
      if (!isCreate) return;
      const password = values.password ?? '';
      if (password.length < 8) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Use at least 8 characters.' });
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: 'Include upper case, lower case and a number.',
        });
      }
    });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

/**
 * Create a user, or edit every administrative field of an existing one.
 * Mount with a `key` per user so the form resets between people.
 */
export function UserFormDialog({
  user,
  open,
  onOpenChange,
  isSelf,
}: {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSelf: boolean;
}) {
  const queryClient = useQueryClient();
  const isCreate = user === null;

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Array<{ id: string; name: string; key: string }>>('roles'),
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
  const { data: directory } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => api.get<UserSummary[]>('users/directory'),
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(buildSchema(isCreate)),
    defaultValues: user
      ? {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          jobTitle: user.jobTitle ?? '',
          phone: user.phone ?? '',
          roleId: user.role.id,
          departmentId: user.department?.id ?? NONE,
          positionId: user.position?.id ?? NONE,
          managerId: user.manager?.id ?? NONE,
          status: user.status,
        }
      : { departmentId: NONE, positionId: NONE, managerId: NONE },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      // Creating leaves empty references out; editing sends '' so the API clears them.
      const reference = (value?: string) =>
        !value || value === NONE ? (isCreate ? undefined : '') : value;
      const text = (value?: string) => (isCreate ? value?.trim() || undefined : value?.trim() ?? '');

      const payload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        jobTitle: text(values.jobTitle),
        phone: text(values.phone),
        roleId: values.roleId,
        departmentId: reference(values.departmentId),
        positionId: reference(values.positionId),
        managerId: reference(values.managerId),
      };
      return isCreate
        ? api.post('users', { ...payload, password: values.password })
        : api.patch('users/' + user.id, { ...payload, status: values.status });
    },
    onSuccess: () => {
      toast.success(isCreate ? 'User created' : 'User updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(isCreate ? 'Could not create the user' : 'Could not update the user', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const errors = form.formState.errors;
  const managerOptions = (directory ?? [])
    .filter((person) => person.id !== user?.id)
    .map((person) => ({ id: person.id, name: person.firstName + ' ' + person.lastName }));
  // A current manager who is suspended is missing from the directory; keep them selectable.
  if (user?.manager && !managerOptions.some((option) => option.id === user.manager?.id)) {
    managerOptions.unshift({
      id: user.manager.id,
      name: user.manager.firstName + ' ' + user.manager.lastName,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? 'Create a user' : 'Edit ' + user.firstName + ' ' + user.lastName}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'The account is active immediately. Reporting lines drive team visibility.'
              : 'Changes apply at once. Suspending an account signs the person out everywhere.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="user-form"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="space-y-3"
          noValidate
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="firstName" label="First name" required error={errors.firstName?.message}>
              <Input id="firstName" {...form.register('firstName')} />
            </FormField>
            <FormField id="lastName" label="Last name" required error={errors.lastName?.message}>
              <Input id="lastName" {...form.register('lastName')} />
            </FormField>
          </div>

          <FormField id="email" label="Email" required error={errors.email?.message}>
            <Input id="email" type="email" {...form.register('email')} />
          </FormField>

          {isCreate ? (
            <FormField
              id="password"
              label="Temporary password"
              required
              error={errors.password?.message}
            >
              <Input id="password" type="text" autoComplete="off" {...form.register('password')} />
            </FormField>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="jobTitle" label="Job title">
              <Input id="jobTitle" {...form.register('jobTitle')} />
            </FormField>
            <FormField id="phone" label="Phone">
              <Input id="phone" type="tel" {...form.register('phone')} />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="roleId"
              label="Role"
              required
              error={errors.roleId?.message}
              options={(roles ?? []).map((role) => ({ id: role.id, name: role.name }))}
              allowNone={false}
              disabled={isSelf}
              hint={isSelf ? 'You cannot change your own role.' : undefined}
            />
            {isCreate ? null : (
              <SelectField
                control={form.control}
                name="status"
                label="Account status"
                options={USER_STATUSES.map((status) => ({ id: status.value, name: status.label }))}
                allowNone={false}
                disabled={isSelf}
                hint={
                  isSelf
                    ? 'You cannot suspend your own account.'
                    : USER_STATUSES.find((status) => status.value === form.watch('status'))
                        ?.description
                }
              />
            )}
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
              options={managerOptions}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={save.isPending}>
            {isCreate ? 'Create user' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({
  control,
  name,
  label,
  options,
  required,
  error,
  hint,
  disabled,
  allowNone = true,
}: {
  control: Control<FormValues>;
  name: 'roleId' | 'status' | 'departmentId' | 'positionId' | 'managerId';
  label: string;
  options: Array<{ id: string; name: string }>;
  required?: boolean;
  error?: string;
  hint?: string;
  disabled?: boolean;
  allowNone?: boolean;
}) {
  return (
    <FormField id={name} label={label} required={required} error={error} hint={hint}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger id={name}>
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
    </FormField>
  );
}
