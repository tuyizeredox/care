'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { formatDeadline, formatRelative, humanize } from '@/lib/format';
import type { Approval } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

/**
 * Approval inbox. Decisions themselves happen on the task detail page, where
 * the reviewer can see the work, its attachments and its full history first.
 */
export default function ApprovalsPage() {
  const [filter, setFilter] = useState<Filter>('PENDING');

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', filter],
    queryFn: () =>
      api.list<Approval>('approvals', {
        query: { status: filter === 'ALL' ? undefined : filter, pageSize: 50 },
      }),
  });

  const approvals = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description="Decisions waiting on you, and the ones you have already made."
        actions={
          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList>
              <TabsTrigger value="PENDING">Pending</TabsTrigger>
              <TabsTrigger value="APPROVED">Approved</TabsTrigger>
              <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
              <TabsTrigger value="ALL">All</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={filter === 'PENDING' ? 'No approvals waiting on you' : 'Nothing to show'}
          description={
            filter === 'PENDING'
              ? 'When someone sends work for your approval it appears here.'
              : 'Try a different filter.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <Card
                className={cn(
                  'transition-colors hover:border-primary/40',
                  approval.status === 'PENDING' && 'border-amber-300/60 dark:border-amber-900',
                )}
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-2xs text-muted-foreground">
                        #{approval.task?.number}
                      </span>
                      <Link
                        href={'/tasks/' + approval.task?.number}
                        className="truncate text-sm font-semibold hover:text-primary"
                      >
                        {approval.task?.title}
                      </Link>
                      <Badge
                        variant={
                          approval.status === 'APPROVED'
                            ? 'success'
                            : approval.status === 'REJECTED'
                              ? 'destructive'
                              : approval.status === 'PENDING'
                                ? 'warning'
                                : 'secondary'
                        }
                      >
                        {humanize(approval.status)}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        Submitted by
                        <UserChip user={approval.requestedBy} emptyLabel="—" />
                      </span>
                      <span>{formatRelative(approval.createdAt)}</span>
                      {approval.task ? (
                        <span
                          className={cn(
                            approval.task.deadlineMeta?.isOverdue && 'font-medium text-destructive',
                          )}
                        >
                          {formatDeadline(approval.task.deadline, approval.task.deadlineMeta)}
                        </span>
                      ) : null}
                      {approval.stage ? <span>Stage: {approval.stage.name}</span> : null}
                    </div>

                    {approval.comment ? (
                      <blockquote className="mt-2 border-l-2 pl-2.5 text-xs italic text-muted-foreground">
                        {approval.comment}
                      </blockquote>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {approval.task ? (
                      <>
                        <PriorityBadge priority={approval.task.priority} />
                        <StatusBadge status={approval.task.status} />
                      </>
                    ) : null}
                    <Button size="sm" asChild>
                      <Link href={'/tasks/' + approval.task?.number}>
                        {approval.status === 'PENDING' ? 'Review' : 'Open'}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
