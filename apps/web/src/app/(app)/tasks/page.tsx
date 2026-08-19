'use client';

import { useQuery } from '@tanstack/react-query';
import { KanbanSquare, List, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { KanbanBoard } from '@/components/tasks/kanban-board';
import { EMPTY_FILTERS, TaskFilters, type TaskFilterState } from '@/components/tasks/task-filters';
import { TaskTable } from '@/components/tasks/task-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/empty-state';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { TaskPriority, TaskStatus } from '@/lib/constants';
import type { TaskSummary } from '@/lib/types';

type ViewMode = 'list' | 'board';

function TasksView() {
  const params = useSearchParams();
  const { can } = useAuth();

  // Seed the filters from the URL so dashboard cards can deep-link here.
  const initialFilters = useMemo<TaskFilterState>(() => {
    const csv = (key: string): string[] => {
      const raw = params.get(key);
      return raw ? raw.split(',').filter(Boolean) : [];
    };
    return {
      ...EMPTY_FILTERS,
      search: params.get('search') ?? '',
      status: csv('status') as TaskStatus[],
      priority: csv('priority') as TaskPriority[],
      departmentId: csv('departmentId'),
      projectId: csv('projectId'),
      overdue: params.get('overdue') === 'true',
      dueToday: params.get('dueToday') === 'true',
      assignedToMe: params.get('assignedToMe') === 'true',
      needsMyAction: params.get('needsMyAction') === 'true',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filters, setFilters] = useState<TaskFilterState>(initialFilters);
  const [view, setView] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = {
    page,
    pageSize: view === 'board' ? 200 : 25,
    sortBy,
    sortOrder,
    search: filters.search || undefined,
    status: filters.status,
    priority: filters.priority,
    departmentId: filters.departmentId,
    projectId: filters.projectId,
    ownerId: filters.ownerId,
    overdue: filters.overdue || undefined,
    dueToday: filters.dueToday || undefined,
    assignedToMe: filters.assignedToMe || undefined,
    needsMyAction: filters.needsMyAction || undefined,
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tasks', query],
    queryFn: () => api.list<TaskSummary>('tasks', { query }),
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const applyFilters = (next: TaskFilterState) => {
    setFilters(next);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Every task you have access to, with who holds it now and what it is waiting for."
        actions={
          <>
            <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
              <TabsList>
                <TabsTrigger value="list" aria-label="Table view">
                  <List className="h-4 w-4" aria-hidden />
                  List
                </TabsTrigger>
                <TabsTrigger value="board" aria-label="Kanban view">
                  <KanbanSquare className="h-4 w-4" aria-hidden />
                  Board
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {can('create_task') ? (
              <Button asChild>
                <Link href="/tasks/new">
                  <Plus className="h-4 w-4" aria-hidden />
                  New task
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <TaskFilters filters={filters} onChange={applyFilters} />

      {isError ? (
        <ErrorState
          title="We could not load these tasks."
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : view === 'board' ? (
        <KanbanBoard
          tasks={data?.data ?? []}
          loading={isLoading}
          canMove={can('edit_task') || can('submit_task') || can('review_task')}
        />
      ) : (
        <>
          <TaskTable
            tasks={data?.data ?? []}
            loading={isLoading}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
          {data?.meta ? (
            <Pagination meta={data.meta} onPageChange={setPage} itemLabel="tasks" />
          ) : null}
        </>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksView />
    </Suspense>
  );
}
