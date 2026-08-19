import {
  addDays,
  differenceInCalendarDays,
  durationSeconds,
  getDeadlineMeta,
  humanizeDuration,
} from './date.util';

const at = (iso: string): Date => new Date(iso);

describe('deadline calculations', () => {
  const now = at('2026-08-19T10:00:00Z');

  it('reports no deadline when none is set', () => {
    const meta = getDeadlineMeta(null, now);
    expect(meta.state).toBe('none');
    expect(meta.daysRemaining).toBeNull();
    expect(meta.isOverdue).toBe(false);
  });

  it('flags a deadline that falls today', () => {
    const meta = getDeadlineMeta(at('2026-08-19T17:00:00Z'), now);
    expect(meta.state).toBe('due_today');
    expect(meta.isDueToday).toBe(true);
    expect(meta.daysRemaining).toBe(0);
  });

  it('flags tomorrow separately from "due soon"', () => {
    expect(getDeadlineMeta(at('2026-08-20T17:00:00Z'), now).state).toBe('due_tomorrow');
    expect(getDeadlineMeta(at('2026-08-22T17:00:00Z'), now).state).toBe('due_soon');
    expect(getDeadlineMeta(at('2026-09-19T17:00:00Z'), now).state).toBe('on_track');
  });

  it('counts whole days overdue', () => {
    const meta = getDeadlineMeta(at('2026-08-17T17:00:00Z'), now);
    expect(meta.state).toBe('overdue');
    expect(meta.isOverdue).toBe(true);
    expect(meta.daysOverdue).toBe(2);
    expect(meta.daysRemaining).toBe(-2);
  });

  it('never reports a finished task as overdue', () => {
    const meta = getDeadlineMeta(at('2026-08-01T17:00:00Z'), now, at('2026-07-30T09:00:00Z'));
    expect(meta.state).toBe('completed');
    expect(meta.isOverdue).toBe(false);
    expect(meta.daysOverdue).toBe(0);
  });

  it('ignores the clock time when counting calendar days', () => {
    // 23:59 today to 00:01 tomorrow is two minutes but one calendar day.
    expect(
      differenceInCalendarDays(at('2026-08-19T23:59:00'), at('2026-08-20T00:01:00')),
    ).toBe(1);
  });
});

describe('duration helpers', () => {
  it('floors negative spans at zero', () => {
    expect(durationSeconds(at('2026-08-19T12:00:00Z'), at('2026-08-19T11:00:00Z'))).toBe(0);
  });

  it('measures elapsed seconds', () => {
    expect(durationSeconds(at('2026-08-19T10:00:00Z'), at('2026-08-19T10:30:00Z'))).toBe(1800);
  });

  it.each([
    [null, '—'],
    [30, '< 1m'],
    [90, '1m'],
    [3600, '1h'],
    [5400, '1h 30m'],
    [86_400, '1d'],
    [93_600, '1d 2h'],
  ])('humanises %s seconds as %s', (seconds, expected) => {
    expect(humanizeDuration(seconds)).toBe(expected);
  });

  it('adds days without mutating the input', () => {
    const start = at('2026-08-19T10:00:00Z');
    const later = addDays(start, 3);
    expect(later.toISOString()).toBe('2026-08-22T10:00:00.000Z');
    expect(start.toISOString()).toBe('2026-08-19T10:00:00.000Z');
  });
});
