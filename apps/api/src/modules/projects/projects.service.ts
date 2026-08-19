import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectMemberRole, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Paginated } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { USER_SUMMARY_SELECT } from '../users/user.select';
import { AddProjectMemberDto, CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from './dto';

const CLOSED_STATUSES: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(user: AuthenticatedUser, query: ProjectQueryDto): Promise<Paginated<unknown>> {
    const { page, pageSize } = query;
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(query.mine
        ? { OR: [{ managerId: user.id }, { members: { some: { userId: user.id } } }] }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const [total, projects] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy,
        include: {
          manager: { select: USER_SUMMARY_SELECT },
          department: { select: { id: true, name: true, code: true, color: true } },
          _count: { select: { tasks: { where: { deletedAt: null } }, members: true } },
        },
      }),
    ]);

    const withProgress = await Promise.all(
      projects.map(async (project) => ({
        ...project,
        stats: await this.getProgress(project.id),
      })),
    );

    return { data: withProgress, meta: buildMeta(page, pageSize, total) };
  }

  private buildOrderBy(
    sortBy: string | undefined,
    sortOrder: 'asc' | 'desc',
  ): Prisma.ProjectOrderByWithRelationInput {
    const allowed = ['name', 'code', 'status', 'startDate', 'endDate', 'createdAt', 'updatedAt'];
    const field = sortBy && allowed.includes(sortBy) ? sortBy : 'createdAt';
    return { [field]: sortOrder } as Prisma.ProjectOrderByWithRelationInput;
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { OR: [{ id }, { code: id.toUpperCase() }], deletedAt: null },
      include: {
        manager: { select: USER_SUMMARY_SELECT },
        department: { select: { id: true, name: true, code: true, color: true } },
        members: {
          include: { user: { select: USER_SUMMARY_SELECT } },
          orderBy: { role: 'asc' },
        },
        workflows: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, isActive: true },
        },
      },
    });
    if (!project) throw new NotFoundException('This project could not be found.');
    return { ...project, stats: await this.getProgress(project.id) };
  }

  /** Task counts and completion percentage for a project card or dashboard. */
  async getProgress(projectId: string) {
    const now = new Date();
    const [grouped, overdue, completedTasks] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        where: { projectId, deletedAt: null, parentTaskId: null },
        _count: true,
      }),
      this.prisma.task.count({
        where: {
          projectId,
          deletedAt: null,
          deadline: { lt: now },
          status: { notIn: CLOSED_STATUSES },
        },
      }),
      this.prisma.task.findMany({
        where: { projectId, deletedAt: null, status: TaskStatus.COMPLETED, completedAt: { not: null } },
        select: { createdAt: true, completedAt: true },
        take: 500,
      }),
    ]);

    const byStatus = Object.fromEntries(grouped.map((row) => [row.status, row._count]));
    const total = grouped.reduce((sum, row) => sum + row._count, 0);
    const completed = byStatus[TaskStatus.COMPLETED] ?? 0;
    const cancelled = byStatus[TaskStatus.CANCELLED] ?? 0;
    const active = total - completed - cancelled;

    const durations = completedTasks
      .filter((task) => task.completedAt)
      .map((task) => (task.completedAt as Date).getTime() - task.createdAt.getTime());
    const averageCompletionHours =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 3_600_000)
        : null;

    return {
      total,
      active,
      completed,
      cancelled,
      overdue,
      blocked: byStatus[TaskStatus.BLOCKED] ?? 0,
      awaitingReview: (byStatus[TaskStatus.SUBMITTED] ?? 0) + (byStatus[TaskStatus.UNDER_REVIEW] ?? 0),
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      averageCompletionHours,
      byStatus,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateProjectDto) {
    this.assertDateOrder(dto.startDate, dto.endDate);

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: dto.name,
          code: dto.code.toUpperCase(),
          description: dto.description ?? null,
          status: dto.status ?? 'ACTIVE',
          color: dto.color ?? '#6366F1',
          managerId: dto.managerId ?? null,
          departmentId: dto.departmentId ?? null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        },
      });
      if (dto.managerId) {
        await tx.projectMember.create({
          data: { projectId: created.id, userId: dto.managerId, role: ProjectMemberRole.MANAGER },
        });
      }
      return created;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'project.created',
      resourceType: 'Project',
      resourceId: project.id,
      summary: 'Created project ' + project.name,
      departmentId: project.departmentId,
      after: { name: project.name, code: project.code },
    });
    return this.findOne(project.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This project could not be found.');

    this.assertDateOrder(
      dto.startDate ?? existing.startDate?.toISOString(),
      dto.endDate ?? existing.endDate?.toISOString(),
    );

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId || null } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : null } : {}),
      },
    });

    if (dto.managerId && dto.managerId !== existing.managerId) {
      await this.prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: id, userId: dto.managerId } },
        create: { projectId: id, userId: dto.managerId, role: ProjectMemberRole.MANAGER },
        update: { role: ProjectMemberRole.MANAGER },
      });
    }

    await this.audit.record({
      actorId: user.id,
      action: 'project.updated',
      resourceType: 'Project',
      resourceId: id,
      summary: 'Updated project ' + updated.name,
      departmentId: updated.departmentId,
      before: { name: existing.name, status: existing.status },
      after: { name: updated.name, status: updated.status },
    });
    return this.findOne(id);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw new NotFoundException('This project could not be found.');

    const openTasks = await this.prisma.task.count({
      where: { projectId: id, deletedAt: null, status: { notIn: CLOSED_STATUSES } },
    });
    if (openTasks > 0) {
      throw new BadRequestException(
        'This project still has ' + openTasks + ' open task(s). Close or move them first.',
      );
    }

    await this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      actorId: user.id,
      action: 'project.archived',
      resourceType: 'Project',
      resourceId: id,
      summary: 'Archived project ' + project.name,
      departmentId: project.departmentId,
    });
    return { success: true };
  }

  async addMember(user: AuthenticatedUser, projectId: string, dto: AddProjectMemberDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('This project could not be found.');

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      create: { projectId, userId: dto.userId, role: dto.role ?? ProjectMemberRole.MEMBER },
      update: { role: dto.role ?? ProjectMemberRole.MEMBER },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'project.member_added',
      resourceType: 'Project',
      resourceId: projectId,
      summary: 'Added a member to ' + project.name,
      after: { userId: dto.userId, role: dto.role ?? ProjectMemberRole.MEMBER },
    });
    return this.findOne(projectId);
  }

  async removeMember(user: AuthenticatedUser, projectId: string, userId: string) {
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    await this.audit.record({
      actorId: user.id,
      action: 'project.member_removed',
      resourceType: 'Project',
      resourceId: projectId,
      summary: 'Removed a member from the project',
      before: { userId },
    });
    return this.findOne(projectId);
  }

  private assertDateOrder(start?: string | null, end?: string | null): void {
    if (start && end && new Date(start) > new Date(end)) {
      throw new BadRequestException('The end date must fall after the start date.');
    }
  }
}
