'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Network } from 'lucide-react';
import { UserChip } from '@/components/user-chip';
import { EmptyState } from '@/components/empty-state';
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
import { api } from '@/lib/api-client';
import type { UserSummary } from '@/lib/types';

interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  head: UserSummary | null;
  _count?: { members: number; positions: number; tasks: number };
}

interface PositionRow {
  id: string;
  title: string;
  code: string;
  level: number;
  headcount: number;
  department: { id: string; name: string; color: string } | null;
  reportsTo: { id: string; title: string } | null;
  _count?: { users: number };
}

/**
 * Departments and positions. The hierarchy lives in the database, so changing
 * a reporting line here reshapes the org chart and every visibility rule that
 * depends on it.
 */
export default function AdminOrganizationPage() {
  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api.get<DepartmentRow[]>('departments'),
  });

  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ['admin', 'positions'],
    queryFn: () => api.get<PositionRow[]>('positions'),
  });

  return (
    <Tabs defaultValue="departments">
      <TabsList>
        <TabsTrigger value="departments">Departments</TabsTrigger>
        <TabsTrigger value="positions">Positions</TabsTrigger>
      </TabsList>

      <TabsContent value="departments">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Departments</CardTitle>
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
          <CardHeader className="pb-3">
            <CardTitle>Positions and reporting lines</CardTitle>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
