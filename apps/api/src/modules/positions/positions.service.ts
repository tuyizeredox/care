import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { USER_SUMMARY_SELECT } from '../users/user.select';
import { CreatePositionDto, UpdatePositionDto } from './dto';

export interface PositionNode {
  id: string;
  title: string;
  code: string;
  level: number;
  departmentId: string | null;
  department: { id: string; name: string; color: string } | null;
  holders: Array<{ id: string; firstName: string; lastName: string; avatarUrl: string | null }>;
  children: PositionNode[];
}

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(departmentId?: string) {
    return this.prisma.position.findMany({
      where: { deletedAt: null, ...(departmentId ? { departmentId } : {}) },
      orderBy: [{ level: 'desc' }, { title: 'asc' }],
      include: {
        department: { select: { id: true, name: true, code: true, color: true } },
        reportsTo: { select: { id: true, title: true, code: true } },
        _count: { select: { users: { where: { deletedAt: null } }, reports: true } },
      },
    });
  }

  async findOne(id: string) {
    const position = await this.prisma.position.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, code: true, color: true } },
        reportsTo: { select: { id: true, title: true, code: true } },
        reports: {
          where: { deletedAt: null },
          select: { id: true, title: true, code: true, level: true },
        },
        users: { where: { deletedAt: null }, select: USER_SUMMARY_SELECT },
      },
    });
    if (!position) throw new NotFoundException('This position could not be found.');
    return position;
  }

  /** The structural organigram, built from `Position.reportsToId`. */
  async tree(): Promise<PositionNode[]> {
    const positions = await this.prisma.position.findMany({
      where: { deletedAt: null },
      orderBy: [{ level: 'desc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        code: true,
        level: true,
        departmentId: true,
        reportsToId: true,
        department: { select: { id: true, name: true, color: true } },
        users: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    const nodes = new Map<string, PositionNode>();
    for (const position of positions) {
      nodes.set(position.id, {
        id: position.id,
        title: position.title,
        code: position.code,
        level: position.level,
        departmentId: position.departmentId,
        department: position.department,
        holders: position.users,
        children: [],
      });
    }

    const roots: PositionNode[] = [];
    for (const position of positions) {
      const node = nodes.get(position.id) as PositionNode;
      const parent = position.reportsToId ? nodes.get(position.reportsToId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(dto: CreatePositionDto, actor: AuthenticatedUser) {
    if (dto.reportsToId) await this.assertNoCycle(dto.reportsToId, null);
    const position = await this.prisma.position.create({ data: { ...dto } });
    await this.audit.record({
      actorId: actor.id,
      action: 'position.created',
      resourceType: 'Position',
      resourceId: position.id,
      summary: `Created position ${position.title}`,
      departmentId: position.departmentId,
      after: { ...dto } as unknown as Prisma.InputJsonValue,
    });
    return position;
  }

  async update(id: string, dto: UpdatePositionDto, actor: AuthenticatedUser) {
    const before = await this.prisma.position.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('This position could not be found.');
    if (dto.reportsToId) {
      if (dto.reportsToId === id) {
        throw new BadRequestException('A position cannot report to itself.');
      }
      await this.assertNoCycle(dto.reportsToId, id);
    }

    const position = await this.prisma.position.update({ where: { id }, data: { ...dto } });
    await this.audit.record({
      actorId: actor.id,
      action: 'position.updated',
      resourceType: 'Position',
      resourceId: id,
      summary: `Updated position ${position.title}`,
      departmentId: position.departmentId,
      before: { ...before } as unknown as Prisma.InputJsonValue,
      after: { ...position } as unknown as Prisma.InputJsonValue,
    });
    return position;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const holders = await this.prisma.user.count({ where: { positionId: id, deletedAt: null } });
    if (holders > 0) {
      throw new BadRequestException(
        `${holders} employee(s) currently hold this position. Reassign them first.`,
      );
    }
    await this.prisma.position.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      actorId: actor.id,
      action: 'position.deleted',
      resourceType: 'Position',
      resourceId: id,
      summary: 'Deleted a position',
    });
    return { success: true };
  }

  /** Walks up from `parentId`; throws if `selfId` appears in the chain. */
  private async assertNoCycle(parentId: string, selfId: string | null): Promise<void> {
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor) {
      if (selfId && cursor === selfId) {
        throw new BadRequestException('That change would create a loop in the reporting structure.');
      }
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const parent: { reportsToId: string | null } | null = await this.prisma.position.findUnique({
        where: { id: cursor },
        select: { reportsToId: true },
      });
      cursor = parent?.reportsToId ?? null;
    }
  }
}
