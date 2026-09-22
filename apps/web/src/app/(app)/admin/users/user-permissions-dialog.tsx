'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { cn } from '@/lib/utils';
import type { AdminUser } from './page';

type Override = 'default' | 'grant' | 'revoke';

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface UserPermissions {
  role: { id: string; name: string };
  permissions: Array<{ granted: boolean; permission: { key: string } }>;
}

/**
 * Per-user grants and revocations on top of the role:
 * effective = role permissions + grants − revocations.
 */
export function UserPermissionsDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const open = user !== null;
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin', 'users', user?.id, 'permissions'],
    queryFn: () => api.get<UserPermissions>('users/' + user?.id),
    enabled: open,
  });
  const { data: catalogue } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<Permission[]>('permissions'),
    enabled: open,
  });
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () =>
      api.get<Array<{ id: string; permissions: Array<{ permission: { key: string } }> }>>('roles'),
    enabled: open,
  });

  useEffect(() => {
    if (!detail) return;
    setOverrides(
      Object.fromEntries(
        detail.permissions.map((entry) => [
          entry.permission.key,
          entry.granted ? 'grant' : 'revoke',
        ]),
      ),
    );
  }, [detail]);

  const roleKeys = new Set(
    (roles ?? [])
      .find((role) => role.id === detail?.role.id)
      ?.permissions.map((entry) => entry.permission.key) ?? [],
  );

  const save = useMutation({
    mutationFn: () =>
      api.patch('users/' + user?.id + '/permissions', {
        overrides: Object.entries(overrides)
          .filter(([, value]) => value !== 'default')
          .map(([permissionKey, value]) => ({ permissionKey, granted: value === 'grant' })),
      }),
    onSuccess: () => {
      toast.success('Permissions updated', {
        description: 'They apply from the person’s next request.',
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not update permissions', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const grouped = (catalogue ?? []).reduce<Record<string, Permission[]>>(
    (accumulator, permission) => {
      accumulator[permission.category] = [
        ...(accumulator[permission.category] ?? []),
        permission,
      ];
      return accumulator;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Permissions for {user?.firstName} {user?.lastName}
          </DialogTitle>
          <DialogDescription>
            Their role ({detail?.role.name ?? user?.role.name}) sets the defaults. Grant or revoke
            individual permissions here without changing the role for everyone else.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !catalogue ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([category, entries]) => (
              <fieldset key={category}>
                <legend className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </legend>
                <ul className="divide-y rounded-md border">
                  {entries.map((permission) => {
                    const choice = overrides[permission.key] ?? 'default';
                    const fromRole = roleKeys.has(permission.key);
                    const effective =
                      choice === 'grant' || (choice === 'default' && fromRole);
                    return (
                      <li key={permission.id} className="flex items-center gap-3 px-3 py-2">
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                            effective
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground',
                          )}
                          aria-label={effective ? 'Allowed' : 'Not allowed'}
                        >
                          {effective ? (
                            <Check className="h-3 w-3" aria-hidden />
                          ) : (
                            <Minus className="h-3 w-3" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm">
                            {permission.name}
                            {choice !== 'default' ? (
                              <Badge variant={choice === 'grant' ? 'success' : 'destructive'}>
                                {choice === 'grant' ? 'Granted' : 'Revoked'}
                              </Badge>
                            ) : null}
                          </p>
                          {permission.description ? (
                            <p className="text-2xs text-muted-foreground">
                              {permission.description}
                            </p>
                          ) : null}
                        </div>
                        <Select
                          value={choice}
                          onValueChange={(value) =>
                            setOverrides((current) => ({
                              ...current,
                              [permission.key]: value as Override,
                            }))
                          }
                        >
                          <SelectTrigger
                            className="w-40 shrink-0"
                            aria-label={'Override for ' + permission.name}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">
                              Role default ({fromRole ? 'on' : 'off'})
                            </SelectItem>
                            <SelectItem value="grant">Always grant</SelectItem>
                            <SelectItem value="revoke">Always revoke</SelectItem>
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!detail}>
            Save permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
