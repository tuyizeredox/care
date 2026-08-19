import { cn } from '@/lib/utils';

/** Loading placeholder. Always give it the size of the content it replaces. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} aria-hidden {...props} />;
}

export { Skeleton };
