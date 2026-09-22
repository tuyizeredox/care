'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Network, Plus } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
import { RowActions } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import type { UserSummary } from '@/lib/types';
import { DepartmentDialog } from './department-dialog';
import { PositionDialog } from './position-dialog';

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  sortOrder: number;
  head: UserSummary | null;
  _count?: { members: number; positions: number; tasks: number };
}

export interface PositionRow {
  id: string;
  title: string;
  code: string;
  description: string | null;
  level: number;
  headcount: number;
  department: { id: string; name: string; color: string } | null;
  reportsTo: { id: string; title: string } | null;
  _count?: { users: number };
}

type PendingDelete =
  | { kind: 'department'; row: DepartmentRow }
  | { kind: 'position'; row: PositionRow };

/**
 * Departments and positions. The hierarchy lives in the database, so changing
 * a reporting line here reshapes the org chart and every visibility rule that
 * depends on it.
 */
export default function AdminOrganizationPage() {
  const queryClient = useQueryClient();
  const [departmentDialog, setDepartmentDialog] = useState<{ row: DepartmentRow | null } | null>(
    null,
  );
  const [positionDialog, setPositionDialog] = useState<{ row: PositionRow | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api.get<DepartmentRow[]>('departments'),
  });

  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ['admin', 'positions'],
    queryFn: () => api.get<PositionRow[]>('positions'),
  });

  const remove = useMutation({
    mutationFn: (target: PendingDelete) =>
      api.delete(
        (target.kind === 'department' ? 'departments/' : 'positions/') + target.row.id,
      ),
    onSuccess: (_result, target) => {
      toast.success(target.kind === 'department' ? 'Department deleted' : 'Position deleted');
      setPendingDelete(null);
      // Deleting either one detaches the other, so refresh both lists.
      for (const key of ['departments', 'positions']) {
        void queryClient.invalidateQueries({ queryKey: ['admin', key] });
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error) => {
      toast.error('Could not delete', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Tabs defaultValue="departments">
      <TabsList>
        <TabsTrigger value="departments">Departments</TabsTrigger>
        <TabsTrigger value="positions">Positions</TabsTrigger>
      </TabsList>

      <TabsContent value="departments">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>Departments</CardTitle>
            <Button size="sm" onClick={() => setDepartmentDialog({ row: null })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New department
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {departmentsLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (departments ?? []).length === 0 ? (
              <EmptyState icon={Building2} title="No departments yet" className="m-4 border-dashed" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Department</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Head</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="text-right">Positions</TableHead>
                    <TableHead className="w-20">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(departments ?? []).map((department) => (
                    <TableRow key={department.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: department.color }}
                            aria-hidden
                          />
                          <span className="font-medium">{department.name}</span>
                        </span>
                        {department.description ? (
                          <span className="block text-2xs text-muted-foreground">
                            {department.description}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {department.code}
                      </TableCell>
                      <TableCell>
                        <UserChip user={department.head} emptyLabel="No head" />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {department._count?.members ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {department._count?.positions ?? '—'}
                      </TableCell>
                      <TableCell>
                        <RowActions
                          label={department.name}
                          onEdit={() => setDepartmentDialog({ row: department })}
                          onDelete={() => setPendingDelete({ kind: 'department', row: department })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="positions">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>Positions and reporting lines</CardTitle>
            <Button size="sm" onClick={() => setPositionDialog({ row: null })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New position
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {positionsLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (positions ?? []).length === 0 ? (
              <EmptyState icon={Network} title="No positions yet" className="m-4 border-dashed" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Position</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reports to</TableHead>
                    <TableHead className="text-right">Level</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="w-20">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(positions ?? []).map((position) => (
                    <TableRow key={position.id}>
                      <TableCell className="font-medium">{position.title}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {position.code}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {position.department?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {position.reportsTo?.title ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{position.level}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {position._count?.users ?? '—'}
                      </TableCell>
                      <TableCell>
                        <RowActions
                          label={position.title}
                          onEdit={() => setPositionDialog({ row: position })}
                          onDelete={() => setPendingDelete({ kind: 'position', row: position })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <DepartmentDialog
        key={'department-' + (departmentDialog?.row?.id ?? 'new')}
        department={departmentDialog?.row ?? null}
        open={departmentDialog !== null}
        onOpenChange={(open) => !open && setDepartmentDialog(null)}
      />

      <PositionDialog
        key={'position-' + (positionDialog?.row?.id ?? 'new')}
        position={positionDialog?.row ?? null}
        positions={positions ?? []}
        open={positionDialog !== null}
        onOpenChange={(open) => !open && setPositionDialog(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={
          pendingDelete?.kind === 'department'
            ? 'Delete the ' + pendingDelete.row.name + ' department?'
            : 'Delete the ' + (pendingDelete?.row.title ?? '') + ' position?'
        }
        description={
          pendingDelete?.kind === 'department'
            ? 'Only an empty department can be deleted. Its positions and projects are kept but no longer belong to a department. Existing tasks keep it for reporting.'
            : 'Only a position nobody holds can be deleted. Positions that reported to it move up to its own manager position.'
        }
        confirmLabel={pendingDelete?.kind === 'department' ? 'Delete department' : 'Delete position'}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
        loading={remove.isPending}
      />
    </Tabs>
  );
}
