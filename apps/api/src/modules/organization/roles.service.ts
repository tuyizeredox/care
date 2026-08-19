import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

export interface UpsertRoleInput {
  key?: string;
  name: string;
  description?: string;
  level?: number;
  permissionKeys?: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: { level: 'desc' },
      include: {
        permissions: { select: { permission: { select: { key: true, name: true, category: true } } } },
        _count: { select: { users: { where: { deletedAt: null } } } },
      },
    });
  }

  async permissionCatalogue() {
    return this.prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      include: {
        permissions: { select: { permission: true } },
        users: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });
    if (!role) throw new NotFoundException('This role could not be found.');
    return role;
  }

  async create(input: UpsertRoleInput, actor: AuthenticatedUser) {
    if (!input.key) throw new BadRequestException('A role key is required.');
    const permissionIds = await this.resolvePermissionIds(input.permissionKeys ?? []);

    const role = await this.prisma.role.create({
      data: {
        key: input.key.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        name: input.name,
        description: input.description ?? null,
        level: input.level ?? 10,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'role.created',
      resourceType: 'Role',
      resourceId: role.id,
      summary: `Created role ${role.name}`,
      after: { ...input } as unknown as Prisma.InputJsonValue,
    });
    return role;
  }

  async update(id: string, input: UpsertRoleInput, actor: AuthenticatedUser) {
    const before = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!before) throw new NotFoundException('This role could not be found.');

    const data: Prisma.RoleUpdateInput = {
      name: input.name,
      description: input.description ?? null,
      ...(input.level !== undefined ? { level: input.level } : {}),
    };

    if (input.permissionKeys) {
      const permissionIds = await this.resolvePermissionIds(input.permissionKeys);
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        this.prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        }),
      ]);
    }

    const role = await this.prisma.role.update({ where: { id }, data });
    await this.audit.record({
      actorId: actor.id,
      action: 'role.updated',
      resourceType: 'Role',
      resourceId: id,
      summary: `Updated role ${role.name}`,
      before: {
        name: before.name,
        permissions: before.permissions.map((p) => p.permission.key),
      } as unknown as Prisma.InputJsonValue,
      after: { ...input } as unknown as Prisma.InputJsonValue,
    });
    return role;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
    });
    if (!role) throw new NotFoundException('This role could not be found.');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted.');
    if (role._count.users > 0) {
      throw new BadRequestException(
        `${role._count.users} user(s) still hold this role. Reassign them first.`,
      );
    }
    await this.prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      actorId: actor.id,
      action: 'role.deleted',
      resourceType: 'Role',
      resourceId: id,
      summary: `Deleted role ${role.name}`,
    });
    return { success: true };
  }

  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true },
    });
    if (permissions.length !== keys.length) {
      const found = new Set(permissions.map((permission) => permission.key));
      throw new BadRequestException(
        `Unknown permission(s): ${keys.filter((key) => !found.has(key)).join(', ')}`,
      );
    }
    return permissions.map((permission) => permission.id);
  }
}
