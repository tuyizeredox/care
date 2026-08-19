import { Injectable } from '@nestjs/common';
import { AssignmentRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { durationSeconds, humanizeDuration } from '../../common/utils/date.util';
import { USER_SUMMARY_SELECT } from '../users/user.select';

export interface OpenTenureInput {
  taskId: string;
  userId: string;
  assignedById?: string | null;
  stageId?: string | null;
  role?: AssignmentRole;
  note?: string | null;
  at?: Date;
}

/**
 * Roles that represent *possession* of the task. Only one person holds a task
 * at a time, whether they are working on it, reviewing it or approving it, so
 * opening any of these closes whichever one was open before. COLLABORATOR is
 * excluded: it describes someone helping alongside the holder, not instead of
 * them.
 */
const POSSESSION_ROLES: AssignmentRole[] = [
  AssignmentRole.OWNER,
  AssignmentRole.REVIEWER,
  AssignmentRole.APPROVER,
];

/**
 * The ownership ledger.
 *
 * One row per (task, holder) tenure with `enteredAt` / `exitedAt` /
 * `durationSeconds`. Closing a tenure materialises its duration, so every
 * bottleneck query is a plain aggregate instead of a date subtraction over the
 * whole history table. Exactly one possession row per task is ever open.
 */
@Injectable()
export class TaskAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Closes the open possession tenure, if any, and returns its duration.
   *
   * This must not filter on OWNER alone: a handover for review or approval
   * opens a REVIEWER/APPROVER tenure, and if the outgoing row stayed open the
   * task would appear to be in two places at once — breaking the journey, the
   * per-holder timings and the "send it back" lookup.
   */
  async closeOpenTenure(
    taskId: string,
    at: Date = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<number | null> {
    const client = tx ?? this.prisma;
    const open = await client.taskAssignment.findFirst({
      where: { taskId, exitedAt: null, role: { in: POSSESSION_ROLES } },
      orderBy: { enteredAt: 'desc' },
    });
    if (!open) return null;

    const seconds = durationSeconds(open.enteredAt, at);
    await client.taskAssignment.update({
      where: { id: open.id },
      data: { exitedAt: at, durationSeconds: seconds },
    });
    return seconds;
  }

  /** Closes the current tenure and opens a new one for `userId`. */
  async openTenure(input: OpenTenureInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const at = input.at ?? new Date();
    const role = input.role ?? AssignmentRole.OWNER;

    if (POSSESSION_ROLES.includes(role)) {
      await this.closeOpenTenure(input.taskId, at, tx);
    }

    const last = await client.taskAssignment.findFirst({
      where: { taskId: input.taskId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    return client.taskAssignment.create({
      data: {
        taskId: input.taskId,
        userId: input.userId,
        assignedById: input.assignedById ?? null,
        stageId: input.stageId ?? null,
        role,
        note: input.note ?? null,
        enteredAt: at,
        sequence: (last?.sequence ?? 0) + 1,
      },
    });
  }

  /** Full ownership chain for a task, oldest first. */
  async getTenures(taskId: string) {
    return this.prisma.taskAssignment.findMany({
      where: { taskId },
      orderBy: { sequence: 'asc' },
      include: {
        user: { select: USER_SUMMARY_SELECT },
        assignedBy: { select: USER_SUMMARY_SELECT },
        stage: { select: { id: true, name: true, order: true, type: true, slaHours: true } },
      },
    });
  }

  /**
   * The most recent closed tenure, which is where a task goes when a reviewer
   * sends it back for changes.
   */
  async getPreviousHolder(taskId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.taskAssignment.findFirst({
      where: { taskId, exitedAt: { not: null }, role: { in: POSSESSION_ROLES } },
      orderBy: { sequence: 'desc' },
      select: { userId: true, stageId: true, role: true },
    });
  }

  /**
   * How long the task has spent with each person, including the time the
   * current holder has been sitting on it.
   */
  async getTimePerHolder(taskId: string, now: Date = new Date()) {
    const tenures = await this.getTenures(taskId);
    const byUser = new Map<
      string,
      {
        user: (typeof tenures)[number]['user'];
        seconds: number;
        visits: number;
        isCurrent: boolean;
      }
    >();

    for (const tenure of tenures) {
      const seconds =
        tenure.durationSeconds ?? (tenure.exitedAt ? 0 : durationSeconds(tenure.enteredAt, now));
      const existing = byUser.get(tenure.userId);
      if (existing) {
        existing.seconds += seconds;
        existing.visits += 1;
        existing.isCurrent = existing.isCurrent || tenure.exitedAt === null;
      } else {
        byUser.set(tenure.userId, {
          user: tenure.user,
          seconds,
          visits: 1,
          isCurrent: tenure.exitedAt === null,
        });
      }
    }

    const rows = [...byUser.entries()].map(([userId, value]) => ({
      userId,
      user: value.user,
      department: value.user.department,
      seconds: value.seconds,
      hours: Math.round((value.seconds / 3600) * 10) / 10,
      duration: humanizeDuration(value.seconds),
      visits: value.visits,
      isCurrent: value.isCurrent,
    }));

    const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0);
    const slowest = [...rows].sort((a, b) => b.seconds - a.seconds)[0] ?? null;

    return {
      holders: rows.sort((a, b) => b.seconds - a.seconds),
      totalSeconds,
      totalDuration: humanizeDuration(totalSeconds),
      /**
       * Presented as workflow analysis, never as individual blame: this is the
       * stage where the task waited longest, which is usually a capacity or
       * process signal rather than a personal one.
       */
      slowestStage: slowest
        ? {
            user: slowest.user,
            duration: slowest.duration,
            share: totalSeconds > 0 ? Math.round((slowest.seconds / totalSeconds) * 100) : 0,
          }
        : null,
    };
  }
}
