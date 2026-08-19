import { Injectable } from '@nestjs/common';
import { HistoryAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { USER_SUMMARY_SELECT } from '../users/user.select';

export interface HistoryEntry {
  taskId: string;
  actorId?: string | null;
  action: HistoryAction;
  summary: string;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  comment?: string | null;
}

/**
 * Append-only task event log.
 *
 * Every write takes an optional transaction client so the history row commits
 * atomically with the change it describes: a task can never move without its
 * event, and an event can never exist for a change that rolled back. There is
 * deliberately no update or delete method on this service.
 */
@Injectable()
export class TaskHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: HistoryEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.taskHistory.create({
      data: {
        taskId: entry.taskId,
        actorId: entry.actorId ?? null,
        action: entry.action,
        summary: entry.summary,
        fromValue: entry.fromValue ?? null,
        toValue: entry.toValue ?? null,
        metadata: entry.metadata ?? Prisma.DbNull,
        comment: entry.comment ?? null,
      },
    });
  }

  async recordMany(entries: HistoryEntry[], tx?: Prisma.TransactionClient): Promise<void> {
    for (const entry of entries) await this.record(entry, tx);
  }

  async findForTask(
    taskId: string,
    page = 1,
    pageSize = 100,
    action?: HistoryAction,
  ): Promise<Paginated<unknown>> {
    const where: Prisma.TaskHistoryWhereInput = { taskId, ...(action ? { action } : {}) };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.taskHistory.count({ where }),
      this.prisma.taskHistory.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: USER_SUMMARY_SELECT } },
      }),
    ]);
    return { data, meta: buildMeta(page, pageSize, total) };
  }

  /** Latest activity across tasks the caller may see - powers dashboards. */
  async recentActivity(taskFilter: Prisma.TaskWhereInput, take = 20) {
    return this.prisma.taskHistory.findMany({
      where: { task: { ...taskFilter, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actor: { select: USER_SUMMARY_SELECT },
        task: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            priority: true,
            department: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
  }
}
