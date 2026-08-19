'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api-client';
import { formatDateTime, formatRelative, humanize } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Preference {
  type: string;
  inApp: boolean;
  email: boolean;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'page', filter, page],
    queryFn: () =>
      api.list<NotificationItem>('notifications', {
        query: { page, pageSize: 25, unreadOnly: filter === 'unread' || undefined },
      }),
  });

  const { data: preferences } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => api.get<Preference[]>('notifications/preferences'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markAllRead = useMutation({
    mutationFn: () => api.post('notifications/read-all'),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      void invalidate();
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch('notifications/' + id + '/read'),
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => api.delete('notifications/' + id),
    onSuccess: invalidate,
  });

  const savePreferences = useMutation({
    mutationFn: (next: Preference[]) => api.patch('notifications/preferences', { preferences: next }),
    onSuccess: () => {
      toast.success('Notification preferences saved');
      void invalidate();
    },
  });

  const togglePreference = (type: string, channel: 'inApp' | 'email', value: boolean) => {
    const next = (preferences ?? []).map((preference) =>
      preference.type === type ? { ...preference, [channel]: value } : preference,
    );
    savePreferences.mutate(next);
  };

  const items = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Everything that has happened on work you are involved in."
        actions={
          <>
            <Tabs value={filter} onValueChange={(value) => setFilter(value as 'all' | 'unread')}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={() => markAllRead.mutate()} loading={markAllRead.isPending}>
              <CheckCheck className="h-4 w-4" aria-hidden />
              Mark all read
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
              description="You will be notified when a task is assigned, handed to you, or needs your decision."
            />
          ) : (
            <>
              <ul className="divide-y rounded border">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={cn('flex items-start gap-3 p-3.5', !item.readAt && 'bg-primary/[0.03]')}
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        item.readAt ? 'bg-transparent' : 'bg-primary',
                      )}
                      aria-hidden
                    />
                    <Link
                      href={item.link ?? '/dashboard'}
                      onClick={() => !item.readAt && markRead.mutate(item.id)}
                      className="min-w-0 flex-1"
                    >
                      <p className={cn('text-sm', !item.readAt && 'font-medium')}>{item.title}</p>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {item.body}
                        </p>
                      ) : null}
                      <p
                        className="mt-1 text-2xs text-muted-foreground"
                        title={formatDateTime(item.createdAt)}
                      >
                        {humanize(item.type)} · {formatRelative(item.createdAt)}
                      </p>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => dismiss.mutate(item.id)}
                      aria-label="Dismiss notification"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              {data?.meta ? (
                <Pagination meta={data.meta} onPageChange={setPage} itemLabel="notifications" />
              ) : null}
            </>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle>Delivery preferences</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-4 text-2xs uppercase tracking-wide text-muted-foreground">
              <span>Event</span>
              <span>In app</span>
              <span>Email</span>
            </div>
            <ul className="max-h-[30rem] space-y-2 overflow-y-auto scroll-slim">
              {(preferences ?? []).map((preference) => (
                <li
                  key={preference.type}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4"
                >
                  <span className="truncate text-sm">{humanize(preference.type)}</span>
                  <Switch
                    checked={preference.inApp}
                    onCheckedChange={(value) => togglePreference(preference.type, 'inApp', value)}
                    aria-label={'In-app notifications for ' + humanize(preference.type)}
                  />
                  <Switch
                    checked={preference.email}
                    onCheckedChange={(value) => togglePreference(preference.type, 'email', value)}
                    aria-label={'Email notifications for ' + humanize(preference.type)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
