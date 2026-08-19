'use client';

import { useQuery } from '@tanstack/react-query';
import { Filter, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api-client';
import { PRIORITY_META, STATUS_META, type TaskPriority, type TaskStatus } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface TaskFilterState {
  search: string;
  status: TaskStatus[];
  priority: TaskPriority[];
  departmentId: string[];
  projectId: string[];
  ownerId: string[];
  overdue: boolean;
  dueToday: boolean;
  assignedToMe: boolean;
  needsMyAction: boolean;
}

export const EMPTY_FILTERS: TaskFilterState = {
  search: '',
  status: [],
  priority: [],
  departmentId: [],
  projectId: [],
  ownerId: [],
  overdue: false,
  dueToday: false,
  assignedToMe: false,
  needsMyAction: false,
};

interface Option {
  id: string;
  name: string;
  color?: string;
}

export function countActiveFilters(filters: TaskFilterState): number {
  return (
    filters.status.length +
    filters.priority.length +
    filters.departmentId.length +
    filters.projectId.length +
    filters.ownerId.length +
    (filters.overdue ? 1 : 0) +
    (filters.dueToday ? 1 : 0) +
    (filters.assignedToMe ? 1 : 0) +
    (filters.needsMyAction ? 1 : 0)
  );
}

/** Filter bar for the task list. Several filters apply at once. */
export function TaskFilters({
  filters,
  onChange,
}: {
  filters: TaskFilterState;
  onChange: (next: TaskFilterState) => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);

  // Debounce the free-text search so typing does not fire a request per key.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) onChange({ ...filters, search: searchInput });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const { data: departments } = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => api.get<Option[]>('departments'),
    staleTime: 5 * 60_000,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => api.list<Option>('projects', { query: { pageSize: 100 } }),
    staleTime: 5 * 60_000,
  });

  const activeCount = countActiveFilters(filters);

  const toggleIn = <K extends 'status' | 'priority' | 'departmentId' | 'projectId'>(
    key: K,
    value: string,
  ) => {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next } as TaskFilterState);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search tasks by title, description, tag or number…"
            className="pl-8"
            aria-label="Search tasks"
          />
        </div>

        <QuickToggle
          label="Assigned to me"
          active={filters.assignedToMe}
          onClick={() => onChange({ ...filters, assignedToMe: !filters.assignedToMe })}
        />
        <QuickToggle
          label="Needs my action"
          active={filters.needsMyAction}
          onClick={() => onChange({ ...filters, needsMyAction: !filters.needsMyAction })}
        />
        <QuickToggle
          label="Overdue"
          active={filters.overdue}
          onClick={() => onChange({ ...filters, overdue: !filters.overdue })}
          tone="danger"
        />
        <QuickToggle
          label="Due today"
          active={filters.dueToday}
          onClick={() => onChange({ ...filters, dueToday: !filters.dueToday })}
          tone="warning"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" aria-hidden />
              Filters
              {activeCount > 0 ? (
                <Badge variant="default" className="ml-1 px-1.5 py-0">
                  {activeCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>

          <PopoverContent align="end" className="max-h-[28rem] w-80 overflow-y-auto scroll-slim">
            <div className="space-y-4">
              <FilterGroup label="Status">
                {(Object.keys(STATUS_META) as TaskStatus[]).map((status) => (
                  <CheckRow
                    key={status}
                    id={'status-' + status}
                    label={STATUS_META[status].label}
                    checked={filters.status.includes(status)}
                    onCheckedChange={() => toggleIn('status', status)}
                  />
                ))}
              </FilterGroup>

              <FilterGroup label="Priority">
                {(Object.keys(PRIORITY_META) as TaskPriority[]).map((priority) => (
                  <CheckRow
                    key={priority}
                    id={'priority-' + priority}
                    label={PRIORITY_META[priority].label}
                    checked={filters.priority.includes(priority)}
                    onCheckedChange={() => toggleIn('priority', priority)}
                  />
                ))}
              </FilterGroup>

              {(departments ?? []).length > 0 ? (
                <FilterGroup label="Department">
                  {(departments ?? []).map((department) => (
                    <CheckRow
                      key={department.id}
                      id={'department-' + department.id}
                      label={department.name}
                      checked={filters.departmentId.includes(department.id)}
                      onCheckedChange={() => toggleIn('departmentId', department.id)}
                    />
                  ))}
                </FilterGroup>
              ) : null}

              {(projects?.data ?? []).length > 0 ? (
                <FilterGroup label="Project">
                  {(projects?.data ?? []).map((project) => (
                    <CheckRow
                      key={project.id}
                      id={'project-' + project.id}
                      label={project.name}
                      checked={filters.projectId.includes(project.id)}
                      onCheckedChange={() => toggleIn('projectId', project.id)}
                    />
                  ))}
                </FilterGroup>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>

        {activeCount > 0 || filters.search ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
            <X className="h-4 w-4" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function QuickToggle({
  label,
  active,
  onClick,
  tone = 'default',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? tone === 'danger'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : tone === 'warning'
              ? 'border-amber-400/50 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              : 'border-primary/40 bg-primary/10 text-primary'
          : 'bg-background text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  );
}

function CheckRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}
