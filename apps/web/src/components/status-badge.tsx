import { PRIORITY_META, STATUS_META, type TaskPriority, type TaskStatus } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Status and priority marks.
 *
 * A dot and a word, not an icon and a word: on a table of forty rows the icons
 * become texture, and the colour already carries the signal. Badges stay the
 * same height everywhere so rows never shift.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;

  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded px-1.5 text-xs font-medium ring-1 ring-inset',
        meta.badge,
        className,
      )}
      title={meta.description}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.MEDIUM;

  // Low priority is the default state and does not need to be announced.
  if (priority === 'LOW') {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>{meta.label}</span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded px-1.5 text-xs font-medium ring-1 ring-inset',
        meta.badge,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.bar)} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Dot and label without the enclosing chip, for the tightest spaces. */
export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
      <span className="text-muted-foreground">{meta.label}</span>
    </span>
  );
}
