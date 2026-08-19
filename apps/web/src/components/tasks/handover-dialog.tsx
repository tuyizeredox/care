'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import type { TaskDetail } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';

type HandoverAction = 'CONTINUE' | 'SUBMIT' | 'REVIEW' | 'APPROVE';

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  position: { id: string; title: string; level?: number } | null;
  department: { id: string; name: string; color: string } | null;
  activeTaskCount: number;
  isSuggested: boolean;
}

const ACTIONS: Array<{ value: HandoverAction; label: string; description: string }> = [
  { value: 'CONTINUE', label: 'Continue the work', description: 'They pick up where you left off.' },
  { value: 'SUBMIT', label: 'Submit work', description: 'They take ownership of the next step.' },
  { value: 'REVIEW', label: 'Review', description: 'They check what has been done.' },
  { value: 'APPROVE', label: 'Approve', description: 'They give a formal decision.' },
];

/** Debounces the candidate search so each keystroke does not hit the API. */
function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function HandoverDialog({
  task,
  open,
  onOpenChange,
}: {
  task: TaskDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<HandoverAction>('REVIEW');
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['task', task.number, 'handover-candidates', debouncedSearch],
    queryFn: () =>
      api.get<{ suggestedUserId: string | null; candidates: Candidate[] }>(
        'tasks/' + task.id + '/handover-candidates',
        { query: { search: debouncedSearch } },
      ),
    enabled: open,
  });

  // Pre-select whoever the workflow says is next, so the common path is fast.
  useEffect(() => {
    if (open && data?.suggestedUserId && !selectedId) setSelectedId(data.suggestedUserId);
  }, [open, data?.suggestedUserId, selectedId]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedId(null);
      setNote('');
      setAction('REVIEW');
    }
  }, [open]);

  const handover = useMutation({
    mutationFn: () =>
      api.post('tasks/' + task.id + '/handover', {
        toUserId: selectedId,
        action,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      const recipient = data?.candidates.find((candidate) => candidate.id === selectedId);
      toast.success('Task handed over', {
        description:
          '#' + task.number + ' is now with ' + (recipient ? fullName(recipient) : 'the new owner') + '.',
      });
      void queryClient.invalidateQueries({ queryKey: ['task', task.number] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Handover failed', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const candidates = data?.candidates ?? [];
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit &amp; hand over</DialogTitle>
          <DialogDescription>
            #{task.number} {task.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="eyebrow">Current owner</p>
            <p className="mt-0.5 font-medium">
              {task.currentOwner ? fullName(task.currentOwner) : 'Unassigned'}
              {task.currentOwner?.position ? (
                <span className="font-normal text-muted-foreground">
                  {' · ' + task.currentOwner.position.title}
                </span>
              ) : null}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="handover-search" required>
              Send to
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="handover-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or position…"
                className="pl-8"
              />
            </div>

            <div
              className="max-h-56 overflow-y-auto scroll-slim rounded-md border"
              role="listbox"
              aria-label="Employees"
            >
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {[0, 1, 2].map((index) => (
                    <Skeleton key={index} className="h-11 w-full" />
                  ))}
                </div>
              ) : candidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matching employees.
                </p>
              ) : (
                <ul className="divide-y">
                  {candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={candidate.id === selectedId}
                        onClick={() => setSelectedId(candidate.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent',
                          candidate.id === selectedId && 'bg-primary/[0.07]',
                        )}
                      >
                        <UserAvatar user={candidate} className="h-7 w-7" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {fullName(candidate)}
                            </span>
                            {candidate.isSuggested ? (
                              <Badge variant="default" className="gap-1 px-1.5 py-0">
                                <Sparkles className="h-2.5 w-2.5" aria-hidden />
                                Next in workflow
                              </Badge>
                            ) : null}
                          </span>
                          <span className="block truncate text-2xs text-muted-foreground">
                            {[candidate.position?.title, candidate.department?.name]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 text-2xs text-muted-foreground">
                          {candidate.activeTaskCount} active
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Ask them to</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ACTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-md border px-3 py-2 transition-colors',
                    action === option.value
                      ? 'border-primary bg-primary/[0.06]'
                      : 'hover:bg-accent/50',
                  )}
                >
                  <input
                    type="radio"
                    name="handover-action"
                    value={option.value}
                    checked={action === option.value}
                    onChange={() => setAction(option.value)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-2xs text-muted-foreground">{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="handover-note">Handover note</Label>
            <Textarea
              id="handover-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Report prepared and ready for GESI review."
            />
            <p className="text-2xs text-muted-foreground">
              This note is stored permanently in the task journey.
            </p>
          </div>

          {selected ? (
            <p className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
              <span className="font-medium">
                {task.currentOwner ? fullName(task.currentOwner) : 'Unassigned'}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="font-medium">{fullName(selected)}</span>
              <span className="text-muted-foreground">to {action.toLowerCase()}</span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => handover.mutate()}
            disabled={!selectedId}
            loading={handover.isPending}
          >
            Confirm handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
