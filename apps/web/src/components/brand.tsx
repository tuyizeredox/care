import { cn } from '@/lib/utils';

/**
 * CARE wordmark.
 *
 * Set in the interface typeface rather than as an image: this is an internal
 * tool, and a typographic mark stays crisp at every size and in both themes.
 */
export function Brand({
  className,
  showSubtitle = true,
}: {
  className?: string;
  showSubtitle?: boolean;
}) {
  return (
    <span className={cn('flex items-baseline gap-2', className)}>
      <span className="text-[15px] font-bold uppercase tracking-[0.14em] text-primary">
        CARE
      </span>
      {showSubtitle ? (
        <span className="border-l border-border pl-2 text-[13px] font-medium text-muted-foreground">
          Workflow
        </span>
      ) : null}
    </span>
  );
}

/** Square mark for tight spaces — the favicon-scale lockup. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded bg-primary text-[10px] font-bold uppercase tracking-[0.06em] text-primary-foreground',
        className,
      )}
      aria-hidden
    >
      CARE
    </span>
  );
}
