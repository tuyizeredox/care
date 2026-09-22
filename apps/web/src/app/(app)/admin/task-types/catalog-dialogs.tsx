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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import type { TagRow, TaskTypeRow } from './page';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;

const errorDescription = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Please try again.';

/** Create or edit a task type. Mount with a `key` per task type. */
export function TaskTypeDialog({
  taskType,
  open,
  onOpenChange,
}: {
  taskType: TaskTypeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(taskType?.name ?? '');
  const [code, setCode] = useState(taskType?.code ?? '');
  const [description, setDescription] = useState(taskType?.description ?? '');

  const save = useMutation({
    mutationFn: () => {
      const details = { name: name.trim(), description: description.trim() };
      return taskType
        ? api.patch('task-types/' + taskType.id, details)
        : api.post('task-types', {
            ...details,
            code,
            description: details.description || undefined,
          });
    },
    onSuccess: () => {
      toast.success(taskType ? 'Task type updated' : 'Task type created');
      void queryClient.invalidateQueries({ queryKey: ['task-types'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not save the task type', { description: errorDescription(error) });
    },
  });

  const codeValid = taskType !== null || CODE_PATTERN.test(code);
  const valid = name.trim().length >= 2 && codeValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{taskType ? 'Edit task type' : 'New task type'}</DialogTitle>
          <DialogDescription>
            Task types classify work and let workflows pick the right route automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <FormField id="task-type-name" label="Name" required>
            <Input
              id="task-type-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Programme report"
              maxLength={80}
            />
          </FormField>
          <FormField
            id="task-type-code"
            label="Code"
            required={!taskType}
            error={code && !codeValid ? '2–30 characters: A–Z, 0–9, hyphen or underscore.' : undefined}
            hint={taskType ? 'The code is fixed once a task type exists.' : undefined}
          >
            <Input
              id="task-type-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="PROGRAMME_REPORT"
              className="font-mono"
              disabled={taskType !== null}
              maxLength={30}
            />
          </FormField>
          <FormField id="task-type-description" label="Description">
            <Textarea
              id="task-type-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid} loading={save.isPending}>
            {taskType ? 'Save task type' : 'Create task type'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Create, rename or recolour a tag. Mount with a `key` per tag. */
export function TagDialog({
  tag,
  open,
  onOpenChange,
}: {
  tag: TagRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color ?? '#64748B');

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), color };
      return tag ? api.patch('tags/' + tag.id, payload) : api.post('tags', payload);
    },
    onSuccess: () => {
      toast.success(tag ? 'Tag updated' : 'Tag created');
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not save the tag', { description: errorDescription(error) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tag ? 'Edit tag' : 'New tag'}</DialogTitle>
          <DialogDescription>Tag names are stored in lower case.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <FormField id="tag-name" label="Name" required>
            <Input
              id="tag-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="quarterly-report"
              maxLength={40}
            />
          </FormField>
          <FormField id="tag-color" label="Colour">
            <div className="flex items-center gap-2">
              <Input
                id="tag-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-8 w-12 cursor-pointer p-1"
              />
              <span className="font-mono text-xs text-muted-foreground">{color}</span>
            </div>
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={name.trim().length === 0}
            loading={save.isPending}
          >
            {tag ? 'Save tag' : 'Create tag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
