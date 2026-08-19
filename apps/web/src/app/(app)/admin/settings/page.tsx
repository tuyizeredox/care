'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { humanize } from '@/lib/format';

interface Setting {
  id: string;
  key: string;
  value: unknown;
  category: string;
  label: string | null;
  description: string | null;
}

/**
 * System settings. Values are typed JSON, so the editor picks a control from
 * the value's shape rather than from a hard-coded list of keys.
 */
export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting[]>('settings'),
  });

  useEffect(() => {
    if (data) {
      setDrafts(Object.fromEntries(data.map((setting) => [setting.key, setting.value])));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put('settings/' + key, { value }),
    onSuccess: () => {
      toast.success('Setting saved');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      toast.error('Could not save the setting', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const grouped = (data ?? []).reduce<Record<string, Setting[]>>((accumulator, setting) => {
    accumulator[setting.category] = [...(accumulator[setting.category] ?? []), setting];
    return accumulator;
  }, {});

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if ((data ?? []).length === 0) {
    return <EmptyState icon={Settings2} title="No settings configured" />;
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([category, settings]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle>{humanize(category)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {settings.map((setting) => {
              const draft = drafts[setting.key];
              const isBoolean = typeof setting.value === 'boolean';
              const isArray = Array.isArray(setting.value);
              const changed = JSON.stringify(draft) !== JSON.stringify(setting.value);

              return (
                <div
                  key={setting.key}
                  className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={'setting-' + setting.key}>
                      {setting.label ?? setting.key}
                    </Label>
                    {setting.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{setting.description}</p>
                    ) : null}
                    <p className="mt-0.5 font-mono text-2xs text-muted-foreground">{setting.key}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:w-72">
                    {isBoolean ? (
                      <Switch
                        id={'setting-' + setting.key}
                        checked={Boolean(draft)}
                        onCheckedChange={(value) => {
                          setDrafts((current) => ({ ...current, [setting.key]: value }));
                          save.mutate({ key: setting.key, value });
                        }}
                      />
                    ) : (
                      <>
                        <Input
                          id={'setting-' + setting.key}
                          value={
                            isArray
                              ? (draft as unknown[]).join(', ')
                              : String(draft ?? '')
                          }
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [setting.key]: isArray
                                ? event.target.value
                                    .split(',')
                                    .map((entry) => Number(entry.trim()))
                                    .filter((entry) => Number.isFinite(entry))
                                : event.target.value,
                            }))
                          }
                        />
                        <Button
                          size="icon-sm"
                          variant="outline"
                          disabled={!changed}
                          onClick={() => save.mutate({ key: setting.key, value: draft })}
                          aria-label={'Save ' + (setting.label ?? setting.key)}
                        >
                          <Save className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
