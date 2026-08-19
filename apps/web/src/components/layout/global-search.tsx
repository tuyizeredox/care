'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  href: string;
}

interface SearchResult {
  query: string;
  total: number;
  groups: Array<{ label: string; hits: SearchHit[] }>;
}

/** Debounces the input so a query only fires once typing settles. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);
  const router = useRouter();

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResult>('search', { query: { q: debounced } }),
    enabled: debounced.trim().length >= 2,
  });

  const flatHits = useMemo(
    () => (data?.groups ?? []).flatMap((group) => group.hits),
    [data],
  );

  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0" hideClose>
        <DialogHeader className="sr-only">
          <DialogTitle>Search OrgFlow</DialogTitle>
          <DialogDescription>
            Search tasks, comments, projects, people and departments.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search tasks, people, projects…  try a task number like 1042"
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label="Search"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto scroll-slim p-2">
          {debounced.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Type at least two characters to search.
            </p>
          ) : isFetching && !data ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : flatHits.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matched “{debounced}”.
            </p>
          ) : (
            (data?.groups ?? []).map((group) => (
              <div key={group.label} className="mb-2">
                <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <ul>
                  {group.hits.map((hit) => (
                    <li key={hit.type + hit.id}>
                      <button
                        type="button"
                        onClick={() => go(hit.href)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                          'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{hit.title}</span>
                          {hit.subtitle ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </span>
                          ) : null}
                        </span>
                        {hit.badge ? (
                          <Badge variant="secondary" className="shrink-0">
                            {hit.badge.replace(/_/g, ' ').toLowerCase()}
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
