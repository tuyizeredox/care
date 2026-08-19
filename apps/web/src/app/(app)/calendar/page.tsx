'use client';

import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { PRIORITY_META } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

type CalendarView = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor };
    if (view === 'week') {
      return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    }
    return {
      from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    };
  }, [cursor, view]);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'calendar', range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      api.list<TaskSummary>('tasks', {
        query: {
          deadlineFrom: format(range.from, 'yyyy-MM-dd'),
          deadlineTo: format(range.to, 'yyyy-MM-dd'),
          pageSize: 200,
          sortBy: 'deadline',
          sortOrder: 'asc',
        },
      }),
  });

  const days = useMemo(
    () => eachDayOfInterval({ start: range.from, end: range.to }),
    [range.from, range.to],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const task of data?.data ?? []) {
      if (!task.deadline) continue;
      const key = format(new Date(task.deadline), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [data]);

  const step = (direction: 1 | -1) => {
    setCursor((current) => {
      if (view === 'month') return direction === 1 ? addMonths(current, 1) : subMonths(current, 1);
      if (view === 'week') return addDays(current, direction * 7);
      return addDays(current, direction);
    });
    setSelectedDay(null);
  };

  const headingFormat = view === 'day' ? 'EEEE d MMMM yyyy' : 'MMMM yyyy';
  const selectedTasks = selectedDay
    ? (tasksByDay.get(format(selectedDay, 'yyyy-MM-dd')) ?? [])
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Task deadlines by date. Click any task to open it."
        actions={
          <Tabs value={view} onValueChange={(value) => setView(value as CalendarView)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCursor(new Date());
              setSelectedDay(null);
            }}
          >
            Today
          </Button>
        </div>
        <h2 className="text-sm font-semibold">{format(cursor, headingFormat)}</h2>
        <p className="text-xs text-muted-foreground">
          {(data?.data ?? []).length} task(s) with deadlines in view
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-[32rem] w-full" />
      ) : view === 'day' ? (
        <DayList date={cursor} tasks={tasksByDay.get(format(cursor, 'yyyy-MM-dd')) ?? []} />
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <div className="grid grid-cols-7 gap-px border-b pb-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px bg-border">
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayTasks = tasksByDay.get(key) ?? [];
                const outsideMonth = view === 'month' && !isSameMonth(day, cursor);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      'min-h-[6.5rem] bg-card p-1.5 text-left transition-colors hover:bg-accent/50',
                      outsideMonth && 'bg-muted/30 text-muted-foreground',
                      selectedDay && isSameDay(day, selectedDay) && 'ring-2 ring-inset ring-primary',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                        isToday(day) && 'bg-primary font-semibold text-primary-foreground',
                      )}
                    >
                      {format(day, 'd')}
                    </span>

                    <div className="mt-1 space-y-0.5">
                      {dayTasks.slice(0, 3).map((task) => (
                        <Link
                          key={task.id}
                          href={'/tasks/' + task.number}
                          onClick={(event) => event.stopPropagation()}
                          className={cn(
                            'block truncate rounded px-1 py-0.5 text-2xs',
                            task.deadlineMeta?.isOverdue
                              ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                              : 'bg-muted hover:bg-accent',
                          )}
                          title={task.title}
                        >
                          <span
                            className={cn(
                              'mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle',
                              PRIORITY_META[task.priority].bar,
                            )}
                            aria-hidden
                          />
                          {task.title}
                        </Link>
                      ))}
                      {dayTasks.length > 3 ? (
                        <span className="block px-1 text-2xs text-muted-foreground">
                          +{dayTasks.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedDay ? <DayList date={selectedDay} tasks={selectedTasks} /> : null}
    </div>
  );
}

function DayList({ date, tasks }: { date: Date; tasks: TaskSummary[] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">{formatDate(date)}</h3>
        {tasks.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No deadlines on this day"
            className="border-0 py-6"
          />
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={'/tasks/' + task.number}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
                >
                  <span className="font-mono text-2xs text-muted-foreground">#{task.number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
                  <UserChip user={task.currentOwner} />
                  <StatusBadge status={task.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
