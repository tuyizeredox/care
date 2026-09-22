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
import type { PositionRow } from './page';

const NONE = '__none__';

/** Create or edit a position and its structural reporting line. Mount with a `key`. */
export function PositionDialog({
  position,
  positions,
  open,
  onOpenChange,
}: {
  position: PositionRow | null;
  positions: PositionRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(position?.title ?? '');
  const [code, setCode] = useState(position?.code ?? '');
  const [description, setDescription] = useState(position?.description ?? '');
  const [departmentId, setDepartmentId] = useState(position?.department?.id ?? NONE);
  const [reportsToId, setReportsToId] = useState(position?.reportsTo?.id ?? NONE);
  const [level, setLevel] = useState(String(position?.level ?? 10));
  const [headcount, setHeadcount] = useState(String(position?.headcount ?? 1));

  const { data: departments } = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('departments'),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => {
      // Editing sends null so the API clears a reference; creating leaves it out.
      const clear = position ? null : undefined;
      const payload = {
        title: title.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || clear,
        departmentId: departmentId === NONE ? clear : departmentId,
        reportsToId: reportsToId === NONE ? clear : reportsToId,
        level: Number.parseInt(level, 10) || 0,
        headcount: Math.max(1, Number.parseInt(headcount, 10) || 1),
      };
      return position
        ? api.patch('positions/' + position.id, payload)
        : api.post('positions', payload);
    },
    onSuccess: () => {
      toast.success(position ? 'Position updated' : 'Position created');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'positions'] });
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not save the position', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const valid = title.trim().length > 0 && code.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{position ? 'Edit position' : 'New position'}</DialogTitle>
          <DialogDescription>
            &ldquo;Reports to&rdquo; builds the structural organigram. Workflow stages can route
            work to whoever holds a position.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FormField id="position-title" label="Title" required>
                <Input
                  id="position-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                />
              </FormField>
            </div>
            <FormField id="position-code" label="Code" required>
              <Input
                id="position-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="SERVE_PM"
                maxLength={40}
              />
            </FormField>
          </div>

          <FormField id="position-description" label="Description">
            <Textarea
              id="position-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="position-department" label="Department">
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="position-department">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department</SelectItem>
                  {(departments ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField id="position-reports-to" label="Reports to">
              <Select value={reportsToId} onValueChange={setReportsToId}>
                <SelectTrigger id="position-reports-to">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nobody (top of the chart)</SelectItem>
                  {positions
                    .filter((candidate) => candidate.id !== position?.id)
                    .map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              id="position-level"
              label="Seniority level"
              hint="100 Country Director · 80 Director · 60 Manager · 40 Specialist"
            >
              <Input
                id="position-level"
                type="number"
                min={0}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              />
            </FormField>

            <FormField id="position-headcount" label="Headcount">
              <Input
                id="position-headcount"
                type="number"
                min={1}
                value={headcount}
                onChange={(event) => setHeadcount(event.target.value)}
              />
            </FormField>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid} loading={save.isPending}>
            {position ? 'Save position' : 'Create position'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
