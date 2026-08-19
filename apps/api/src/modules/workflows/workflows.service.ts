import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssigneeMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Paginated } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateWorkflowDto, UpdateWorkflowDto, WorkflowQueryDto, WorkflowStageDto } from './dto';

const WORKFLOW_INCLUDE = {
  taskType: { select: { id: true, name: true, code: true } },
  project: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true, color: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  stages: {
    orderBy: { order: 'asc' },
    include: {
      assigneeUser: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      position: { select: { id: true, title: true } },
      role: { select: { id: true, key: true, name: true } },
    },
  },
  transitions: true,
  _count: { select: { tasks: true } },
} satisfies Prisma.TaskWorkflowInclude;

/** Administrative CRUD for the workflow builder. */
@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: WorkflowQueryDto): Promise<Paginated<unknown>> {
    const { page, pageSize } = query;
    const where: Prisma.TaskWorkflowWhereInput = {
      deletedAt: null,
      ...(query.activeOnly ? { isActive: true } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.taskTypeId ? { taskTypeId: query.taskTypeId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.taskWorkflow.count({ where }),
      this.prisma.taskWorkflow.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: WORKFLOW_INCLUDE,
      }),
    ]);
    return { data, meta: buildMeta(page, pageSize, total) };
  }

  async findOne(id: string) {
    const workflow = await this.prisma.taskWorkflow.findFirst({
      where: { OR: [{ id }, { code: id.toUpperCase() }], deletedAt: null },
      include: WORKFLOW_INCLUDE,
    });
    if (!workflow) throw new NotFoundException('This workflow could not be found.');
    return workflow;
  }

  async create(user: AuthenticatedUser, dto: CreateWorkflowDto) {
    this.validateStages(dto.stages);

    const workflow = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.taskWorkflow.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      const created = await tx.taskWorkflow.create({
        data: {
          name: dto.name,
          code: dto.code.toUpperCase(),
          description: dto.description ?? null,
          taskTypeId: dto.taskTypeId ?? null,
          projectId: dto.projectId ?? null,
          departmentId: dto.departmentId ?? null,
          isActive: dto.isActive ?? true,
          isDefault: dto.isDefault ?? false,
          createdById: user.id,
          stages: { create: dto.stages.map((stage) => this.stageData(stage)) },
        },
        include: { stages: true },
      });

      await this.writeTransitions(tx, created.id, created.stages, dto.transitions);
      return created;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'workflow.created',
      resourceType: 'TaskWorkflow',
      resourceId: workflow.id,
      summary: 'Created workflow ' + workflow.name,
      after: { name: workflow.name, stages: dto.stages.length },
    });
    return this.findOne(workflow.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateWorkflowDto) {
    const existing = await this.prisma.taskWorkflow.findFirst({
      where: { id, deletedAt: null },
      include: { stages: true },
    });
    if (!existing) throw new NotFoundException('This workflow could not be found.');
    if (dto.stages) this.validateStages(dto.stages);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.taskWorkflow.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      await tx.taskWorkflow.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.taskTypeId !== undefined ? { taskTypeId: dto.taskTypeId || null } : {}),
          ...(dto.projectId !== undefined ? { projectId: dto.projectId || null } : {}),
          ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });

      if (!dto.stages) return;

      // Stages still holding a live task are kept and updated in place;
      // orphaned ones are removed. This keeps historical journeys readable.
      const keepIds = dto.stages.map((stage) => stage.id).filter(Boolean) as string[];
      const removable = existing.stages.filter((stage) => !keepIds.includes(stage.id));

      for (const stage of removable) {
        const inUse = await tx.task.count({ where: { currentStageId: stage.id } });
        if (inUse > 0) {
          throw new BadRequestException(
            'Stage "' + stage.name + '" cannot be removed while ' + inUse + ' task(s) sit in it.',
          );
        }
        await tx.workflowTransition.deleteMany({
          where: { OR: [{ fromStageId: stage.id }, { toStageId: stage.id }] },
        });
        await tx.taskAssignment.updateMany({ where: { stageId: stage.id }, data: { stageId: null } });
        await tx.approval.updateMany({ where: { stageId: stage.id }, data: { stageId: null } });
        await tx.workflowStage.delete({ where: { id: stage.id } });
      }

      // Park existing orders out of the way first so the unique
      // (workflowId, order) constraint is never hit mid-reshuffle.
      await tx.workflowStage.updateMany({
        where: { workflowId: id },
        data: { order: { increment: 1000 } },
      });

      for (const stage of dto.stages) {
        if (stage.id) {
          await tx.workflowStage.update({ where: { id: stage.id }, data: this.stageData(stage) });
        } else {
          await tx.workflowStage.create({
            data: { ...this.stageData(stage), workflow: { connect: { id } } },
          });
        }
      }

      const stages = await tx.workflowStage.findMany({ where: { workflowId: id } });
      await tx.workflowTransition.deleteMany({ where: { workflowId: id } });
      await this.writeTransitions(tx, id, stages, dto.transitions);
    });

    await this.audit.record({
      actorId: user.id,
      action: 'workflow.updated',
      resourceType: 'TaskWorkflow',
      resourceId: id,
      summary: 'Updated workflow ' + (dto.name ?? existing.name),
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: dto.name ?? existing.name, isActive: dto.isActive ?? existing.isActive },
    });
    return this.findOne(id);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const workflow = await this.prisma.taskWorkflow.findFirst({ where: { id, deletedAt: null } });
    if (!workflow) throw new NotFoundException('This workflow could not be found.');

    const liveTasks = await this.prisma.task.count({
      where: { workflowId: id, deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    });
    if (liveTasks > 0) {
      throw new BadRequestException(
        'This workflow is still driving ' + liveTasks + ' active task(s) and cannot be archived.',
      );
    }

    await this.prisma.taskWorkflow.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isDefault: false },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'workflow.archived',
      resourceType: 'TaskWorkflow',
      resourceId: id,
      summary: 'Archived workflow ' + workflow.name,
    });
    return { success: true };
  }

  /** Duplicates a workflow so administrators can iterate without risk. */
  async duplicate(user: AuthenticatedUser, id: string) {
    const source = await this.findOne(id);
    const dto: CreateWorkflowDto = {
      name: source.name + ' (copy)',
      code: (source.code + '-COPY').slice(0, 30),
      description: source.description ?? undefined,
      taskTypeId: source.taskTypeId ?? undefined,
      projectId: source.projectId ?? undefined,
      departmentId: source.departmentId ?? undefined,
      isActive: false,
      isDefault: false,
      stages: source.stages.map((stage) => ({
        name: stage.name,
        description: stage.description ?? undefined,
        order: stage.order,
        type: stage.type,
        assigneeMode: stage.assigneeMode,
        assigneeUserId: stage.assigneeUserId ?? undefined,
        positionId: stage.positionId ?? undefined,
        roleId: stage.roleId ?? undefined,
        entryStatus: stage.entryStatus,
        requiresApproval: stage.requiresApproval,
        slaHours: stage.slaHours ?? undefined,
        isFinal: stage.isFinal,
      })),
      transitions: source.transitions.map((transition) => ({
        fromOrder: source.stages.find((stage) => stage.id === transition.fromStageId)?.order ?? 1,
        toOrder: source.stages.find((stage) => stage.id === transition.toStageId)?.order ?? 1,
        label: transition.label ?? undefined,
        requiresPermission: transition.requiresPermission ?? undefined,
      })),
    };
    return this.create(user, dto);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** A stage that names an assignee must actually carry the reference. */
  private validateStages(stages: WorkflowStageDto[]): void {
    const orders = new Set<number>();
    for (const stage of stages) {
      if (orders.has(stage.order)) {
        throw new BadRequestException('Two stages share order ' + stage.order + '.');
      }
      orders.add(stage.order);

      const mode = stage.assigneeMode ?? AssigneeMode.UNASSIGNED;
      if (mode === AssigneeMode.SPECIFIC_USER && !stage.assigneeUserId) {
        throw new BadRequestException('Stage "' + stage.name + '" needs a specific employee.');
      }
      if (mode === AssigneeMode.POSITION && !stage.positionId) {
        throw new BadRequestException('Stage "' + stage.name + '" needs a position.');
      }
      if (mode === AssigneeMode.ROLE && !stage.roleId) {
        throw new BadRequestException('Stage "' + stage.name + '" needs a role.');
      }
    }
    if (!stages.some((stage) => stage.isFinal)) {
      // The last stage becomes the implicit finish line.
      const last = [...stages].sort((a, b) => b.order - a.order)[0];
      if (last) last.isFinal = true;
    }
  }

  private stageData(stage: WorkflowStageDto): Prisma.WorkflowStageCreateWithoutWorkflowInput {
    const mode = stage.assigneeMode ?? AssigneeMode.UNASSIGNED;
    return {
      name: stage.name,
      description: stage.description ?? null,
      order: stage.order,
      type: stage.type ?? 'WORK',
      assigneeMode: mode,
      assigneeUser:
        mode === AssigneeMode.SPECIFIC_USER && stage.assigneeUserId
          ? { connect: { id: stage.assigneeUserId } }
          : undefined,
      position:
        mode === AssigneeMode.POSITION && stage.positionId
          ? { connect: { id: stage.positionId } }
          : undefined,
      role: mode === AssigneeMode.ROLE && stage.roleId ? { connect: { id: stage.roleId } } : undefined,
      entryStatus: stage.entryStatus ?? 'ASSIGNED',
      requiresApproval: stage.requiresApproval ?? stage.type === 'APPROVAL',
      slaHours: stage.slaHours ?? null,
      isFinal: stage.isFinal ?? false,
    };
  }

  private async writeTransitions(
    tx: Prisma.TransactionClient,
    workflowId: string,
    stages: Array<{ id: string; order: number }>,
    transitions?: Array<{
      fromOrder: number;
      toOrder: number;
      label?: string;
      requiresPermission?: string;
    }>,
  ): Promise<void> {
    if (!transitions || transitions.length === 0) return;
    const byOrder = new Map(stages.map((stage) => [stage.order, stage.id]));

    const rows = transitions
      .map((transition) => ({
        workflowId,
        fromStageId: byOrder.get(transition.fromOrder),
        toStageId: byOrder.get(transition.toOrder),
        label: transition.label ?? null,
        requiresPermission: transition.requiresPermission ?? null,
      }))
      .filter(
        (row): row is { workflowId: string; fromStageId: string; toStageId: string; label: string | null; requiresPermission: string | null } =>
          Boolean(row.fromStageId && row.toStageId && row.fromStageId !== row.toStageId),
      );

    if (rows.length > 0) {
      await tx.workflowTransition.createMany({ data: rows, skipDuplicates: true });
    }
  }
}
