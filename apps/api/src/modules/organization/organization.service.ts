import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUnitDto, UpdateUnitDto } from './dto';

export interface OrgChartNode {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  position: { id: string; title: string; level: number } | null;
  department: { id: string; name: string; code: string; color: string } | null;
  role: { key: string; name: string };
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  reports: OrgChartNode[];
}

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
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * People organigram, derived from `User.managerId`. Task counters are
   * fetched with three grouped queries rather than per-node lookups.
   */
  async chart(rootUserId?: string): Promise<OrgChartNode[]> {
    const now = new Date();
    const [users, active, completed, overdue] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null, status: { not: 'DEACTIVATED' } },
        orderBy: [{ position: { level: 'desc' } }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true,
          managerId: true,
          position: { select: { id: true, title: true, level: true } },
          department: { select: { id: true, name: true, code: true, color: true } },
          role: { select: { key: true, name: true } },
        },
      }),
      this.prisma.task.groupBy({
        by: ['currentOwnerId'],
        orderBy: { currentOwnerId: 'asc' },
        where: { deletedAt: null, status: { in: OPEN_STATUSES } },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['currentOwnerId'],
        orderBy: { currentOwnerId: 'asc' },
        where: { deletedAt: null, status: TaskStatus.COMPLETED },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['currentOwnerId'],
        orderBy: { currentOwnerId: 'asc' },
        where: { deletedAt: null, status: { in: OPEN_STATUSES }, deadline: { lt: now } },
        _count: true,
      }),
    ]);

    const counter = (rows: Array<{ currentOwnerId: string | null; _count: number }>) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        if (row.currentOwnerId) map.set(row.currentOwnerId, row._count);
      }
      return map;
    };
    const activeMap = counter(active);
    const completedMap = counter(completed);
    const overdueMap = counter(overdue);

    const nodes = new Map<string, OrgChartNode>();
    for (const user of users) {
      nodes.set(user.id, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        position: user.position,
        department: user.department,
        role: user.role,
        activeTasks: activeMap.get(user.id) ?? 0,
        completedTasks: completedMap.get(user.id) ?? 0,
        overdueTasks: overdueMap.get(user.id) ?? 0,
        reports: [],
      });
    }

    const roots: OrgChartNode[] = [];
    for (const user of users) {
      const node = nodes.get(user.id) as OrgChartNode;
      const manager = user.managerId ? nodes.get(user.managerId) : undefined;
      if (manager) manager.reports.push(node);
      else roots.push(node);
    }

    if (rootUserId) {
      const scoped = nodes.get(rootUserId);
      return scoped ? [scoped] : [];
    }
    return roots;
  }

  /** Headline numbers for the organisation directory page. */
  async overview() {
    const [employees, departments, positions, projects, units, activeTasks] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
        this.prisma.department.count({ where: { deletedAt: null } }),
        this.prisma.position.count({ where: { deletedAt: null } }),
        this.prisma.project.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
        this.prisma.organizationUnit.count({ where: { deletedAt: null } }),
        this.prisma.task.count({ where: { deletedAt: null, status: { in: OPEN_STATUSES } } }),
      ]);
    return { employees, departments, positions, projects, units, activeTasks };
  }

  async units() {
    const units = await this.prisma.organizationUnit.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        head: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        departments: { where: { deletedAt: null }, select: { id: true, name: true, code: true } },
        _count: { select: { children: true } },
      },
    });

    type UnitNode = (typeof units)[number] & { children: UnitNode[] };
    const nodes = new Map<string, UnitNode>();
    for (const unit of units) nodes.set(unit.id, { ...unit, children: [] });

    const roots: UnitNode[] = [];
    for (const unit of units) {
      const node = nodes.get(unit.id) as UnitNode;
      const parent = unit.parentId ? nodes.get(unit.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async createUnit(dto: CreateUnitDto, actor: AuthenticatedUser) {
    const unit = await this.prisma.organizationUnit.create({ data: { ...dto } });
    await this.audit.record({
      actorId: actor.id,
      action: 'org_unit.created',
      resourceType: 'OrganizationUnit',
      resourceId: unit.id,
      summary: `Created organisation unit ${unit.name}`,
      after: { ...dto } as unknown as Prisma.InputJsonValue,
    });
    return unit;
  }

  async updateUnit(id: string, dto: UpdateUnitDto, actor: AuthenticatedUser) {
    const before = await this.prisma.organizationUnit.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('This organisation unit could not be found.');
    if (dto.parentId === id) throw new BadRequestException('A unit cannot be its own parent.');

    const unit = await this.prisma.organizationUnit.update({ where: { id }, data: { ...dto } });
    await this.audit.record({
      actorId: actor.id,
      action: 'org_unit.updated',
      resourceType: 'OrganizationUnit',
      resourceId: id,
      summary: `Updated organisation unit ${unit.name}`,
      before: { ...before } as unknown as Prisma.InputJsonValue,
      after: { ...unit } as unknown as Prisma.InputJsonValue,
    });
    return unit;
  }

  async removeUnit(id: string, actor: AuthenticatedUser) {
    const children = await this.prisma.organizationUnit.count({
      where: { parentId: id, deletedAt: null },
    });
    if (children > 0) {
      throw new BadRequestException('Move or delete the child units before deleting this one.');
    }
    await this.prisma.organizationUnit.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      actorId: actor.id,
      action: 'org_unit.deleted',
      resourceType: 'OrganizationUnit',
      resourceId: id,
      summary: 'Deleted an organisation unit',
    });
    return { success: true };
  }
}
