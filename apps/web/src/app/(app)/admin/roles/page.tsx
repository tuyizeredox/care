'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  level: number;
  isSystem: boolean;
  permissions: Array<{ permission: Permission }>;
  _count?: { users: number };
}

/** Role and permission editor. Permissions are grouped by their category. */
export default function AdminRolesPage() {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles', 'detail'],
    queryFn: () => api.get<Role[]>('roles'),
  });

  const { data: permissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<Permission[]>('permissions'),
  });

  const selectedRole = (roles ?? []).find((role) => role.id === selectedRoleId) ?? roles?.[0] ?? null;

  const updateRole = useMutation({
    mutationFn: ({ roleId, permissionKeys }: { roleId: string; permissionKeys: string[] }) =>
      api.patch('roles/' + roleId, { permissions: permissionKeys }),
    onSuccess: () => {
      toast.success('Role permissions updated');
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error) => {
      toast.error('Could not update the role', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const togglePermission = (key: string) => {
    if (!selectedRole) return;
    const current = selectedRole.permissions.map((entry) => entry.permission.key);
    const next = current.includes(key)
      ? current.filter((entry) => entry !== key)
      : [...current, key];
    updateRole.mutate({ roleId: selectedRole.id, permissionKeys: next });
  };

  const grouped = (permissions ?? []).reduce<Record<string, Permission[]>>(
    (accumulator, permission) => {
      accumulator[permission.category] = [
        ...(accumulator[permission.category] ?? []),
        permission,
      ];
      return accumulator;
    },
    {},
  );

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if ((roles ?? []).length === 0) {
    return <EmptyState icon={ShieldCheck} title="No roles configured" />;
  }

  const activeKeys = new Set((selectedRole?.permissions ?? []).map((entry) => entry.permission.key));

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-0">
          {(roles ?? []).map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedRoleId(role.id)}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left transition-colors',
                selectedRole?.id === role.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{role.name}</span>
                <span className="shrink-0 text-2xs text-muted-foreground">L{role.level}</span>
              </span>
              <span className="block truncate text-2xs text-muted-foreground">
                {role.permissions.length} permission(s)
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {selectedRole?.name}
            {selectedRole?.isSystem ? <Badge variant="secondary">System role</Badge> : null}
          </CardTitle>
          {selectedRole?.description ? (
            <p className="text-xs text-muted-foreground">{selectedRole.description}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          {Object.entries(grouped).map(([category, entries]) => (
            <fieldset key={category}>
              <legend className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {entries.map((permission) => (
                  <div key={permission.id} className="flex items-start gap-2">
                    <Checkbox
                      id={'permission-' + permission.id}
                      checked={activeKeys.has(permission.key)}
                      onCheckedChange={() => togglePermission(permission.key)}
                      disabled={updateRole.isPending}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={'permission-' + permission.id}
                      className="cursor-pointer font-normal"
                    >
                      <span className="block text-sm">{permission.name}</span>
                      {permission.description ? (
                        <span className="block text-2xs text-muted-foreground">
                          {permission.description}
                        </span>
                      ) : null}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
