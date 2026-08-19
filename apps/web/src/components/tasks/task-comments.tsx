'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, MessageSquare, Reply, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/empty-state';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatRelative } from '@/lib/format';
import type { TaskComment, UserSummary } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';

/** Threaded discussion with @mentions. */
export function TaskComments({ taskId, taskNumber }: { taskId: string; taskNumber: number }) {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['task', taskNumber, 'comments'],
    queryFn: () => api.list<TaskComment>('tasks/' + taskId + '/comments', { query: { pageSize: 100 } }),
  });

  const comments = data?.data ?? [];

  return (
    <div className="space-y-4">
      {can('comment_task') ? (
        <CommentComposer
          taskId={taskId}
          taskNumber={taskNumber}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onPosted={() => {
            setReplyTo(null);
            void queryClient.invalidateQueries({ queryKey: ['task', taskNumber] });
          }}
          currentUser={user}
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No comments yet"
          description="Use comments to ask questions or flag something before handing the task on."
        />
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentRow comment={comment} onReply={() => setReplyTo(comment)} />
              {comment.replies && comment.replies.length > 0 ? (
                <ul className="mt-3 space-y-3 border-l-2 pl-4">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow comment={reply} compact />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  onReply,
  compact = false,
}: {
  comment: TaskComment;
  onReply?: () => void;
  compact?: boolean;
}) {
  return (
    <article className="flex gap-3">
      <UserAvatar user={comment.author} className={compact ? 'h-6 w-6' : 'h-8 w-8'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium">{fullName(comment.author)}</span>
          {comment.author.position ? (
            <span className="text-2xs text-muted-foreground">{comment.author.position.title}</span>
          ) : null}
          <time className="text-2xs text-muted-foreground" dateTime={comment.createdAt}>
            {formatRelative(comment.createdAt)}
          </time>
          {comment.editedAt ? (
            <span className="text-2xs text-muted-foreground">(edited)</span>
          ) : null}
        </div>

        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {comment.body}
        </p>

        {comment.mentions.length > 0 ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
            <AtSign className="h-3 w-3" aria-hidden />
            {comment.mentions.map((mention) => fullName(mention.user)).join(', ')}
          </p>
        ) : null}

        {onReply ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 px-2 text-xs text-muted-foreground"
            onClick={onReply}
          >
            <Reply className="h-3 w-3" aria-hidden />
            Reply
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function CommentComposer({
  taskId,
  taskNumber,
  replyTo,
  onCancelReply,
  onPosted,
  currentUser,
}: {
  taskId: string;
  taskNumber: number;
  replyTo: TaskComment | null;
  onCancelReply: () => void;
  onPosted: () => void;
  currentUser: UserSummary | null;
}) {
  const [body, setBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<UserSummary[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: candidates } = useQuery({
    queryKey: ['task', taskNumber, 'mention-candidates', mentionQuery],
    queryFn: () =>
      api.get<UserSummary[]>('tasks/' + taskId + '/mention-candidates', {
        query: { search: mentionQuery ?? '' },
      }),
    enabled: mentionQuery !== null,
  });

  const post = useMutation({
    mutationFn: () =>
      api.post('tasks/' + taskId + '/comments', {
        body: body.trim(),
        parentId: replyTo?.id,
        mentionIds: mentioned.map((person) => person.id),
      }),
    onSuccess: () => {
      setBody('');
      setMentioned([]);
      setMentionQuery(null);
      onPosted();
    },
    onError: (error) => {
      toast.error('Comment not posted', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  /** Opens the mention picker when the caret is inside an "@word". */
  const handleChange = (value: string) => {
    setBody(value);
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const match = value.slice(0, caret).match(/@(\w*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const insertMention = (person: UserSummary) => {
    const caret = textareaRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@(\w*)$/, '@' + fullName(person) + ' ');
    setBody(before + body.slice(caret));
    setMentioned((current) =>
      current.some((entry) => entry.id === person.id) ? current : [...current, person],
    );
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      {replyTo ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
          <span className="truncate text-muted-foreground">
            Replying to <span className="font-medium">{fullName(replyTo.author)}</span>
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancelReply}>
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="flex gap-3">
        <UserAvatar user={currentUser} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => handleChange(event.target.value)}
              placeholder="Add a comment. Type @ to mention someone."
              rows={3}
              aria-label="Comment"
            />

            {mentionQuery !== null && (candidates ?? []).length > 0 ? (
              <div className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-72 overflow-y-auto scroll-slim rounded-md border bg-popover shadow-md">
                <ul>
                  {(candidates ?? []).slice(0, 8).map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => insertMention(person)}
                        className={cn(
                          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors',
                          'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                        )}
                      >
                        <UserAvatar user={person} className="h-6 w-6" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{fullName(person)}</span>
                          <span className="block truncate text-2xs text-muted-foreground">
                            {person.position?.title ?? person.email}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-2xs text-muted-foreground">
              {mentioned.length > 0
                ? mentioned.length + ' person(s) will be notified'
                : 'Mentioned people are notified.'}
            </p>
            <Button
              size="sm"
              onClick={() => post.mutate()}
              disabled={body.trim().length === 0}
              loading={post.isPending}
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
