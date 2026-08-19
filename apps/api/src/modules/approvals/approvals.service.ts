import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Paginated } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { getDeadlineMeta } from '../../common/utils/date.util';
import { TasksService } from '../tasks/tasks.service';
import { USER_SUMMARY_SELECT } from '../users/user.select';
import { ApprovalQueryDto, RequestApprovalDto } from './dto';

const APPROVAL_INCLUDE = {
  approver: { select: USER_SUMMARY_SELECT },
  requestedBy: { select: USER_SUMMARY_SELECT },
  stage: { select: { id: true, name: true, order: true, type: true } },
  task: {
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      deadline: true,
      completedAt: true,
      submittedAt: true,
      currentOwner: { select: USER_SUMMARY_SELECT },
      department: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.ApprovalInclude;

/**
 * Formal approval chains. Decisions are executed through TasksService so an
 * approval always moves the task, writes history and fires notifications -
 * there is no way to record a decision that does not advance the workflow.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly tasks: TasksService,
  ) {}

  async findAll(user: AuthenticatedUser, query: ApprovalQueryDto): Promise<Paginated<unknown>> {
    const { page, pageSize } = query;
    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);

    const where: Prisma.ApprovalWhereInput = {
      ...(query.mine !== false ? { approverId: user.id } : {}),
      ...(query.approverId ? { approverId: query.approverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.taskId ? { taskId: query.taskId } : {}),
      task: { deletedAt: null, AND: [visibility] },
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.approval.count({ where }),
      this.prisma.approval.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: APPROVAL_INCLUDE,
      }),
    ]);

    return {
      data: data.map((approval) => ({
        ...approval,
        task: {
          ...approval.task,
          deadlineMeta: getDeadlineMeta(
            approval.task.deadline,
            new Date(),
            approval.task.completedAt,
          ),
        },
      })),
      meta: buildMeta(page, pageSize, total),
    };
  }

  async pendingCount(userId: string): Promise<{ count: number }> {
    return {
      count: await this.prisma.approval.count({
        where: { approverId: userId, status: ApprovalStatus.PENDING, task: { deletedAt: null } },
      }),
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const approval = await this.prisma.approval.findUnique({
      where: { id },
      include: APPROVAL_INCLUDE,
    });
    if (!approval) throw new NotFoundException('This approval could not be found.');

    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);
    const visible = await this.prisma.task.count({
      where: { id: approval.taskId, deletedAt: null, AND: [visibility] },
    });
    if (visible === 0) {
      throw new ForbiddenException('You do not have permission to view this approval.');
    }
    return approval;
  }

  /** Adds an approver to a task, optionally as a step in a longer chain. */
  async request(user: AuthenticatedUser, taskId: string, dto: RequestApprovalDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, number: true, title: true, deadline: true },
    });
    if (!task) throw new NotFoundException('This task could not be found.');

    const duplicate = await this.prisma.approval.findFirst({
      where: { taskId, approverId: dto.approverId, status: ApprovalStatus.PENDING },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('That person has already been asked to approve this task.');
    }

    const sequence =
      dto.sequence ?? (await this.prisma.approval.count({ where: { taskId } })) + 1;

    await this.prisma.approval.create({
      data: {
        taskId,
        approverId: dto.approverId,
        requestedById: user.id,
        stageId: dto.stageId ?? null,
        sequence,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : task.deadline,
      },
    });

    // Handing the task to the approver keeps ownership and approval in step.
    return this.tasks.handover(user, taskId, {
      toUserId: dto.approverId,
      action: 'APPROVE',
      note: dto.note,
      stageId: dto.stageId,
    });
  }

  /** Approve. Delegates to the task engine, which advances the workflow. */
  async approve(user: AuthenticatedUser, id: string, comment?: string) {
    const approval = await this.loadActionable(user, id);
    return this.tasks.review(user, approval.taskId, { decision: 'APPROVE', comment });
  }

  async reject(user: AuthenticatedUser, id: string, comment: string, returnToUserId?: string) {
    const approval = await this.loadActionable(user, id);
    return this.tasks.review(user, approval.taskId, {
      decision: 'REJECT',
      comment,
      returnToUserId,
    });
  }

  async requestChanges(
    user: AuthenticatedUser,
    id: string,
    comment: string,
    returnToUserId?: string,
  ) {
    const approval = await this.loadActionable(user, id);
    return this.tasks.review(user, approval.taskId, {
      decision: 'REQUEST_CHANGES',
      comment,
      returnToUserId,
    });
  }

  /** Cancels a pending approval request without deciding it. */
  async cancel(user: AuthenticatedUser, id: string) {
    const approval = await this.prisma.approval.findUnique({
      where: { id },
      select: { id: true, requestedById: true, status: true },
    });
    if (!approval) throw new NotFoundException('This approval could not be found.');
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This approval has already been decided.');
    }
    if (approval.requestedById !== user.id) {
      throw new ForbiddenException('Only the person who requested this approval can cancel it.');
    }

    await this.prisma.approval.update({
      where: { id },
      data: { status: ApprovalStatus.CANCELLED, decidedAt: new Date() },
    });
    return { success: true };
  }

  private async loadActionable(user: AuthenticatedUser, id: string) {
    const approval = await this.prisma.approval.findUnique({
      where: { id },
      select: { id: true, taskId: true, approverId: true, status: true },
    });
    if (!approval) throw new NotFoundException('This approval could not be found.');
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This approval has already been decided.');
    }
    if (approval.approverId !== user.id) {
      throw new ForbiddenException('This approval is assigned to somebody else.');
    }
    return approval;
  }
}
