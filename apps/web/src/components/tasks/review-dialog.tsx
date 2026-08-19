'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import type { TaskDetail } from '@/lib/types';

export type ReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

const COPY: Record<
  ReviewDecision,
  {
    title: string;
    description: string;
    confirmLabel: string;
    requiresReason: boolean;
    tone: 'default' | 'destructive';
    placeholder: string;
  }
> = {
  APPROVE: {
    title: 'Approve this task',
    description:
      'Approving moves the task to the next stage of its workflow, or completes it if this was the final approval.',
    confirmLabel: 'Confirm approval',
    requiresReason: false,
    tone: 'default',
    placeholder: 'Optional note for the record.',
  },
  REQUEST_CHANGES: {
    title: 'Request changes',
    description:
      'The task goes back to whoever submitted it, with your comment attached to the journey.',
    confirmLabel: 'Send back for changes',
    requiresReason: true,
    tone: 'default',
    placeholder: 'Please correct the financial figures in section 3.',
  },
  REJECT: {
    title: 'Reject this task',
    description: 'Rejecting returns the task with your reason recorded permanently.',
    confirmLabel: 'Confirm rejection',
    requiresReason: true,
    tone: 'destructive',
    placeholder: 'Explain why this cannot be accepted.',
  },
};

const ICONS: Record<ReviewDecision, typeof CheckCircle2> = {
  APPROVE: CheckCircle2,
  REQUEST_CHANGES: RotateCcw,
  REJECT: XCircle,
};

/** Approve / request changes / reject, with a required reason where it matters. */
export function ReviewDialog({
  task,
  decision,
  open,
  onOpenChange,
}: {
  task: TaskDetail;
  decision: ReviewDecision;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const copy = COPY[decision];
  const Icon = ICONS[decision];

  useEffect(() => {
    if (!open) {
      setComment('');
      setTouched(false);
    }
  }, [open]);

  const missingReason = copy.requiresReason && comment.trim().length === 0;

  const submit = useMutation({
    mutationFn: () =>
      api.post('tasks/' + task.id + '/decision', {
        decision,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      const message =
        decision === 'APPROVE'
          ? 'Task approved'
          : decision === 'REJECT'
            ? 'Task rejected'
            : 'Changes requested';
      toast.success(message, { description: '#' + task.number + ' ' + task.title });
      void queryClient.invalidateQueries({ queryKey: ['task', task.number] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Could not record your decision', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon
              className={
                'h-4 w-4 ' + (decision === 'REJECT' ? 'text-destructive' : 'text-primary')
              }
              aria-hidden
            />
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">
              #{task.number} {task.title}
            </p>
            {task.currentOwner ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Submitted by {task.currentOwner.firstName} {task.currentOwner.lastName}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="review-comment" required={copy.requiresReason}>
              {copy.requiresReason ? 'Reason' : 'Comment'}
            </Label>
            <Textarea
              id="review-comment"
              rows={4}
              value={comment}
              onBlur={() => setTouched(true)}
              onChange={(event) => setComment(event.target.value)}
              placeholder={copy.placeholder}
              aria-invalid={touched && missingReason}
              aria-describedby={touched && missingReason ? 'review-comment-error' : undefined}
            />
            {touched && missingReason ? (
              <p id="review-comment-error" className="text-xs text-destructive">
                A reason is required so the person receiving this knows what to do.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={copy.tone === 'destructive' ? 'destructive' : 'default'}
            onClick={() => {
              setTouched(true);
              if (!missingReason) submit.mutate();
            }}
            loading={submit.isPending}
          >
            {copy.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
