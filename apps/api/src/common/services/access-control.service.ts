import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS, PermissionKey } from '../constants/permissions';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Resolves *effective* permissions and data-visibility scopes.
 *
 * Effective permissions = permissions of the user's role
 *                       + per-user grants
 *                       - per-user revocations
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string): Promise<PermissionKey[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
        permissions: { select: { granted: true, permission: { select: { key: true } } } },
      },
    });
    if (!user) return [];

    const effective = new Set<string>(
      user.role.permissions.map((rolePermission) => rolePermission.permission.key),
    );
    for (const override of user.permissions) {
      if (override.granted) effective.add(override.permission.key);
      else effective.delete(override.permission.key);
    }
    return [...effective] as PermissionKey[];
  }

  /** All users below `userId` in the management tree (recursive), inclusive of self. */
  async getSubordinateIds(userId: string, includeSelf = true): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH RECURSIVE subordinates AS (
        SELECT id FROM users WHERE id = ${userId}
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN subordinates s ON u."managerId" = s.id
        WHERE u."deletedAt" IS NULL
      )
      SELECT id FROM subordinates
    `);
    const ids = rows.map((row) => row.id);
    return includeSelf ? ids : ids.filter((id) => id !== userId);
  }

  has(user: AuthenticatedUser, permission: PermissionKey): boolean {
    return (user.permissions ?? []).includes(permission);
  }

  /**
   * Prisma `where` fragment restricting a task query to what this user may see.
   * Returns `{}` for organisation-wide visibility.
   */
  async buildTaskVisibilityFilter(user: AuthenticatedUser): Promise<Prisma.TaskWhereInput> {
    if (this.has(user, PERMISSIONS.VIEW_ALL_TASKS)) return {};

    const personal: Prisma.TaskWhereInput[] = [
      { currentOwnerId: user.id },
      { createdById: user.id },
      { assignedById: user.id },
      { watchers: { some: { userId: user.id } } },
      { approvals: { some: { approverId: user.id } } },
      { assignments: { some: { userId: user.id } } },
    ];

    if (this.has(user, PERMISSIONS.VIEW_DEPARTMENT_TASKS) && user.departmentId) {
      personal.push({ departmentId: user.departmentId });
      personal.push({ currentOwner: { departmentId: user.departmentId } });
    }

    if (this.has(user, PERMISSIONS.VIEW_TEAM_TASKS)) {
      const teamIds = await this.getSubordinateIds(user.id);
      personal.push({ currentOwnerId: { in: teamIds } });
      personal.push({ createdById: { in: teamIds } });
    }

    if (this.has(user, PERMISSIONS.MANAGE_PROJECTS)) {
      personal.push({ project: { managerId: user.id } });
    }

    return { OR: personal };
  }

  /** Same idea for user directory queries. */
  async buildUserVisibilityFilter(user: AuthenticatedUser): Promise<Prisma.UserWhereInput> {
    if (
      this.has(user, PERMISSIONS.MANAGE_USERS) ||
      this.has(user, PERMISSIONS.VIEW_ALL_TASKS) ||
      this.has(user, PERMISSIONS.VIEW_ANALYTICS)
    ) {
      return {};
    }
    if (this.has(user, PERMISSIONS.VIEW_DEPARTMENT_TASKS) && user.departmentId) {
      return { OR: [{ departmentId: user.departmentId }, { id: user.id }] };
    }
    if (this.has(user, PERMISSIONS.VIEW_TEAM_TASKS)) {
      const teamIds = await this.getSubordinateIds(user.id);
      return { id: { in: teamIds } };
    }
    return { id: user.id };
  }

  /** True when `user` is at or above `subjectId` in the management chain. */
  async managesUser(user: AuthenticatedUser, subjectId: string): Promise<boolean> {
    if (user.id === subjectId) return true;
    const subordinates = await this.getSubordinateIds(user.id, false);
    return subordinates.includes(subjectId);
  }
}
