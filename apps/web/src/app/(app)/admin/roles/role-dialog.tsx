'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import type { Role } from './page';

const NONE = '__none__';

const toKey = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

/** Create a role (optionally copying another role's permissions) or edit its details. */
export function RoleDialog({
  role,
  roles,
  open,
  onOpenChange,
  onCreated,
}: {
  role: Role | null;
  roles: Role[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (roleId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(role?.name ?? '');
  const [key, setKey] = useState(role?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState(role?.description ?? '');
  const [level, setLevel] = useState(String(role?.level ?? 10));
  const [copyFrom, setCopyFrom] = useState(NONE);

  const save = useMutation({
    mutationFn: () => {
      const details = {
        name: name.trim(),
        description: description.trim(),
        level: Number.parseInt(level, 10) || 0,
      };
      if (role) return api.patch<{ id: string }>('roles/' + role.id, details);

      const source = roles.find((candidate) => candidate.id === copyFrom);
      return api.post<{ id: string }>('roles', {
        ...details,
        key,
        description: details.description || undefined,
        permissionKeys: source?.permissions.map((entry) => entry.permission.key) ?? [],
      });
    },
    onSuccess: (result) => {
      toast.success(role ? 'Role updated' : 'Role created');
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      if (!role && result?.id) onCreated(result.id);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not save the role', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const valid = name.trim().length > 0 && (role !== null || key.length > 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role ? 'Edit role' : 'New role'}</DialogTitle>
          <DialogDescription>
            {role
              ? 'Rename the role or change its seniority. Permissions are edited on the main page.'
              : 'Start empty or copy the permissions of an existing role, then adjust them.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <FormField id="role-name" label="Name" required>
            <Input
              id="role-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!role && !keyTouched) setKey(toKey(event.target.value));
              }}
              maxLength={80}
            />
          </FormField>

          <FormField
            id="role-key"
            label="Key"
            required={!role}
            hint={role ? 'The key is fixed once a role exists.' : 'Used by the system. Letters, digits and underscores.'}
          >
            <Input
              id="role-key"
              value={key}
              onChange={(event) => {
                setKeyTouched(true);
                setKey(toKey(event.target.value));
              }}
              disabled={role !== null}
              className="font-mono"
              placeholder="FIELD_COORDINATOR"
            />
          </FormField>

          <FormField id="role-description" label="Description">
            <Textarea
              id="role-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="role-level" label="Seniority level" hint="Higher is more senior.">
              <Input
                id="role-level"
                type="number"
                min={0}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              />
            </FormField>

            {role ? null : (
              <FormField id="role-copy" label="Copy permissions from">
                <Select value={copyFrom} onValueChange={setCopyFrom}>
                  <SelectTrigger id="role-copy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Start with none</SelectItem>
                    {roles.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid} loading={save.isPending}>
            {role ? 'Save role' : 'Create role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
