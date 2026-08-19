'use client';

import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { UserSummary } from '@/lib/types';

interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  summary: string | null;
  ip: string | null;
  createdAt: string;
  actor:
    | (UserSummary & { position: { title: string } | null; department: { name: string } | null })
    | null;
}

const ALL = '__all__';

/** System-level audit trail with the filters an administrator actually uses. */
export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: actions } = useQuery({
    queryKey: ['audit', 'actions'],
    queryFn: () => api.get<string[]>('audit-logs/actions'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, search, action, dateFrom, dateTo],
    queryFn: () =>
      api.list<AuditRow>('audit-logs', {
        query: {
          page,
          pageSize: 25,
          search: search || undefined,
          action: action === ALL ? undefined : action,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      }),
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="audit-search">Search</Label>
          <Input
            id="audit-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Summary, action or resource…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Select
            value={action}
            onValueChange={(value) => {
              setAction(value);
              setPage(1);
            }}
          >
            <SelectTrigger id="audit-action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {(actions ?? []).map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-to">To</Label>
          <Input
            id="audit-to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries match these filters" />
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <time
                  className="w-40 shrink-0 text-xs tabular-nums text-muted-foreground"
                  dateTime={row.createdAt}
                >
                  {formatDateTime(row.createdAt)}
                </time>
                <div className="w-48 shrink-0">
                  <UserChip user={row.actor} emptyLabel="System" />
                </div>
                <p className="min-w-0 flex-1 text-sm">{row.summary ?? row.action}</p>
                <Badge variant="secondary" className="shrink-0 font-mono text-2xs">
                  {row.action}
                </Badge>
                <span className="w-28 shrink-0 text-right text-2xs text-muted-foreground">
                  {row.resourceType}
                </span>
              </li>
            ))}
          </ul>
          {data?.meta ? (
            <Pagination meta={data.meta} onPageChange={setPage} itemLabel="entries" />
          ) : null}
        </>
      )}
    </div>
  );
}
