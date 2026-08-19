'use client';

import { AlertTriangle, ArrowDown, CheckCircle2, Circle, Clock, Flag, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { JourneyStep, TaskJourney } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The task journey.
 *
 * Answers the two questions the whole product is built around: who has this
 * now, and how did it get here. Completed stops are facts from the ownership
 * ledger; upcoming stops are the workflow's projection and are visibly
 * lighter so the two are never confused.
 */
export function TaskJourneyTimeline({ journey }: { journey: TaskJourney }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded border bg-muted/40 px-4 py-3 text-sm">
        <Summary label="Total elapsed" value={journey.totalElapsed} />
        <Summary label="Handovers" value={String(journey.handoverCount)} />
        {journey.slowestStage ? (
          <Summary
            label="Longest stage"
            value={
              journey.slowestStage.user.firstName +
              ' ' +
              journey.slowestStage.user.lastName +
              ' · ' +
              journey.slowestStage.duration
            }
            hint={journey.slowestStage.share + '% of total time'}
          />
        ) : null}
      </div>

      <ol className="relative space-y-1">
        {journey.steps.map((step, index) => (
          <JourneyRow
            key={step.kind + step.sequence + index}
            step={step}
            isLast={index === journey.steps.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {hint ? <p className="text-2xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StepIcon({ step }: { step: JourneyStep }) {
  if (step.kind === 'CREATED') {
    return <Play className="h-3.5 w-3.5" aria-hidden />;
  }
  if (step.kind === 'FINISH') {
    return <Flag className="h-3.5 w-3.5" aria-hidden />;
  }
  if (step.state === 'completed') {
    return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />;
  }
  if (step.state === 'current') {
    return <Clock className="h-3.5 w-3.5" aria-hidden />;
  }
  return <Circle className="h-3.5 w-3.5" aria-hidden />;
}

function JourneyRow({ step, isLast }: { step: JourneyStep; isLast: boolean }) {
  const isCurrent = step.state === 'current';
  const isUpcoming = step.state === 'upcoming';

  return (
    <li className="relative flex gap-3 pb-1">
      {/* Connector */}
      {!isLast ? (
        <span
          className={cn(
            'absolute left-[11px] top-7 h-[calc(100%-0.75rem)] w-px',
            isUpcoming ? 'border-l border-dashed border-border' : 'bg-border',
          )}
          aria-hidden
        />
      ) : null}

      <span
        className={cn(
          'z-10 mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-background',
          isCurrent && 'bg-primary text-primary-foreground',
          step.state === 'completed' && 'bg-muted text-muted-foreground',
          isUpcoming && 'border border-dashed bg-background text-muted-foreground',
        )}
      >
        <StepIcon step={step} />
      </span>

      <div
        className={cn(
          'min-w-0 flex-1 rounded border px-3.5 py-3 transition-colors',
          isCurrent && 'border-primary/35 bg-primary/[0.035]',
          isUpcoming && 'border-dashed bg-transparent',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn('text-sm font-semibold', isUpcoming && 'text-muted-foreground')}>
                {step.title}
              </p>
              {isCurrent ? (
                <Badge variant="default" className="gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                  Current
                </Badge>
              ) : null}
              {isUpcoming && step.kind !== 'FINISH' ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Upcoming
                </Badge>
              ) : null}
              {step.breachedSla ? (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  Over target
                </Badge>
              ) : null}
            </div>

            {step.person ? (
              <div className="mt-1.5 flex items-center gap-2">
                <UserAvatar
                  user={{
                    id: step.person.id,
                    firstName: step.person.name.split(' ')[0],
                    lastName: step.person.name.split(' ').slice(1).join(' '),
                    avatarUrl: step.person.avatarUrl,
                  }}
                  className="h-6 w-6"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{step.person.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {[step.person.position, step.person.department?.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            ) : step.note ? (
              <p className="mt-1 text-xs text-muted-foreground">{step.note}</p>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            {step.duration ? (
              <p
                className={cn(
                  'text-xs font-semibold tabular-nums',
                  step.breachedSla && 'text-amber-600 dark:text-amber-400',
                )}
              >
                {step.duration}
              </p>
            ) : null}
            {step.enteredAt ? (
              <p className="text-2xs text-muted-foreground" title={formatDateTime(step.enteredAt)}>
                {formatRelative(step.enteredAt)}
              </p>
            ) : null}
          </div>
        </div>

        {step.action ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
            {step.action}
          </p>
        ) : null}

        {step.note && step.person ? (
          <blockquote className="mt-2 border-l-2 border-primary/30 bg-muted/40 py-1.5 pl-3 text-xs italic text-muted-foreground">
            “{step.note}”
          </blockquote>
        ) : null}
      </div>
    </li>
  );
}

/** Compact horizontal version used at the top of the task detail header. */
export function JourneyStrip({ journey }: { journey: TaskJourney }) {
  const stops = journey.steps.filter(
    (step) => step.kind === 'HANDLED' || step.kind === 'CURRENT' || step.kind === 'UPCOMING',
  );
  if (stops.length === 0) return null;

  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Task route">
      {stops.map((step, index) => (
        <li key={step.kind + index} className="flex items-center gap-1.5">
          <span
            className={cn(
              'whitespace-nowrap rounded-md px-2 py-1',
              step.state === 'current' && 'bg-primary text-primary-foreground font-medium',
              step.state === 'completed' && 'bg-muted text-muted-foreground',
              step.state === 'upcoming' && 'border border-dashed text-muted-foreground',
            )}
          >
            {step.person?.name ?? step.title}
          </span>
          {index < stops.length - 1 ? (
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
