'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  History,
  ListTree,
  MessageSquare,
  Paperclip,
  Play,
  Route,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { UserChip } from '@/components/user-chip';
import { EmptyState, ErrorState } from '@/components/empty-state';
import { HandoverDialog } from '@/components/tasks/handover-dialog';
import { ReviewDialog, type ReviewDecision } from '@/components/tasks/review-dialog';
import { TaskAttachments } from '@/components/tasks/task-attachments';
import { TaskComments } from '@/components/tasks/task-comments';
import { JourneyStrip, TaskJourneyTimeline } from '@/components/tasks/task-journey';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { WAITING_REASON_LABELS } from '@/lib/constants';
import { formatDate, formatDateTime, formatDeadline, formatRelative, humanize } from '@/lib/format';
import type { TaskDetail, TaskHistoryEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function TaskDetailPage() {
  const params = useParams<{ number: string }>();
  const taskNumber = params.number;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [handoverOpen, setHandoverOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision | null>(null);

  const { data: task, isLoading, isError, refetch } = useQuery({
    queryKey: ['task', taskNumber],
    queryFn: () => api.get<TaskDetail>('tasks/' + taskNumber),
  });

  const { data: history } = useQuery({
    queryKey: ['task', taskNumber, 'history'],
    queryFn: () => api.list<TaskHistoryEntry>('tasks/' + taskNumber + '/history'),
    enabled: Boolean(task),
  });

  const start = useMutation({
    mutationFn: () => api.post('tasks/' + task?.id + '/start'),
    onSuccess: () => {
      toast.success('Task started');
      void queryClient.invalidateQueries({ queryKey: ['task', taskNumber] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      toast.error('Could not start this task', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const startReview = useMutation({
    mutationFn: () => api.post('tasks/' + task?.id + '/review'),
    onSuccess: () => {
      toast.success('Review started');
      void queryClient.invalidateQueries({ queryKey: ['task', taskNumber] });
    },
    onError: (error) => {
      toast.error('Could not start the review', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  if (isLoading) return <TaskDetailSkeleton />;

  if (isError || !task) {
    return (
      <ErrorState
        title="We could not open this task."
        description="It may have been archived, or you may not have permission to view it."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
            <Button asChild>
              <Link href="/tasks">Back to tasks</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const isOwner = task.currentOwner?.id === user?.id;
  const canStart = isOwner && ['ASSIGNED', 'CHANGES_REQUESTED', 'BLOCKED'].includes(task.status);
  const canReview = task.status === 'SUBMITTED' && isOwner;
  const canDecide =
    ['SUBMITTED', 'UNDER_REVIEW'].includes(task.status) && (isOwner || task.viewer.canApprove);

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link href="/tasks" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden />
              Tasks
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span className="font-mono">#{task.number}</span>
          </nav>
        }
        title={task.title}
        actions={
          <>
            {canStart ? (
              <Button onClick={() => start.mutate()} loading={start.isPending}>
                <Play className="h-4 w-4" aria-hidden />
                Start work
              </Button>
            ) : null}
            {canReview ? (
              <Button variant="outline" onClick={() => startReview.mutate()} loading={startReview.isPending}>
                <UserCheck className="h-4 w-4" aria-hidden />
                Take under review
              </Button>
            ) : null}
            {canDecide ? (
              <>
                <Button variant="outline" onClick={() => setReviewDecision('REQUEST_CHANGES')}>
                  Request changes
                </Button>
                <Button onClick={() => setReviewDecision('APPROVE')}>
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  Approve
                </Button>
              </>
            ) : null}
            {task.viewer.canHandover && task.isOpen ? (
              <Button variant={canDecide ? 'outline' : 'default'} onClick={() => setHandoverOpen(true)}>
                <Send className="h-4 w-4" aria-hidden />
                Submit &amp; hand over
              </Button>
            ) : null}
          </>
        }
      />

      {/* Who has it now - the question the product exists to answer. */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded border bg-card px-4 py-3">
        <div>
          <p className="eyebrow">Currently with</p>
          <div className="mt-1">
            <UserChip user={task.currentOwner} showPosition size="md" href={task.currentOwner ? '/people/' + task.currentOwner.id : null} />
          </div>
        </div>

        <div className="h-9 w-px bg-border" aria-hidden />

        <div>
          <p className="eyebrow">Status</p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
        </div>

        <div>
          <p className="eyebrow">Deadline</p>
          <p
            className={cn(
              'mt-1.5 text-sm font-medium',
              task.deadlineMeta?.isOverdue && 'text-destructive',
            )}
          >
            {formatDeadline(task.deadline, task.deadlineMeta)}
          </p>
        </div>

        <div>
          <p className="eyebrow">Held for</p>
          <p className="mt-1.5 text-sm font-medium">{task.timeWithOwner ?? '—'}</p>
        </div>

        {task.waitingReason && task.waitingReason !== 'NONE' ? (
          <div>
            <p className="eyebrow">Waiting for</p>
            <p className="mt-1.5 text-sm font-medium">
              {WAITING_REASON_LABELS[task.waitingReason] ?? humanize(task.waitingReason)}
            </p>
          </div>
        ) : null}

        <div className="ml-auto hidden max-w-md xl:block">
          <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">Route</p>
          <JourneyStrip journey={task.journey} />
        </div>
      </section>

      {task.status === 'BLOCKED' && task.blockedReason ? (
        <div
          role="alert"
          className="rounded border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
        >
          <p className="font-medium text-destructive">This task is blocked</p>
          <p className="mt-0.5 text-muted-foreground">{task.blockedReason}</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {task.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No description was provided.</p>
              )}
            </CardContent>
          </Card>

          {task.subtasks.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2">
                  <ListTree className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Subtasks
                </CardTitle>
                <span className="text-xs font-medium text-muted-foreground">
                  {task.completedSubtaskCount} / {task.subtaskCount} completed
                </span>
              </CardHeader>
              <CardContent className="pt-0">
                <Progress
                  value={
                    task.subtaskCount > 0
                      ? (task.completedSubtaskCount / task.subtaskCount) * 100
                      : 0
                  }
                  className="mb-3"
                />
                <ul className="divide-y">
                  {task.subtasks.map((subtask) => (
                    <li key={subtask.id}>
                      <Link
                        href={'/tasks/' + subtask.number}
                        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
                      >
                        <CheckCircle2
                          className={cn(
                            'h-4 w-4 shrink-0',
                            subtask.status === 'COMPLETED'
                              ? 'text-emerald-600'
                              : 'text-muted-foreground/40',
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            subtask.status === 'COMPLETED' && 'text-muted-foreground line-through',
                          )}
                        >
                          {subtask.title}
                        </span>
                        <UserChip user={subtask.currentOwner} />
                        <StatusBadge status={subtask.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-4">
              <Tabs defaultValue="journey">
                <TabsList>
                  <TabsTrigger value="journey">
                    <Route className="h-4 w-4" aria-hidden />
                    Journey
                  </TabsTrigger>
                  <TabsTrigger value="comments">
                    <MessageSquare className="h-4 w-4" aria-hidden />
                    Comments
                    {task.commentCount > 0 ? (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0">
                        {task.commentCount}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="files">
                    <Paperclip className="h-4 w-4" aria-hidden />
                    Files
                    {task.attachments.length > 0 ? (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0">
                        {task.attachments.length}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History className="h-4 w-4" aria-hidden />
                    History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="journey">
                  <TaskJourneyTimeline journey={task.journey} />
                </TabsContent>

                <TabsContent value="comments">
                  <TaskComments taskId={task.id} taskNumber={task.number} />
                </TabsContent>

                <TabsContent value="files">
                  <TaskAttachments
                    taskId={task.id}
                    taskNumber={task.number}
                    attachments={task.attachments}
                  />
                </TabsContent>

                <TabsContent value="history">
                  <HistoryList entries={history?.data ?? []} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              <DetailRow label="Created by">
                <UserChip user={task.createdBy} />
              </DetailRow>
              <DetailRow label="Assigned by">
                <UserChip user={task.assignedBy} emptyLabel="—" />
              </DetailRow>
              <DetailRow label="Department">
                {task.department ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: task.department.color }}
                      aria-hidden
                    />
                    {task.department.name}
                  </span>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Project">
                {task.project ? (
                  <Link href={'/projects/' + task.project.id} className="hover:underline">
                    {task.project.name}
                  </Link>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Workflow">{task.workflow?.name ?? '—'}</DetailRow>
              <DetailRow label="Current stage">{task.currentStage?.name ?? '—'}</DetailRow>
              <DetailRow label="Task type">{task.taskType?.name ?? '—'}</DetailRow>
              <DetailRow label="Started">{formatDate(task.startDate)}</DetailRow>
              <DetailRow label="Deadline">{formatDate(task.deadline)}</DetailRow>
              {task.completedAt ? (
                <DetailRow label="Completed">{formatDateTime(task.completedAt)}</DetailRow>
              ) : null}
              <DetailRow label="Estimated effort">
                {task.estimatedHours ? task.estimatedHours + ' hours' : '—'}
              </DetailRow>
              <DetailRow label="Created">{formatRelative(task.createdAt)}</DetailRow>
            </CardContent>
          </Card>

          {task.tags.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {task.tags.map(({ tag }) => (
                    <span
                      key={tag.id}
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: tag.color + '1A', color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {task.approvals.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Approvals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {task.approvals.map((approval) => (
                  <div key={approval.id} className="rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <UserChip user={approval.approver} />
                      <Badge
                        variant={
                          approval.status === 'APPROVED'
                            ? 'success'
                            : approval.status === 'REJECTED'
                              ? 'destructive'
                              : approval.status === 'PENDING'
                                ? 'warning'
                                : 'secondary'
                        }
                      >
                        {humanize(approval.status)}
                      </Badge>
                    </div>
                    {approval.comment ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">{approval.comment}</p>
                    ) : null}
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {approval.decidedAt
                        ? 'Decided ' + formatRelative(approval.decidedAt)
                        : 'Requested ' + formatRelative(approval.createdAt)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      <HandoverDialog task={task} open={handoverOpen} onOpenChange={setHandoverOpen} />
      {reviewDecision ? (
        <ReviewDialog
          task={task}
          decision={reviewDecision}
          open={reviewDecision !== null}
          onOpenChange={(open) => !open && setReviewDecision(null)}
        />
      ) : null}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm">{children}</span>
    </div>
  );
}

function HistoryList({ entries }: { entries: TaskHistoryEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState icon={History} title="No history yet" className="border-0" />;
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 border-b pb-3 last:border-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">
                {entry.actor ? entry.actor.firstName + ' ' + entry.actor.lastName : 'System'}
              </span>{' '}
              <span className="text-muted-foreground">{entry.summary.toLowerCase()}</span>
            </p>
            {entry.comment ? (
              <blockquote className="mt-1 border-l-2 pl-2.5 text-xs italic text-muted-foreground">
                {entry.comment}
              </blockquote>
            ) : null}
          </div>
          <time
            className="shrink-0 text-2xs text-muted-foreground"
            dateTime={entry.createdAt}
            title={formatDateTime(entry.createdAt)}
          >
            {formatRelative(entry.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function TaskDetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-96" />
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
