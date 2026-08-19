import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { durationSeconds, humanizeDuration } from '../../common/utils/date.util';
import { OPEN_STATUSES } from '../tasks/task-status.machine';
import { USER_SUMMARY_SELECT } from '../users/user.select';

export interface AnalyticsFilters {
  departmentId?: string;
  projectId?: string;
  workflowId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Ignore tenures shorter than this many minutes (removes pass-through noise). */
  minMinutes?: number;
}

interface Tenure {
  userId: string;
  stageId: string | null;
  seconds: number;
  isOpen: boolean;
}

/**
 * Bottleneck analytics.
 *
 * Everything here is derived from the ownership ledger: how long work waits at
 * each point in a workflow. The output is deliberately framed as *workflow*
 * analysis - a slow stage usually means unclear handover rules, a capacity
 * gap or a missing approval step, not an underperforming individual.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private taskScope(filters: AnalyticsFilters): Prisma.TaskWhereInput {
    return {
      deletedAt: null,
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.workflowId ? { workflowId: filters.workflowId } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };
  }

  /** Loads every tenure in scope with open ones measured up to `now`. */
  private async loadTenures(filters: AnalyticsFilters, now = new Date()): Promise<Tenure[]> {
    const rows = await this.prisma.taskAssignment.findMany({
      where: { task: this.taskScope(filters) },
      select: {
        userId: true,
        stageId: true,
        enteredAt: true,
        exitedAt: true,
        durationSeconds: true,
      },
      take: 20000,
    });

    const floor = (filters.minMinutes ?? 0) * 60;
    return rows
      .map((row) => ({
        userId: row.userId,
        stageId: row.stageId,
        seconds: row.durationSeconds ?? durationSeconds(row.enteredAt, now),
        isOpen: row.exitedAt === null,
      }))
      .filter((tenure) => tenure.seconds >= floor);
  }

  private summarise(values: number[]) {
    if (values.length === 0) {
      return { count: 0, totalSeconds: 0, averageSeconds: 0, medianSeconds: 0, maxSeconds: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    const middle = Math.floor(sorted.length / 2);
    return {
      count: sorted.length,
      totalSeconds: total,
      averageSeconds: Math.round(total / sorted.length),
      medianSeconds:
        sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle],
      maxSeconds: sorted[sorted.length - 1],
    };
  }

  /** Where does work wait longest, by the person holding it? */
  async bottlenecksByPerson(filters: AnalyticsFilters = {}) {
    const tenures = await this.loadTenures(filters);
    const grouped = new Map<string, number[]>();
    const openCount = new Map<string, number>();

    for (const tenure of tenures) {
      const bucket = grouped.get(tenure.userId) ?? [];
      bucket.push(tenure.seconds);
      grouped.set(tenure.userId, bucket);
      if (tenure.isOpen) openCount.set(tenure.userId, (openCount.get(tenure.userId) ?? 0) + 1);
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...grouped.keys()] } },
      select: USER_SUMMARY_SELECT,
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    const rows = [...grouped.entries()]
      .map(([userId, values]) => {
        const stats = this.summarise(values);
        return {
          user: userMap.get(userId) ?? null,
          department: userMap.get(userId)?.department ?? null,
          handledTasks: stats.count,
          currentlyHolding: openCount.get(userId) ?? 0,
          averageSeconds: stats.averageSeconds,
          averageHold: humanizeDuration(stats.averageSeconds),
          medianHold: humanizeDuration(stats.medianSeconds),
          longestHold: humanizeDuration(stats.maxSeconds),
          totalSeconds: stats.totalSeconds,
          totalHold: humanizeDuration(stats.totalSeconds),
        };
      })
      .sort((a, b) => b.averageSeconds - a.averageSeconds);

    const overallAverage =
      rows.length > 0
        ? Math.round(rows.reduce((sum, row) => sum + row.averageSeconds, 0) / rows.length)
        : 0;

    return {
      rows,
      overallAverageSeconds: overallAverage,
      overallAverage: humanizeDuration(overallAverage),
      /** Stages sitting more than 50% above the organisation-wide average. */
      slowStages: rows.filter((row) => row.averageSeconds > overallAverage * 1.5).slice(0, 5),
    };
  }

  /** Same analysis rolled up to departments. */
  async bottlenecksByDepartment(filters: AnalyticsFilters = {}) {
    const tenures = await this.loadTenures(filters);
    const userIds = [...new Set(tenures.map((tenure) => tenure.userId))];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, department: { select: { id: true, name: true, code: true, color: true } } },
    });
    const departmentOf = new Map(users.map((user) => [user.id, user.department]));

    const grouped = new Map<string, { department: unknown; values: number[] }>();
    for (const tenure of tenures) {
      const department = departmentOf.get(tenure.userId);
      const key = department?.id ?? 'unassigned';
      const bucket = grouped.get(key) ?? { department: department ?? null, values: [] };
      bucket.values.push(tenure.seconds);
      grouped.set(key, bucket);
    }

    return [...grouped.values()]
      .map((entry) => {
        const stats = this.summarise(entry.values);
        return {
          department: entry.department,
          handledTasks: stats.count,
          averageSeconds: stats.averageSeconds,
          averageHold: humanizeDuration(stats.averageSeconds),
          medianHold: humanizeDuration(stats.medianSeconds),
          totalHold: humanizeDuration(stats.totalSeconds),
        };
      })
      .sort((a, b) => b.averageSeconds - a.averageSeconds);
  }

  /** Per workflow stage, with SLA breach counts where an SLA is configured. */
  async bottlenecksByStage(filters: AnalyticsFilters = {}) {
    const tenures = (await this.loadTenures(filters)).filter((tenure) => tenure.stageId);
    const stageIds = [...new Set(tenures.map((tenure) => tenure.stageId as string))];
    if (stageIds.length === 0) return [];

    const stages = await this.prisma.workflowStage.findMany({
      where: { id: { in: stageIds } },
      select: {
        id: true,
        name: true,
        order: true,
        type: true,
        slaHours: true,
        workflow: { select: { id: true, name: true, code: true } },
      },
    });
    const stageMap = new Map(stages.map((stage) => [stage.id, stage]));

    const grouped = new Map<string, number[]>();
    for (const tenure of tenures) {
      const bucket = grouped.get(tenure.stageId as string) ?? [];
      bucket.push(tenure.seconds);
      grouped.set(tenure.stageId as string, bucket);
    }

    return [...grouped.entries()]
      .map(([stageId, values]) => {
        const stage = stageMap.get(stageId);
        const stats = this.summarise(values);
        const slaSeconds = stage?.slaHours ? stage.slaHours * 3600 : null;
        const breaches = slaSeconds ? values.filter((value) => value > slaSeconds).length : 0;
        return {
          stage: stage
            ? {
                id: stage.id,
                name: stage.name,
                order: stage.order,
                type: stage.type,
                slaHours: stage.slaHours,
                workflow: stage.workflow,
              }
            : null,
          passes: stats.count,
          averageSeconds: stats.averageSeconds,
          averageHold: humanizeDuration(stats.averageSeconds),
          medianHold: humanizeDuration(stats.medianSeconds),
          longestHold: humanizeDuration(stats.maxSeconds),
          slaBreaches: breaches,
          slaBreachRate: stats.count > 0 ? Math.round((breaches / stats.count) * 100) : 0,
        };
      })
      .sort((a, b) => b.averageSeconds - a.averageSeconds);
  }

  /** How long open work has been sitting, bucketed - the aging report. */
  async taskAging(filters: AnalyticsFilters = {}) {
    const tasks = await this.prisma.task.findMany({
      where: { ...this.taskScope(filters), status: { in: OPEN_STATUSES } },
      select: {
        id: true,
        number: true,
        title: true,
        createdAt: true,
        ownerSince: true,
        priority: true,
        status: true,
        currentOwner: { select: USER_SUMMARY_SELECT },
        department: { select: { id: true, name: true, color: true } },
      },
      take: 5000,
    });

    const now = new Date();
    const buckets = [
      { label: '0-2 days', min: 0, max: 2, count: 0 },
      { label: '3-7 days', min: 3, max: 7, count: 0 },
      { label: '8-14 days', min: 8, max: 14, count: 0 },
      { label: '15-30 days', min: 15, max: 30, count: 0 },
      { label: '30+ days', min: 31, max: Number.MAX_SAFE_INTEGER, count: 0 },
    ];

    const aged = tasks.map((task) => {
      const ageDays = Math.floor(
        (now.getTime() - task.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      const bucket = buckets.find((entry) => ageDays >= entry.min && ageDays <= entry.max);
      if (bucket) bucket.count += 1;
      return {
        ...task,
        ageDays,
        heldFor: task.ownerSince ? humanizeDuration(durationSeconds(task.ownerSince, now)) : null,
      };
    });

    return {
      buckets,
      oldest: aged.sort((a, b) => b.ageDays - a.ageDays).slice(0, 20),
      total: tasks.length,
    };
  }

  /** End-to-end throughput per workflow. */
  async workflowPerformance(filters: AnalyticsFilters = {}) {
    const workflows = await this.prisma.taskWorkflow.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true },
    });

    return Promise.all(
      workflows.map(async (workflow) => {
        const scope = { ...this.taskScope(filters), workflowId: workflow.id };
        const [completed, active, durations] = await Promise.all([
          this.prisma.task.count({ where: { ...scope, status: 'COMPLETED' } }),
          this.prisma.task.count({ where: { ...scope, status: { in: OPEN_STATUSES } } }),
          this.prisma.task.findMany({
            where: { ...scope, status: 'COMPLETED', completedAt: { not: null } },
            select: { createdAt: true, completedAt: true },
            take: 500,
          }),
        ]);

        const seconds = durations.map((row) =>
          Math.floor(((row.completedAt as Date).getTime() - row.createdAt.getTime()) / 1000),
        );
        const stats = this.summarise(seconds);
        const handovers = await this.prisma.taskAssignment.count({ where: { task: scope } });

        return {
          workflow,
          completed,
          active,
          averageCycleSeconds: stats.averageSeconds,
          averageCycle: humanizeDuration(stats.averageSeconds),
          medianCycle: humanizeDuration(stats.medianSeconds),
          averageHandovers:
            completed > 0 ? Math.round((handovers / Math.max(completed + active, 1)) * 10) / 10 : 0,
        };
      }),
    );
  }

  /**
   * One task, broken down stage by stage - the view behind
   * "GESI Advisor: 5 days" on the task detail page.
   */
  async taskBreakdown(taskId: string) {
    const tenures = await this.prisma.taskAssignment.findMany({
      where: { taskId },
      orderBy: { sequence: 'asc' },
      include: {
        user: { select: USER_SUMMARY_SELECT },
        stage: { select: { id: true, name: true, slaHours: true } },
      },
    });

    const now = new Date();
    const rows = tenures.map((tenure) => {
      const seconds = tenure.durationSeconds ?? durationSeconds(tenure.enteredAt, now);
      return {
        sequence: tenure.sequence,
        user: tenure.user,
        stage: tenure.stage,
        seconds,
        duration: humanizeDuration(seconds),
        isCurrent: tenure.exitedAt === null,
      };
    });

    const total = rows.reduce((sum, row) => sum + row.seconds, 0);
    const slowest = [...rows].sort((a, b) => b.seconds - a.seconds)[0] ?? null;

    return {
      rows: rows.map((row) => ({
        ...row,
        share: total > 0 ? Math.round((row.seconds / total) * 100) : 0,
      })),
      totalSeconds: total,
      total: humanizeDuration(total),
      slowest: slowest
        ? {
            user: slowest.user,
            stage: slowest.stage,
            duration: slowest.duration,
            share: total > 0 ? Math.round((slowest.seconds / total) * 100) : 0,
          }
        : null,
    };
  }

  /** Everything the analytics page needs, in one call. */
  async overview(filters: AnalyticsFilters = {}) {
    const [people, departments, stages, aging, workflows] = await Promise.all([
      this.bottlenecksByPerson(filters),
      this.bottlenecksByDepartment(filters),
      this.bottlenecksByStage(filters),
      this.taskAging(filters),
      this.workflowPerformance(filters),
    ]);
    return { people, departments, stages, aging, workflows };
  }
}
