import Link from 'next/link';
import { UserAvatar } from '@/components/ui/avatar';
import type { UserSummary } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';

interface UserChipProps {
  user?: UserSummary | null;
  className?: string;
  /** Show the position under the name. */
  showPosition?: boolean;
  size?: 'sm' | 'md';
  href?: string | null;
  emptyLabel?: string;
}

/**
 * The person representation used across the product. Answering "who has it
 * now?" at a glance is the whole point, so name and position travel together.
 */
export function UserChip({
  user,
  className,
  showPosition = false,
  size = 'sm',
  href,
  emptyLabel = 'Unassigned',
}: UserChipProps) {
  const avatarSize = size === 'md' ? 'h-9 w-9' : 'h-7 w-7';

  const content = (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <UserAvatar user={user} className={avatarSize} fallbackLabel="?" />
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate font-medium',
            size === 'md' ? 'text-sm' : 'text-xs',
            !user && 'text-muted-foreground',
          )}
        >
          {user ? fullName(user) : emptyLabel}
        </span>
        {showPosition && user ? (
          <span className="block truncate text-2xs text-muted-foreground">
            {user.position?.title ?? user.jobTitle ?? user.department?.name ?? ''}
          </span>
        ) : null}
      </span>
    </span>
  );

  if (href && user) {
    return (
      <Link href={href} className="rounded-md hover:underline">
        {content}
      </Link>
    );
  }
  return content;
}
