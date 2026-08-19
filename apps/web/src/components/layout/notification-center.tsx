'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { cn } from '@/lib/utils';

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ count: number }>('notifications/unread-count'),
    refetchInterval: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => api.list<NotificationItem>('notifications', { query: { pageSize: 12 } }),
    enabled: open,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch('notifications/' + id + '/read'),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('notifications/read-all'),
    onSuccess: invalidate,
  });

  const count = unread?.count ?? 0;
  const items = data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count > 0 ? count + ' unread notifications' : 'Notifications'}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[26rem] overflow-y-auto scroll-slim">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              You are all caught up.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className={cn(!item.readAt && 'bg-primary/[0.04]')}>
                  <div className="flex items-start gap-2 px-4 py-3">
                    <Link
                      href={item.link ?? '/dashboard'}
                      onClick={() => {
                        if (!item.readAt) markRead.mutate(item.id);
                        setOpen(false);
                      }}
                      className="min-w-0 flex-1"
                    >
                      <p className={cn('text-sm leading-snug', !item.readAt && 'font-medium')}>
                        {item.title}
                      </p>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {item.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-2xs text-muted-foreground">
                        {formatRelative(item.createdAt)}
                      </p>
                    </Link>
                    {!item.readAt ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Mark as read"
                        onClick={() => markRead.mutate(item.id)}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t p-2">
          <Button variant="ghost" size="sm" asChild className="w-full">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
