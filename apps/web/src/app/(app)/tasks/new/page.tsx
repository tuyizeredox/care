'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { PRIORITY_META, type TaskPriority } from '@/lib/constants';
import type { TaskDetail, UserSummary } from '@/lib/types';

const schema = z.object({
  title: z.string().min(3, 'Give the task a title of at least 3 characters.').max(200),
  description: z.string().max(20000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  projectId: z.string().optional(),
  taskTypeId: z.string().optional(),
  workflowId: z.string().optional(),
  departmentId: z.string().optional(),
  assigneeId: z.string().optional(),
  deadline: z.string().optional(),
  startDate: z.string().optional(),
  estimatedHours: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Option {
  id: string;
  name: string;
  code?: string;
}

const NONE = '__none__';

export default function NewTaskPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', title: '', description: '' },
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => api.list<Option>('projects', { query: { pageSize: 100 } }),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => api.get<Option[]>('departments'),
  });
  const { data: taskTypes } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => api.get<Option[]>('task-types'),
  });
  const { data: workflows } = useQuery({
    queryKey: ['workflows', 'options'],
    queryFn: () => api.list<Option>('workflows', { query: { activeOnly: true, pageSize: 100 } }),
  });
  const { data: people } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => api.list<UserSummary>('users', { query: { pageSize: 200 } }),
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<TaskDetail>('tasks', {
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        priority: values.priority,
        projectId: values.projectId === NONE ? undefined : values.projectId,
        taskTypeId: values.taskTypeId === NONE ? undefined : values.taskTypeId,
        workflowId: values.workflowId === NONE ? undefined : values.workflowId,
        departmentId: values.departmentId === NONE ? undefined : values.departmentId,
        assigneeId: values.assigneeId === NONE ? undefined : values.assigneeId,
        deadline: values.deadline || undefined,
        startDate: values.startDate || undefined,
        estimatedHours: values.estimatedHours ? Number(values.estimatedHours) : undefined,
        tags: tags.length > 0 ? tags : undefined,
      }),
    onSuccess: (task) => {
      toast.success('Task #' + task.number + ' created successfully.', {
        description: task.currentOwner
          ? 'It is now with ' + task.currentOwner.firstName + ' ' + task.currentOwner.lastName + '.'
          : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/tasks/' + task.number);
    },
    onError: (error) => {
      toast.error('Task not created', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const addTag = () => {
    const value = tagInput.trim().toLowerCase();
    if (!value || tags.includes(value) || tags.length >= 20) return;
    setTags([...tags, value]);
    setTagInput('');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        breadcrumb={
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Tasks
          </Link>
        }
        title="Create a task"
        description="The workflow decides who receives it first. Choose an assignee to override that."
      />

      <form onSubmit={handleSubmit((values) => create.mutate(values))} noValidate>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Task details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="title" required>
                Title
              </Label>
              <Input
                id="title"
                placeholder="Prepare Q3 SERVE programme report"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'title-error' : undefined}
                {...register('title')}
              />
              {errors.title ? (
                <p id="title-error" className="text-xs text-destructive">
                  {errors.title.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="What needs doing, what it depends on, and what finished looks like."
                {...register('description')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={control}
                name="priority"
                label="Priority"
                options={(Object.keys(PRIORITY_META) as TaskPriority[]).map((key) => ({
                  id: key,
                  name: PRIORITY_META[key].label,
                }))}
                allowNone={false}
              />
              <SelectField
                control={control}
                name="taskTypeId"
                label="Task type"
                placeholder="Choose a type"
                options={taskTypes ?? []}
              />
              <SelectField
                control={control}
                name="projectId"
                label="Project"
                placeholder="No project"
                options={projects?.data ?? []}
              />
              <SelectField
                control={control}
                name="departmentId"
                label="Department"
                placeholder="Use the assignee's department"
                options={departments ?? []}
              />
              <SelectField
                control={control}
                name="workflowId"
                label="Workflow"
                placeholder="Best match for this task type"
                options={workflows?.data ?? []}
              />
              <SelectField
                control={control}
                name="assigneeId"
                label="Initial assignee"
                placeholder="Let the workflow decide"
                options={(people?.data ?? []).map((person) => ({
                  id: person.id,
                  name:
                    person.firstName +
                    ' ' +
                    person.lastName +
                    (person.position ? ' · ' + person.position.title : ''),
                }))}
              />

              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" type="date" {...register('startDate')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deadline">Deadline</Label>
                <Input id="deadline" type="date" {...register('deadline')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="estimatedHours">Estimated effort (hours)</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  min={0}
                  step={0.5}
                  {...register('estimatedHours')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="quarterly-report"
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((entry) => entry !== tag))}
                        aria-label={'Remove tag ' + tag}
                        className="rounded hover:text-destructive"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/tasks">Cancel</Link>
          </Button>
          <Button type="submit" loading={isSubmitting || create.isPending}>
            Create task
          </Button>
        </div>
      </form>
    </div>
  );
}

function SelectField({
  control,
  name,
  label,
  options,
  placeholder = 'Select',
  allowNone = true,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  name: keyof FormValues;
  label: string;
  options: Option[];
  placeholder?: string;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={String(name)}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <SelectTrigger id={String(name)}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowNone ? <SelectItem value={NONE}>{placeholder}</SelectItem> : null}
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}
