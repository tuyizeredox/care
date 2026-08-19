'use client';

import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  /** Colours the figure when the number represents a problem. */
  tone?: 'default' | 'warning' | 'danger' | 'success';
  href?: string;
  loading?: boolean;
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-foreground',
  warning: 'text-amber-700 dark:text-amber-400',
  danger: 'text-destructive',
  success: 'text-emerald-700 dark:text-emerald-400',
};

/**
 * A single figure. No icon, no chrome: on a dashboard of eight of these the
 * icons become noise, and the number is what the reader came for.
 */
export function StatCard({ label, value, hint, tone = 'default', href, loading }: StatCardProps) {
  const body = (
    <div
      className={cn(
        'h-full rounded border bg-card px-4 py-3.5 transition-colors',
        href && 'hover:border-foreground/20',
      )}
    >
      <p className="eyebrow truncate">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-14" />
      ) : (
        <p
          className={cn(
            'mt-1.5 text-[26px] font-semibold leading-none tabular',
            TONES[tone],
          )}
        >
          {value}
        </p>
      )}
      {hint ? <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block rounded focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}
