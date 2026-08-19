import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns';

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy') : '—';
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy, HH:mm') : '—';
};

/** "Today", "Tomorrow", "3 days ago" - the phrasing used across dashboards. */
export const formatRelative = (value: string | Date | null | undefined): string => {
  const date = toDate(value);
  if (!date) return '—';
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return formatDistanceToNowStrict(date, { addSuffix: true });
};

export const formatDeadline = (
  value: string | Date | null | undefined,
  meta?: { isOverdue?: boolean; daysOverdue?: number; daysRemaining?: number | null } | null,
): string => {
  const date = toDate(value);
  if (!date) return 'No deadline';
  if (meta?.isOverdue) {
    return meta.daysOverdue === 1 ? '1 day overdue' : (meta.daysOverdue ?? 0) + ' days overdue';
  }
  if (isToday(date)) return 'Due today';
  if (isTomorrow(date)) return 'Due tomorrow';
  return 'Due ' + format(date, 'd MMM');
};

export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return '< 1m';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return hours % 24 > 0 ? days + 'd ' + (hours % 24) + 'h' : days + 'd';
  if (hours > 0) return minutes % 60 > 0 ? hours + 'h ' + (minutes % 60) + 'm' : hours + 'h';
  return minutes + 'm';
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(value >= 10 ? 0 : 1) + ' ' + units[unit];
};

export const formatNumber = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat('en').format(value);

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : Math.round(value) + '%';

/** SCREAMING_SNAKE enum to "Screaming snake" for display. */
export const humanize = (value: string | null | undefined): string => {
  if (!value) return '—';
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};
