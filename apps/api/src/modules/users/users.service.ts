import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Paginated } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { USER_PROFILE_SELECT, USER_SUMMARY_SELECT } from './user.select';
import {
  CreateUserDto,
  SetUserPermissionsDto,
  UpdateProfileDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto';

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
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly accessControl: AccessControlService,
  ) {}

  async findAll(query: UserQueryDto, actor: AuthenticatedUser): Promise<Paginated<unknown>> {
    const { page, pageSize, search, sortBy, sortOrder } = query;
    const visibility = await this.accessControl.buildUserVisibilityFilter(actor);

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...visibility,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.positionId ? { positionId: query.positionId } : {}),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { projectMemberships: { some: { projectId: query.projectId } } } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { jobTitle: { contains: search, mode: 'insensitive' } },
              { position: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = sortBy
      ? ({ [sortBy]: sortOrder } as Prisma.UserOrderByWithRelationInput)
      : { firstName: 'asc' };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy,
        select: {
          ...USER_PROFILE_SELECT,
          _count: { select: { reports: { where: { deletedAt: null } } } },
        },
      }),
    ]);

    if (!query.withWorkload) {
      return { data: users, meta: buildMeta(page, pageSize, total) };
    }

    const workload = await this.workloadFor(users.map((user) => user.id));
    return {
      data: users.map((user) => ({ ...user, workload: workload[user.id] })),
      meta: buildMeta(page, pageSize, total),
    };
  }

  /** Lightweight list used by assignee pickers and @mention autocomplete. */
  async directory(search?: string, departmentId?: string) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(departmentId ? { departmentId } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { position: { title: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
      select: USER_SUMMARY_SELECT,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...USER_PROFILE_SELECT,
        reports: { where: { deletedAt: null }, select: USER_SUMMARY_SELECT },
        projectMemberships: {
          select: {
            role: true,
            project: { select: { id: true, name: true, code: true, color: true, status: true } },
          },
        },
        permissions: { select: { granted: true, permission: { select: { key: true, name: true } } } },
      },
    });
    if (!user) throw new NotFoundException('This user could not be found.');

    const [stats, effectivePermissions] = await Promise.all([
      this.stats(id),
      this.accessControl.getEffectivePermissions(id),
    ]);
    return { ...user, stats, effectivePermissions };
  }

  /** Performance snapshot used on profile pages and the personal dashboard. */
  async stats(userId: string) {
    const now = new Date();
    const [active, completed, overdue, awaitingReview, created, durations] =
      await this.prisma.$transaction([
        this.prisma.task.count({
          where: { currentOwnerId: userId, deletedAt: null, status: { in: OPEN_STATUSES } },
        }),
        this.prisma.task.count({
          where: { deletedAt: null, status: TaskStatus.COMPLETED, assignments: { some: { userId } } },
        }),
        this.prisma.task.count({
          where: {
            currentOwnerId: userId,
            deletedAt: null,
            status: { in: OPEN_STATUSES },
            deadline: { lt: now },
          },
        }),
        this.prisma.task.count({
          where: {
            currentOwnerId: userId,
            deletedAt: null,
            status: { in: [TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW] },
          },
        }),
        this.prisma.task.count({ where: { createdById: userId, deletedAt: null } }),
        this.prisma.taskAssignment.aggregate({
          where: { userId, exitedAt: { not: null } },
          _avg: { durationSeconds: true },
          _sum: { durationSeconds: true },
          _count: true,
        }),
      ]);

    const totalHandled = active + completed;
    return {
      activeTasks: active,
      completedTasks: completed,
      overdueTasks: overdue,
      awaitingReview,
      createdTasks: created,
      completionRate: totalHandled > 0 ? Math.round((completed / totalHandled) * 100) : 0,
      averageHoldingSeconds: Math.round(durations._avg.durationSeconds ?? 0),
      totalHoldingSeconds: durations._sum.durationSeconds ?? 0,
      handledTenures: durations._count,
    };
  }

  async recentActivity(userId: string, take = 15) {
    return this.prisma.taskHistory.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
        task: { select: { id: true, number: true, title: true, status: true } },
      },
    });
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A user with this email address already exists.');

    await this.assertReferencesExist(dto);

    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    const temporaryPassword = dto.password ?? `${randomBytes(9).toString('base64url')}Aa1!`;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash: await bcrypt.hash(temporaryPassword, rounds),
        roleId: dto.roleId,
        departmentId: dto.departmentId ?? null,
        positionId: dto.positionId ?? null,
        managerId: dto.managerId ?? null,
        phone: dto.phone ?? null,
        jobTitle: dto.jobTitle ?? null,
        bio: dto.bio ?? null,
        avatarUrl: dto.avatarUrl ?? null,
        status: dto.status ?? 'ACTIVE',
        mustChangePassword: !dto.password,
      },
      select: USER_PROFILE_SELECT,
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'user.created',
      resourceType: 'User',
      resourceId: user.id,
      summary: `Created user ${user.firstName} ${user.lastName}`,
      departmentId: user.departmentId,
      after: { email: user.email, roleId: dto.roleId },
    });

    // The generated password is returned exactly once, to the administrator.
    return { ...user, ...(dto.password ? {} : { temporaryPassword }) };
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const before = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_PROFILE_SELECT,
    });
    if (!before) throw new NotFoundException('This user could not be found.');

    if (dto.managerId) {
      if (dto.managerId === id) {
        throw new BadRequestException('A user cannot report to themselves.');
      }
      const subordinates = await this.accessControl.getSubordinateIds(id, false);
      if (subordinates.includes(dto.managerId)) {
        throw new BadRequestException(
          'That change would create a loop in the reporting structure.',
        );
      }
    }
    await this.assertReferencesExist(dto);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
        ...(dto.positionId !== undefined ? { positionId: dto.positionId || null } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      select: USER_PROFILE_SELECT,
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'user.updated',
      resourceType: 'User',
      resourceId: id,
      summary: `Updated user ${user.firstName} ${user.lastName}`,
      departmentId: user.departmentId,
      before: { ...before } as unknown as Prisma.InputJsonValue,
      after: { ...user } as unknown as Prisma.InputJsonValue,
    });
    return user;
  }

  async updateOwnProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: { ...dto },
      select: USER_PROFILE_SELECT,
    });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    if (id === actor.id) throw new BadRequestException('You cannot deactivate your own account.');

    const openTasks = await this.prisma.task.count({
      where: { currentOwnerId: id, deletedAt: null, status: { in: OPEN_STATUSES } },
    });
    if (openTasks > 0) {
      throw new BadRequestException(
        `This user still owns ${openTasks} open task(s). Hand them over before deactivating the account.`,
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DEACTIVATED' },
      select: { id: true, firstName: true, lastName: true, departmentId: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'user.deactivated',
      resourceType: 'User',
      resourceId: id,
      summary: `Deactivated user ${user.firstName} ${user.lastName}`,
      departmentId: user.departmentId,
    });
    return { success: true };
  }

  async resetPassword(id: string, actor: AuthenticatedUser) {
    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    const temporaryPassword = `${randomBytes(9).toString('base64url')}Aa1!`;
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(temporaryPassword, rounds),
        mustChangePassword: true,
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'user.password_reset',
      resourceType: 'User',
      resourceId: id,
      summary: 'Reset a user password',
    });
    return { temporaryPassword };
  }

  async setPermissionOverrides(id: string, dto: SetUserPermissionsDto, actor: AuthenticatedUser) {
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: dto.overrides.map((override) => override.permissionKey) } },
      select: { id: true, key: true },
    });
    const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

    const unknown = dto.overrides.filter((override) => !byKey.has(override.permissionKey));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown permission(s): ${unknown.map((o) => o.permissionKey).join(', ')}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId: id } }),
      this.prisma.userPermission.createMany({
        data: dto.overrides.map((override) => ({
          userId: id,
          permissionId: byKey.get(override.permissionKey) as string,
          granted: override.granted,
        })),
      }),
    ]);

    await this.audit.record({
      actorId: actor.id,
      action: 'user.permissions_updated',
      resourceType: 'User',
      resourceId: id,
      summary: 'Updated per-user permission overrides',
      after: dto.overrides as unknown as Prisma.InputJsonValue,
    });
    return { effectivePermissions: await this.accessControl.getEffectivePermissions(id) };
  }

  /** Open/overdue counts per user — the manager "who is overloaded?" view. */
  async workloadFor(userIds: string[]) {
    if (userIds.length === 0) return {} as Record<string, { open: number; overdue: number }>;
    const now = new Date();
    const [open, overdue] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['currentOwnerId'],
        orderBy: { currentOwnerId: 'asc' },
        where: {
          currentOwnerId: { in: userIds },
          deletedAt: null,
          status: { in: OPEN_STATUSES },
        },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['currentOwnerId'],
        orderBy: { currentOwnerId: 'asc' },
        where: {
          currentOwnerId: { in: userIds },
          deletedAt: null,
          status: { in: OPEN_STATUSES },
          deadline: { lt: now },
        },
        _count: true,
      }),
    ]);

    const result: Record<string, { open: number; overdue: number }> = {};
    for (const id of userIds) result[id] = { open: 0, overdue: 0 };
    for (const row of open) {
      if (row.currentOwnerId) result[row.currentOwnerId].open = row._count;
    }
    for (const row of overdue) {
      if (row.currentOwnerId) result[row.currentOwnerId].overdue = row._count;
    }
    return result;
  }

  private async assertReferencesExist(dto: Partial<CreateUserDto>): Promise<void> {
    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({ where: { id: dto.roleId, deletedAt: null } });
      if (!role) throw new BadRequestException('The selected role does not exist.');
    }
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, deletedAt: null },
      });
      if (!department) throw new BadRequestException('The selected department does not exist.');
    }
    if (dto.positionId) {
      const position = await this.prisma.position.findFirst({
        where: { id: dto.positionId, deletedAt: null },
      });
      if (!position) throw new BadRequestException('The selected position does not exist.');
    }
    if (dto.managerId) {
      const manager = await this.prisma.user.findFirst({
        where: { id: dto.managerId, deletedAt: null },
      });
      if (!manager) throw new BadRequestException('The selected manager does not exist.');
    }
  }
}
