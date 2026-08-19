import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { addDays, endOfDay, humanizeDuration } from '../../common/utils/date.util';
import { TaskHistoryService } from '../tasks/task-history.service';
import { TASK_SUMMARY_SELECT } from '../tasks/task.select';
import { OPEN_STATUSES } from '../tasks/task-status.machine';
import { USER_SUMMARY_SELECT } from '../users/user.select';

export interface StatusTotals {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  overdue: number;
  blocked: number;
  awaitingReview: number;
  awaitingApproval: number;
  dueToday: number;
  dueThisWeek: number;
  completionRate: number;
  overduePercentage: number;
}

/**
 * Read-only aggregation layer behind every dashboard.
 *
 * Each method returns a shape tailored to one audience (individual, manager,
 * executive) so the client never has to stitch several calls together.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly history: TaskHistoryService,
  ) {}

  /** Core counters for any task scope. One grouped query plus three counts. */
  async statusTotals(scope: Prisma.TaskWhereInput): Promise<StatusTotals> {
    const now = new Date();
    const base: Prisma.TaskWhereInput = { deletedAt: null, ...scope };

    const [grouped, overdue, dueToday, dueThisWeek] = await Promise.all([
      this.prisma.task.groupBy({ by: ['status'], orderBy: { status: 'asc' }, where: base, _count: true }),
      this.prisma.task.count({
        where: { ...base, deadline: { lt: now }, status: { in: OPEN_STATUSES } },
      }),
      this.prisma.task.count({
        where: {
          ...base,
          deadline: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lte: endOfDay(now),
          },
          status: { in: OPEN_STATUSES },
        },
      }),
      this.prisma.task.count({
        where: {
          ...base,
          deadline: { gte: now, lte: endOfDay(addDays(now, 7)) },
          status: { in: OPEN_STATUSES },
        },
      }),
    ]);

    const byStatus = Object.fromEntries(grouped.map((row) => [row.status, row._count])) as
      Record<TaskStatus, number | undefined>;
    const total = grouped.reduce((sum, row) => sum + row._count, 0);
    const completed = byStatus.COMPLETED ?? 0;
    const cancelled = byStatus.CANCELLED ?? 0;
    const closed = completed + cancelled;

    return {
      total,
      active: total - closed,
      completed,
      cancelled,
      overdue,
      blocked: byStatus.BLOCKED ?? 0,
      awaitingReview: (byStatus.SUBMITTED ?? 0) + (byStatus.UNDER_REVIEW ?? 0),
      awaitingApproval: byStatus.APPROVED ?? 0,
      dueToday,
      dueThisWeek,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      overduePercentage: total - closed > 0 ? Math.round((overdue / (total - closed)) * 100) : 0,
    };
  }

  /** Average hours from creation to completion for a scope. */
  async averageCompletionHours(scope: Prisma.TaskWhereInput): Promise<number | null> {
    const rows = await this.prisma.task.findMany({
      where: { ...scope, deletedAt: null, status: TaskStatus.COMPLETED, completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
      take: 1000,
      orderBy: { completedAt: 'desc' },
    });
    if (rows.length === 0) return null;
    const totalMs = rows.reduce(
      (sum, row) => sum + ((row.completedAt as Date).getTime() - row.createdAt.getTime()),
      0,
    );
    return Math.round((totalMs / rows.length / 3_600_000) * 10) / 10;
  }

  // -------------------------------------------------------------------------
  // Individual dashboard - "what do I need to do?"
  // -------------------------------------------------------------------------

  async myDashboard(user: AuthenticatedUser) {
    const mine: Prisma.TaskWhereInput = { currentOwnerId: user.id };
    const now = new Date();

    const [totals, averageHours, buckets, waitingOnOthers, pendingApprovals, recent] =
      await Promise.all([
        this.statusTotals(mine),
        this.averageCompletionHours(mine),
        this.myBuckets(user.id, now),
        this.prisma.task.findMany({
          where: {
            deletedAt: null,
            createdById: user.id,
            currentOwnerId: { not: user.id },
            status: { in: OPEN_STATUSES },
          },
          select: TASK_SUMMARY_SELECT,
          orderBy: { waitingSince: 'asc' },
          take: 15,
        }),
        this.prisma.approval.count({
          where: { approverId: user.id, status: 'PENDING', task: { deletedAt: null } },
        }),
        this.history.recentActivity({ OR: [{ currentOwnerId: user.id }, { createdById: user.id }] }, 12),
      ]);

    const completedThisMonth = await this.prisma.task.count({
      where: {
        deletedAt: null,
        status: TaskStatus.COMPLETED,
        completedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        assignments: { some: { userId: user.id } },
      },
    });

    return {
      totals,
      performance: {
        tasksCompleted: totals.completed,
        completedThisMonth,
        completionRate: totals.completionRate,
        overdueTasks: totals.overdue,
        averageCompletionHours: averageHours,
        averageCompletion: averageHours === null ? null : humanizeDuration(averageHours * 3600),
      },
      buckets,
      pendingApprovals,
      waitingOnOthers,
      recentActivity: recent,
    };
  }

  /** The task lists a person opens their day with. */
  private async myBuckets(userId: string, now: Date) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const owned: Prisma.TaskWhereInput = { deletedAt: null, currentOwnerId: userId };

    const query = (where: Prisma.TaskWhereInput, take = 10) =>
      this.prisma.task.findMany({
        where,
        select: TASK_SUMMARY_SELECT,
        orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
        take,
      });

    const [assigned, inProgress, dueToday, dueSoon, overdue, submitted, changesRequested] =
      await Promise.all([
        query({ ...owned, status: TaskStatus.ASSIGNED }),
        query({ ...owned, status: TaskStatus.IN_PROGRESS }),
        query({
          ...owned,
          status: { in: OPEN_STATUSES },
          deadline: { gte: startOfToday, lte: endOfDay(now) },
        }),
        query({
          ...owned,
          status: { in: OPEN_STATUSES },
          deadline: { gt: endOfDay(now), lte: endOfDay(addDays(now, 7)) },
        }),
        query({ ...owned, status: { in: OPEN_STATUSES }, deadline: { lt: startOfToday } }),
        query({
          deletedAt: null,
          status: { in: [TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW] },
          assignments: { some: { userId } },
        }),
        query({ ...owned, status: TaskStatus.CHANGES_REQUESTED }),
      ]);

    const awaitingMyReview = await query({
      deletedAt: null,
      currentOwnerId: userId,
      status: { in: [TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW] },
    });

    return {
      assigned,
      inProgress,
      dueToday,
      dueSoon,
      overdue,
      submitted,
      changesRequested,
      awaitingMyReview,
    };
  }

  // -------------------------------------------------------------------------
  // Manager dashboard - "what is my team doing?"
  // -------------------------------------------------------------------------

  async teamDashboard(user: AuthenticatedUser) {
    const teamIds = await this.accessControl.getSubordinateIds(user.id, false);
    const scope: Prisma.TaskWhereInput =
      teamIds.length > 0
        ? { currentOwnerId: { in: [...teamIds, user.id] } }
        : { currentOwnerId: user.id };

    const [totals, averageHours, workload, awaitingReview, overdue, bottlenecks, recent] =
      await Promise.all([
        this.statusTotals(scope),
        this.averageCompletionHours(scope),
        this.employeeWorkload([...teamIds, user.id]),
        this.prisma.task.findMany({
          where: {
            deletedAt: null,
            ...scope,
            status: { in: [TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW] },
          },
          select: TASK_SUMMARY_SELECT,
          orderBy: { submittedAt: 'asc' },
          take: 15,
        }),
        this.prisma.task.findMany({
          where: {
            deletedAt: null,
            ...scope,
            status: { in: OPEN_STATUSES },
            deadline: { lt: new Date() },
          },
          select: TASK_SUMMARY_SELECT,
          orderBy: { deadline: 'asc' },
          take: 20,
        }),
        this.waitingLongest(scope, 10),
        this.history.recentActivity(scope, 15),
      ]);

    return {
      teamSize: teamIds.length,
      totals,
      averageCompletionHours: averageHours,
      workload,
      awaitingReview,
      overdue,
      bottlenecks,
      recentActivity: recent,
    };
  }

  /** Open task counts per employee, so overload is visible at a glance. */
  async employeeWorkload(userIds: string[]) {
    if (userIds.length === 0) return [];
    const now = new Date();

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: {
        ...USER_SUMMARY_SELECT,
        _count: {
          select: {
            ownedTasks: { where: { deletedAt: null, status: { in: OPEN_STATUSES } } },
          },
        },
      },
    });

    const [overdueRows, reviewRows] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['currentOwnerId'],
        orderBy: { currentOwnerId: 'asc' },
        where: {
          deletedAt: null,
          currentOwnerId: { in: userIds },
          status: { in: OPEN_STATUSES },
          deadline: { lt: now },
        },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['currentOwnerId'],
        orderBy: { currentOwnerId: 'asc' },
        where: {
          deletedAt: null,
          currentOwnerId: { in: userIds },
          status: { in: [TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW] },
        },
        _count: true,
      }),
    ]);

    const overdueByUser = new Map(overdueRows.map((row) => [row.currentOwnerId, row._count]));
    const reviewByUser = new Map(reviewRows.map((row) => [row.currentOwnerId, row._count]));

    return users
      .map((member) => ({
        user: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          avatarUrl: member.avatarUrl,
          position: member.position,
          department: member.department,
        },
        activeTasks: member._count.ownedTasks,
        overdueTasks: overdueByUser.get(member.id) ?? 0,
        awaitingReview: reviewByUser.get(member.id) ?? 0,
      }))
      .sort((a, b) => b.activeTasks - a.activeTasks);
  }

  /** Tasks that have sat with their current holder the longest. */
  async waitingLongest(scope: Prisma.TaskWhereInput, take = 10) {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        ...scope,
        status: { in: OPEN_STATUSES },
        ownerSince: { not: null },
      },
      select: TASK_SUMMARY_SELECT,
      orderBy: { ownerSince: 'asc' },
      take,
    });

    return tasks.map((task) => {
      const seconds = task.ownerSince
        ? Math.floor((Date.now() - task.ownerSince.getTime()) / 1000)
        : 0;
      return {
        ...task,
        heldForSeconds: seconds,
        heldFor: humanizeDuration(seconds),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Organisation / executive dashboard
  // -------------------------------------------------------------------------

  async organizationDashboard(user: AuthenticatedUser) {
    const scope = await this.accessControl.buildTaskVisibilityFilter(user);

    const [totals, averageHours, departments, projects, priority, recent, waitingFor] =
      await Promise.all([
        this.statusTotals(scope),
        this.averageCompletionHours(scope),
        this.departmentPerformance(),
        this.projectPerformance(),
        this.highPriorityWork(scope),
        this.history.recentActivity(scope, 20),
        this.waitingForSummary(scope),
      ]);

    const trend = await this.completionTrend(scope, 8);

    return {
      totals,
      averageCompletionHours: averageHours,
      averageCompletion: averageHours === null ? null : humanizeDuration(averageHours * 3600),
      departments,
      projects,
      highPriority: priority,
      waitingFor,
      completionTrend: trend,
      recentActivity: recent,
    };
  }

  /** Per-department counters used by the comparison charts. */
  async departmentPerformance() {
    const now = new Date();
    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true, color: true },
      orderBy: { sortOrder: 'asc' },
    });

    return Promise.all(
      departments.map(async (department) => {
        const scope: Prisma.TaskWhereInput = { departmentId: department.id };
        const [totals, averageHours] = await Promise.all([
          this.statusTotals(scope),
          this.averageCompletionHours(scope),
        ]);
        void now;
        return {
          department,
          ...totals,
          averageCompletionHours: averageHours,
          averageCompletion:
            averageHours === null ? null : humanizeDuration(averageHours * 3600),
        };
      }),
    );
  }

  async projectPerformance() {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, status: { in: ['ACTIVE', 'PLANNING'] } },
      select: { id: true, name: true, code: true, color: true },
      orderBy: { name: 'asc' },
      take: 12,
    });

    return Promise.all(
      projects.map(async (project) => ({
        project,
        ...(await this.statusTotals({ projectId: project.id })),
      })),
    );
  }

  private async highPriorityWork(scope: Prisma.TaskWhereInput) {
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        ...scope,
        priority: { in: ['HIGH', 'CRITICAL'] },
        status: { in: OPEN_STATUSES },
      },
      select: TASK_SUMMARY_SELECT,
      orderBy: [{ priority: 'desc' }, { deadline: { sort: 'asc', nulls: 'last' } }],
      take: 15,
    });
  }

  /** "Waiting for" roll-up: who and what the organisation is blocked on. */
  async waitingForSummary(scope: Prisma.TaskWhereInput) {
    const [byReason, byPerson] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['waitingReason'],
        orderBy: { waitingReason: 'asc' },
        where: { deletedAt: null, ...scope, status: { in: OPEN_STATUSES } },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['waitingForUserId'],
        where: {
          deletedAt: null,
          ...scope,
          status: { in: OPEN_STATUSES },
          waitingForUserId: { not: null },
        },
        _count: true,
        orderBy: { _count: { waitingForUserId: 'desc' } },
        take: 10,
      }),
    ]);

    const userIds = byPerson
      .map((row) => row.waitingForUserId)
      .filter((id): id is string => Boolean(id));
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: USER_SUMMARY_SELECT,
    });
    const userMap = new Map(users.map((entry) => [entry.id, entry]));

    return {
      byReason: byReason.map((row) => ({ reason: row.waitingReason, count: row._count })),
      byPerson: byPerson.map((row) => ({
        user: row.waitingForUserId ? (userMap.get(row.waitingForUserId) ?? null) : null,
        count: row._count,
      })),
    };
  }

  /** Created vs completed per week - the headline organisation trend chart. */
  async completionTrend(scope: Prisma.TaskWhereInput, weeks = 8) {
    const now = new Date();
    const buckets: Array<{ label: string; from: Date; to: Date }> = [];

    for (let index = weeks - 1; index >= 0; index -= 1) {
      const to = endOfDay(addDays(now, -7 * index));
      const from = addDays(to, -6);
      from.setHours(0, 0, 0, 0);
      buckets.push({
        label: from.toISOString().slice(0, 10),
        from,
        to,
      });
    }

    return Promise.all(
      buckets.map(async (bucket) => {
        const [created, completed] = await this.prisma.$transaction([
          this.prisma.task.count({
            where: { deletedAt: null, ...scope, createdAt: { gte: bucket.from, lte: bucket.to } },
          }),
          this.prisma.task.count({
            where: {
              deletedAt: null,
              ...scope,
              status: TaskStatus.COMPLETED,
              completedAt: { gte: bucket.from, lte: bucket.to },
            },
          }),
        ]);
        return { week: bucket.label, created, completed };
      }),
    );
  }

  /** Drill-down: organisation -> department -> employee -> task. */
  async departmentDrilldown(departmentId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
      select: {
        id: true,
        name: true,
        code: true,
        color: true,
        head: { select: USER_SUMMARY_SELECT },
        members: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!department) return null;

    const memberIds = department.members.map((member) => member.id);
    const scope: Prisma.TaskWhereInput = { departmentId };

    const [totals, workload, bottlenecks, averageHours] = await Promise.all([
      this.statusTotals(scope),
      this.employeeWorkload(memberIds),
      this.waitingLongest(scope, 10),
      this.averageCompletionHours(scope),
    ]);

    return {
      department: {
        id: department.id,
        name: department.name,
        code: department.code,
        color: department.color,
        head: department.head,
      },
      totals,
      averageCompletionHours: averageHours,
      workload,
      bottlenecks,
    };
  }
}
