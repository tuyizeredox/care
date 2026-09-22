'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { UserSummary } from '@/lib/types';
import type { DepartmentRow } from './page';

const NONE = '__none__';

/** Create or edit a department. Mount with a `key` per department. */
export function DepartmentDialog({
  department,
  open,
  onOpenChange,
}: {
  department: DepartmentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(department?.name ?? '');
  const [code, setCode] = useState(department?.code ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [color, setColor] = useState(department?.color ?? '#3B82F6');
  const [headUserId, setHeadUserId] = useState(department?.head?.id ?? NONE);
  const [sortOrder, setSortOrder] = useState(String(department?.sortOrder ?? 0));

  const { data: directory } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => api.get<UserSummary[]>('users/directory'),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        color,
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
        description: description.trim() || (department ? null : undefined),
        headUserId: headUserId === NONE ? (department ? null : undefined) : headUserId,
      };
      return department
        ? api.patch('departments/' + department.id, payload)
        : api.post('departments', payload);
    },
    onSuccess: () => {
      toast.success(department ? 'Department updated' : 'Department created');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not save the department', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const valid = name.trim().length > 0 && code.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? 'Edit department' : 'New department'}</DialogTitle>
          <DialogDescription>
            The department head receives work routed to &ldquo;head of department&rdquo; workflow
            stages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FormField id="department-name" label="Name" required>
                <Input
                  id="department-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                />
              </FormField>
            </div>
            <FormField id="department-code" label="Code" required>
              <Input
                id="department-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="PROG"
                maxLength={20}
              />
            </FormField>
          </div>

          <FormField id="department-description" label="Description">
            <Textarea
              id="department-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </FormField>

          <FormField id="department-head" label="Head of department">
            <Select value={headUserId} onValueChange={setHeadUserId}>
              <SelectTrigger id="department-head">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No head</SelectItem>
                {department?.head &&
                !(directory ?? []).some((person) => person.id === department.head?.id) ? (
                  <SelectItem value={department.head.id}>
                    {department.head.firstName} {department.head.lastName}
                  </SelectItem>
                ) : null}
                {(directory ?? []).map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.firstName} {person.lastName}
                    {person.position ? ' · ' + person.position.title : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="department-color" label="Colour">
              <div className="flex items-center gap-2">
                <Input
                  id="department-color"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-8 w-12 cursor-pointer p-1"
                />
                <span className="font-mono text-xs text-muted-foreground">{color}</span>
              </div>
            </FormField>
            <FormField id="department-order" label="Sort order" hint="Lower numbers list first.">
              <Input
                id="department-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </FormField>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid} loading={save.isPending}>
            {department ? 'Save department' : 'Create department'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
