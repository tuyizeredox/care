import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { USER_SUMMARY_SELECT } from '../users/user.select';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';

const OPEN_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.CHANGES_REQUESTED,
  TaskStatus.APPROVED,
  TaskStatus.BLOCKED,
];

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(includeStats = false) {
    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        head: { select: USER_SUMMARY_SELECT },
        unit: { select: { id: true, name: true, type: true } },
        _count: {
          select: {
            members: { where: { deletedAt: null } },
            positions: { where: { deletedAt: null } },
            projects: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!includeStats) return departments;

    const stats = await this.performance();
    const byId = new Map(stats.map((row) => [row.departmentId, row]));
    return departments.map((department) => ({
      ...department,
      stats: byId.get(department.id) ?? null,
    }));
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, deletedAt: null },
      include: {
        head: { select: USER_SUMMARY_SELECT },
        unit: { select: { id: true, name: true, type: true } },
        members: {
          where: { deletedAt: null },
          orderBy: [{ position: { level: 'desc' } }, { firstName: 'asc' }],
          select: USER_SUMMARY_SELECT,
        },
        positions: {
          where: { deletedAt: null },
          orderBy: { level: 'desc' },
          select: { id: true, title: true, code: true, level: true, reportsToId: true },
        },
        projects: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, status: true, color: true },
        },
      },
    });
    if (!department) throw new NotFoundException('This department could not be found.');

    const stats = (await this.performance(id))[0] ?? null;
    return { ...department, stats };
  }

  /**
   * Per-department delivery metrics. One grouped query per metric keeps this
   * O(departments) rather than O(tasks).
   */
  async performance(departmentId?: string) {
    const now = new Date();
    const scope: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...(departmentId ? { departmentId } : {}),
    };

    const [departments, totals, active, completed, overdue, blocked, awaitingReview, durations] =
      await Promise.all([
        this.prisma.department.findMany({
          where: { deletedAt: null, ...(departmentId ? { id: departmentId } : {}) },
          select: { id: true, name: true, code: true, color: true },
          orderBy: { sortOrder: 'asc' },
        }),
        this.prisma.task.groupBy({ by: ['departmentId'], orderBy: { departmentId: 'asc' }, where: scope, _count: true }),
        this.prisma.task.groupBy({
          by: ['departmentId'],
          orderBy: { departmentId: 'asc' },
          where: { ...scope, status: { in: OPEN_STATUSES } },
          _count: true,
        }),
        this.prisma.task.groupBy({
          by: ['departmentId'],
          orderBy: { departmentId: 'asc' },
          where: { ...scope, status: TaskStatus.COMPLETED },
          _count: true,
        }),
        this.prisma.task.groupBy({
          by: ['departmentId'],
          orderBy: { departmentId: 'asc' },
          where: { ...scope, status: { in: OPEN_STATUSES }, deadline: { lt: now } },
          _count: true,
        }),
        this.prisma.task.groupBy({
          by: ['departmentId'],
          orderBy: { departmentId: 'asc' },
          where: { ...scope, status: TaskStatus.BLOCKED },
          _count: true,
        }),
        this.prisma.task.groupBy({
          by: ['departmentId'],
          orderBy: { departmentId: 'asc' },
          where: { ...scope, status: { in: [TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW] } },
          _count: true,
        }),
        this.prisma.task.findMany({
          where: { ...scope, status: TaskStatus.COMPLETED, completedAt: { not: null } },
          select: { departmentId: true, createdAt: true, completedAt: true },
        }),
      ]);

    const count = (rows: Array<{ departmentId: string | null; _count: number }>, id: string) =>
      rows.find((row) => row.departmentId === id)?._count ?? 0;

    const cycleTimes = new Map<string, number[]>();
    for (const task of durations) {
      if (!task.departmentId || !task.completedAt) continue;
      const days = (task.completedAt.getTime() - task.createdAt.getTime()) / 86_400_000;
      const bucket = cycleTimes.get(task.departmentId) ?? [];
      bucket.push(days);
      cycleTimes.set(task.departmentId, bucket);
    }

    return departments.map((department) => {
      const total = count(totals, department.id);
      const done = count(completed, department.id);
      const times = cycleTimes.get(department.id) ?? [];
      const averageCompletionDays =
        times.length > 0
          ? Math.round((times.reduce((sum, value) => sum + value, 0) / times.length) * 10) / 10
          : null;
      return {
        departmentId: department.id,
        name: department.name,
        code: department.code,
        color: department.color,
        totalTasks: total,
        activeTasks: count(active, department.id),
        completedTasks: done,
        overdueTasks: count(overdue, department.id),
        blockedTasks: count(blocked, department.id),
        awaitingReview: count(awaitingReview, department.id),
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
        averageCompletionDays,
      };
    });
  }

  async create(dto: CreateDepartmentDto, actor: AuthenticatedUser) {
    const department = await this.prisma.department.create({ data: { ...dto } });
    await this.audit.record({
      actorId: actor.id,
      action: 'department.created',
      resourceType: 'Department',
      resourceId: department.id,
      summary: `Created department ${department.name}`,
      after: { ...dto } as unknown as Prisma.InputJsonValue,
    });
    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto, actor: AuthenticatedUser) {
    const before = await this.prisma.department.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('This department could not be found.');

    const department = await this.prisma.department.update({ where: { id }, data: { ...dto } });
    await this.audit.record({
      actorId: actor.id,
      action: 'department.updated',
      resourceType: 'Department',
      resourceId: id,
      summary: `Updated department ${department.name}`,
      departmentId: id,
      before: { ...before } as unknown as Prisma.InputJsonValue,
      after: { ...department } as unknown as Prisma.InputJsonValue,
    });
    return department;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const members = await this.prisma.user.count({ where: { departmentId: id, deletedAt: null } });
    if (members > 0) {
      throw new BadRequestException(
        `This department still has ${members} member(s). Move them before deleting it.`,
      );
    }
    await this.prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      actorId: actor.id,
      action: 'department.deleted',
      resourceType: 'Department',
      resourceId: id,
      summary: 'Deleted a department',
    });
    return { success: true };
  }
}
