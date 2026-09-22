import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * App mark: an open ring that closes on a single node — a task's journey, and
 * the one person holding it now. Same geometry as the generated app icons
 * (scripts/generate-icons.mjs); change both together.
 */
export function LogoMark({ className }: { className?: string }) {
  // React ids contain characters that are awkward inside url(#…).
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg viewBox="0 0 512 512" className={cn('h-8 w-8 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D6263B" />
          <stop offset="1" stopColor="#9A1526" />
        </linearGradient>
        <radialGradient id={`${id}-sheen`} cx="0.2" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="115" fill={`url(#${id}-bg)`} />
      <rect width="512" height="512" rx="115" fill={`url(#${id}-sheen)`} />
      <g transform="translate(-6 0)" fill="none">
        <path
          d="M341.6 160.9A128 128 0 1 0 341.6 351.1"
          stroke="#fff"
          strokeWidth="56"
          strokeLinecap="round"
        />
        <circle cx="384" cy="256" r="40" fill="#fff" />
      </g>
    </svg>
  );
}

/**
 * CARE Workflow lockup: the mark, then the wordmark set in the interface
 * typeface so it stays crisp at every size and in both themes.
 */
export function Brand({
  className,
  showSubtitle = true,
  tone = 'default',
}: {
  className?: string;
  showSubtitle?: boolean;
  /** `inverse` for dark surfaces that stay dark in both themes. */
  tone?: 'default' | 'inverse';
}) {
  const inverse = tone === 'inverse';
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="h-7 w-7" />
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            'text-[15px] font-bold uppercase tracking-[0.14em]',
            inverse ? 'text-white' : 'text-primary',
          )}
        >
          CARE
        </span>
        {showSubtitle ? (
          <span
            className={cn(
              'border-l pl-2 text-[13px] font-medium',
              inverse ? 'border-white/20 text-white/65' : 'border-border text-muted-foreground',
            )}
          >
            Workflow
          </span>
        ) : null}
      </span>
    </span>
  );
}
