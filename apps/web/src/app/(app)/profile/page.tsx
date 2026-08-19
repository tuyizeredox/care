'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { UserChip } from '@/components/user-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/avatar';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDuration, formatPercent, formatRelative } from '@/lib/format';
import { fullName } from '@/lib/utils';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Your first name is required.').max(60),
  lastName: z.string().min(1, 'Your last name is required.').max(60),
  phone: z.string().max(30).optional(),
  bio: z.string().max(1000).optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include an uppercase letter, a lowercase letter and a number.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

interface Stats {
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
  averageCompletionSeconds: number | null;
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['user', user?.id, 'stats'],
    queryFn: () => api.get<Stats>('users/' + user?.id + '/stats'),
    enabled: Boolean(user?.id),
  });

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      phone: user?.phone ?? '',
      bio: user?.bio ?? '',
    },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const saveProfile = useMutation({
    mutationFn: (values: ProfileValues) => api.patch('users/me/profile', values),
    onSuccess: async () => {
      toast.success('Profile updated');
      await refreshUser();
    },
    onError: (error) => {
      toast.error('Could not save your profile', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const changePassword = useMutation({
    mutationFn: (values: PasswordValues) =>
      api.post('auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success('Password changed', {
        description: 'Other sessions have been signed out.',
      });
      passwordForm.reset();
    },
    onError: (error) => {
      toast.error('Could not change your password', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <PageHeader title="My profile" description="Your details, role and performance." />

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <UserAvatar user={user} className="h-16 w-16 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{fullName(user)}</h2>
              <Badge variant="secondary">{user.role?.name}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[user.position?.title, user.department?.name].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user.email}
              {user.lastLoginAt ? ' · Last signed in ' + formatRelative(user.lastLoginAt) : ''}
            </p>
          </div>
          {user.manager ? (
            <div className="shrink-0 rounded-md border px-3 py-2">
              <p className="eyebrow">Reports to</p>
              <div className="mt-1">
                <UserChip user={user.manager} showPosition href={'/people/' + user.manager.id} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active tasks" value={stats?.activeTasks ?? 0} />
        <StatCard label="Completed" value={stats?.completedTasks ?? 0} tone="success" />
        <StatCard
          label="Overdue"
          value={stats?.overdueTasks ?? 0}
          tone={(stats?.overdueTasks ?? 0) > 0 ? 'danger' : 'default'}
        />
        <StatCard label="Completion rate" value={formatPercent(stats?.completionRate)} />
        <StatCard
          label="Average completion"
          value={formatDuration(stats?.averageCompletionSeconds)}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Personal details</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form
              onSubmit={profileForm.handleSubmit((values) => saveProfile.mutate(values))}
              className="space-y-4"
              noValidate
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="firstName"
                  label="First name"
                  required
                  error={profileForm.formState.errors.firstName?.message}
                >
                  <Input id="firstName" {...profileForm.register('firstName')} />
                </Field>
                <Field
                  id="lastName"
                  label="Last name"
                  required
                  error={profileForm.formState.errors.lastName?.message}
                >
                  <Input id="lastName" {...profileForm.register('lastName')} />
                </Field>
              </div>

              <Field id="phone" label="Phone">
                <Input id="phone" type="tel" {...profileForm.register('phone')} />
              </Field>

              <Field id="bio" label="About">
                <Textarea id="bio" rows={3} {...profileForm.register('bio')} />
              </Field>

              <div className="flex justify-end">
                <Button type="submit" loading={saveProfile.isPending}>
                  <Save className="h-4 w-4" aria-hidden />
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form
              onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))}
              className="space-y-4"
              noValidate
            >
              <Field
                id="currentPassword"
                label="Current password"
                required
                error={passwordForm.formState.errors.currentPassword?.message}
              >
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...passwordForm.register('currentPassword')}
                />
              </Field>

              <Field
                id="newPassword"
                label="New password"
                required
                error={passwordForm.formState.errors.newPassword?.message}
              >
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register('newPassword')}
                />
              </Field>

              <Field
                id="confirmPassword"
                label="Confirm new password"
                required
                error={passwordForm.formState.errors.confirmPassword?.message}
              >
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register('confirmPassword')}
                />
              </Field>

              <p className="text-xs text-muted-foreground">
                Changing your password signs out every other device.
              </p>

              <div className="flex justify-end">
                <Button type="submit" variant="outline" loading={changePassword.isPending}>
                  <KeyRound className="h-4 w-4" aria-hidden />
                  Change password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
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
