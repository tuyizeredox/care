export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DeadlineState =
  | 'none'
  | 'completed'
  | 'overdue'
  | 'due_today'
  | 'due_tomorrow'
  | 'due_soon'
  | 'on_track';

export interface DeadlineMeta {
  state: DeadlineState;
  /** Whole days until the deadline (negative when overdue). */
  daysRemaining: number | null;
  daysOverdue: number;
  isOverdue: boolean;
  isDueToday: boolean;
  isDueTomorrow: boolean;
}

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Calendar-day difference between two instants (b - a), ignoring clock time. */
export const differenceInCalendarDays = (a: Date, b: Date): number =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);

/**
 * Derives every deadline-related flag the UI needs from a single deadline.
 * A task that is already finished is never reported as overdue.
 */
export const getDeadlineMeta = (
  deadline: Date | null | undefined,
  now: Date = new Date(),
  completedAt: Date | null = null,
): DeadlineMeta => {
  if (!deadline) {
    return {
      state: completedAt ? 'completed' : 'none',
      daysRemaining: null,
      daysOverdue: 0,
      isOverdue: false,
      isDueToday: false,
      isDueTomorrow: false,
    };
  }

  const daysRemaining = differenceInCalendarDays(now, deadline);
  const finished = Boolean(completedAt);
  const isOverdue = !finished && daysRemaining < 0;
  const isDueToday = !finished && daysRemaining === 0;
  const isDueTomorrow = !finished && daysRemaining === 1;

  let state: DeadlineState = 'on_track';
  if (finished) state = 'completed';
  else if (isOverdue) state = 'overdue';
  else if (isDueToday) state = 'due_today';
  else if (isDueTomorrow) state = 'due_tomorrow';
  else if (daysRemaining <= 3) state = 'due_soon';

  return {
    state,
    daysRemaining,
    daysOverdue: isOverdue ? Math.abs(daysRemaining) : 0,
    isOverdue,
    isDueToday,
    isDueTomorrow,
  };
};

/** Seconds between two instants, floored at 0. */
export const durationSeconds = (from: Date, to: Date = new Date()): number =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

/** "3d 4h", "5h 12m", "45m", "< 1m" — used across timeline and analytics UIs. */
export const humanizeDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return '< 1m';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    const remainderHours = hours % 24;
    return remainderHours > 0 ? `${days}d ${remainderHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainderMinutes = minutes % 60;
    return remainderMinutes > 0 ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
};

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY);

export const endOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

export const startOfDayUtc = startOfDay;
