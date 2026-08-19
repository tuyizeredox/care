import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentRole,
  HistoryAction,
  NotificationType,
  Prisma,
  TaskStatus,
  WaitingReason,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Paginated } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { addDays, endOfDay, getDeadlineMeta, humanizeDuration } from '../../common/utils/date.util';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TagsService } from '../tags/tags.service';
import { WorkflowEngineService } from '../workflows/workflow-engine.service';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskHistoryService } from './task-history.service';
import { TaskJourneyService } from './task-journey.service';
import { TASK_DETAIL_SELECT, TASK_SUMMARY_SELECT, taskRef } from './task.select';
import {
  AssignTaskDto,
  ChangeDeadlineDto,
  ChangePriorityDto,
  ChangeStatusDto,
  CreateTaskDto,
  HandoverTaskDto,
  ReviewTaskDto,
  SetWaitingDto,
  SubmitTaskDto,
  TaskQueryDto,
  UpdateTaskDto,
} from './dto';
import {
  ActorContext,
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  assertTransition,
  availableTransitions,
} from './task-status.machine';

/** Shape shared by every ownership move so the ledger stays consistent. */
interface OwnershipMove {
  toUserId: string;
  stageId?: string | null;
  role?: AssignmentRole;
  note?: string | null;
  waitingReason: WaitingReason;
  status: TaskStatus;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly audit: AuditService,
    private readonly history: TaskHistoryService,
    private readonly assignments: TaskAssignmentService,
    private readonly journey: TaskJourneyService,
    private readonly engine: WorkflowEngineService,
    private readonly notifications: NotificationsService,
    private readonly tags: TagsService,
  ) {}

  // =========================================================================
  // Queries
  // =========================================================================

  async findAll(user: AuthenticatedUser, query: TaskQueryDto): Promise<Paginated<unknown>> {
    const { page, pageSize } = query;
    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);
    const filters = await this.buildFilters(user, query);

    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...(query.includeSubtasks ? {} : { parentTaskId: null }),
      AND: [visibility, ...filters],
    };

    const [total, tasks] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy: this.buildOrderBy(query),
        select: TASK_SUMMARY_SELECT,
      }),
    ]);

    return {
      data: tasks.map((task) => this.decorate(task)),
      meta: buildMeta(page, pageSize, total),
    };
  }

  /** Adds the derived fields every view needs so the client stays dumb. */
  private decorate<T extends {
    deadline: Date | null;
    completedAt: Date | null;
    ownerSince: Date | null;
    waitingSince: Date | null;
    status: TaskStatus;
  }>(task: T) {
    const deadlineMeta = getDeadlineMeta(task.deadline, new Date(), task.completedAt);
    const heldSeconds = task.ownerSince
      ? Math.floor((Date.now() - task.ownerSince.getTime()) / 1000)
      : null;
    const waitingSeconds = task.waitingSince
      ? Math.floor((Date.now() - task.waitingSince.getTime()) / 1000)
      : null;

    return {
      ...task,
      deadlineMeta,
      isOverdue: deadlineMeta.isOverdue,
      isOpen: !TERMINAL_STATUSES.includes(task.status),
      timeWithOwnerSeconds: heldSeconds,
      timeWithOwner: heldSeconds === null ? null : humanizeDuration(heldSeconds),
      waitingForSeconds: waitingSeconds,
      waitingFor: waitingSeconds === null ? null : humanizeDuration(waitingSeconds),
    };
  }

  private buildOrderBy(query: TaskQueryDto): Prisma.TaskOrderByWithRelationInput[] {
    const direction = query.sortOrder ?? 'desc';
    // Allow-list: an arbitrary column name from the query string must never
    // reach the ORDER BY clause.
    const sortable = [
      'deadline',
      'priority',
      'status',
      'createdAt',
      'updatedAt',
      'number',
      'title',
      'ownerSince',
    ];
    const field = query.sortBy && sortable.includes(query.sortBy) ? query.sortBy : 'updatedAt';
    // Nulls last on deadline so undated work does not crowd out real deadlines.
    if (field === 'deadline') {
      return [{ deadline: { sort: direction, nulls: 'last' } }, { number: 'desc' }];
    }
    return [{ [field]: direction } as Prisma.TaskOrderByWithRelationInput, { number: 'desc' }];
  }

  /** Translates the query DTO into composable Prisma filters. */
  private async buildFilters(
    user: AuthenticatedUser,
    query: TaskQueryDto,
  ): Promise<Prisma.TaskWhereInput[]> {
    const filters: Prisma.TaskWhereInput[] = [];
    const now = new Date();

    if (query.status?.length) filters.push({ status: { in: query.status } });
    if (query.priority?.length) filters.push({ priority: { in: query.priority } });
    if (query.departmentId?.length) filters.push({ departmentId: { in: query.departmentId } });
    if (query.projectId?.length) filters.push({ projectId: { in: query.projectId } });
    if (query.ownerId?.length) filters.push({ currentOwnerId: { in: query.ownerId } });
    if (query.createdById) filters.push({ createdById: query.createdById });
    if (query.workflowId) filters.push({ workflowId: query.workflowId });
    if (query.taskTypeId) filters.push({ taskTypeId: query.taskTypeId });
    if (query.waitingForUserId) filters.push({ waitingForUserId: query.waitingForUserId });
    if (query.waitingReason) filters.push({ waitingReason: query.waitingReason });

    if (query.tags?.length) {
      filters.push({ tags: { some: { tag: { name: { in: query.tags.map((t) => t.toLowerCase()) } } } } });
    }

    if (query.deadlineFrom || query.deadlineTo) {
      filters.push({
        deadline: {
          ...(query.deadlineFrom ? { gte: new Date(query.deadlineFrom) } : {}),
          ...(query.deadlineTo ? { lte: endOfDay(new Date(query.deadlineTo)) } : {}),
        },
      });
    }

    if (query.createdFrom || query.createdTo) {
      filters.push({
        createdAt: {
          ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
          ...(query.createdTo ? { lte: endOfDay(new Date(query.createdTo)) } : {}),
        },
      });
    }

    if (query.overdue) {
      filters.push({ deadline: { lt: now }, status: { in: OPEN_STATUSES } });
    }
    if (query.dueToday) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filters.push({
        deadline: { gte: start, lte: endOfDay(now) },
        status: { in: OPEN_STATUSES },
      });
    }
    if (query.dueSoon) {
      filters.push({
        deadline: { gte: now, lte: endOfDay(addDays(now, 7)) },
        status: { in: OPEN_STATUSES },
      });
    }

    if (query.assignedToMe) filters.push({ currentOwnerId: user.id });
    if (query.waitingOnOthers) {
      filters.push({
        createdById: user.id,
        currentOwnerId: { not: user.id },
        status: { in: OPEN_STATUSES },
      });
    }
    if (query.needsMyAction) {
      filters.push({
        OR: [
          { currentOwnerId: user.id, status: { in: OPEN_STATUSES } },
          { approvals: { some: { approverId: user.id, status: 'PENDING' } } },
        ],
      });
    }
    if (query.previouslyMine) {
      filters.push({
        assignments: { some: { userId: user.id, exitedAt: { not: null } } },
        currentOwnerId: { not: user.id },
      });
    }

    if (query.search) {
      filters.push(this.searchFilter(query.search));
    }

    return filters;
  }

  /** Global search across id, title, description, tags, comments and people. */
  private searchFilter(term: string): Prisma.TaskWhereInput {
    const trimmed = term.trim();
    const numeric = Number.parseInt(trimmed.replace('#', ''), 10);
    const or: Prisma.TaskWhereInput[] = [
      { title: { contains: trimmed, mode: 'insensitive' } },
      { description: { contains: trimmed, mode: 'insensitive' } },
      { tags: { some: { tag: { name: { contains: trimmed.toLowerCase() } } } } },
      { comments: { some: { body: { contains: trimmed, mode: 'insensitive' }, deletedAt: null } } },
      { project: { name: { contains: trimmed, mode: 'insensitive' } } },
      { department: { name: { contains: trimmed, mode: 'insensitive' } } },
      { currentOwner: { firstName: { contains: trimmed, mode: 'insensitive' } } },
      { currentOwner: { lastName: { contains: trimmed, mode: 'insensitive' } } },
    ];
    if (Number.isFinite(numeric)) or.unshift({ number: numeric });
    return { OR: or };
  }

  /** Resolves a task by cuid or by its human `#number`. */
  private async loadTask(idOrNumber: string) {
    const numeric = Number.parseInt(String(idOrNumber).replace('#', ''), 10);
    const task = await this.prisma.task.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: idOrNumber }, ...(Number.isFinite(numeric) ? [{ number: numeric }] : [])],
      },
      select: TASK_DETAIL_SELECT,
    });
    if (!task) throw new NotFoundException('This task could not be found.');
    return task;
  }

  private async assertCanView(user: AuthenticatedUser, taskId: string): Promise<void> {
    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);
    const visible = await this.prisma.task.count({
      where: { id: taskId, deletedAt: null, AND: [visibility] },
    });
    if (visible === 0) {
      throw new ForbiddenException('You do not have permission to view this task.');
    }
  }

  /**
   * Builds the actor context the status machine needs: whether this user holds
   * the task, and whether they sit above the holder (manager, creator or
   * assigner) and may therefore act on their behalf.
   */
  private async actorContext(
    user: AuthenticatedUser,
    task: { currentOwnerId: string | null; createdBy?: { id: string } | null },
  ): Promise<ActorContext> {
    const isOwner = task.currentOwnerId === user.id;
    let isSupervisor = task.createdBy?.id === user.id;

    if (!isSupervisor && task.currentOwnerId && task.currentOwnerId !== user.id) {
      isSupervisor = await this.accessControl.managesUser(user, task.currentOwnerId);
    }
    return { permissions: user.permissions ?? [], isOwner, isSupervisor };
  }

  async findOne(user: AuthenticatedUser, idOrNumber: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);

    const [journey, actor, comments] = await Promise.all([
      this.journey.build(task.id),
      this.actorContext(user, task),
      this.prisma.taskComment.count({ where: { taskId: task.id, deletedAt: null } }),
    ]);

    return {
      ...this.decorate(task),
      commentCount: comments,
      journey,
      availableActions: availableTransitions(task.status, actor).map((rule) => ({
        status: rule.to,
        label: rule.label,
      })),
      viewer: {
        isOwner: actor.isOwner,
        isSupervisor: actor.isSupervisor,
        canEdit:
          actor.isOwner ||
          actor.isSupervisor ||
          (user.permissions ?? []).includes(PERMISSIONS.EDIT_TASK),
        canApprove: (user.permissions ?? []).includes(PERMISSIONS.APPROVE_TASK),
        canHandover:
          (actor.isOwner || actor.isSupervisor) &&
          (user.permissions ?? []).includes(PERMISSIONS.HANDOVER_TASK),
      },
    };
  }

  async getJourney(user: AuthenticatedUser, idOrNumber: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    return this.journey.build(task.id);
  }

  async getHistory(user: AuthenticatedUser, idOrNumber: string, page = 1, pageSize = 100) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    return this.history.findForTask(task.id, page, pageSize);
  }

  async getTiming(user: AuthenticatedUser, idOrNumber: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    return this.assignments.getTimePerHolder(task.id);
  }

  // =========================================================================
  // Creation
  // =========================================================================

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    if (dto.deadline && dto.startDate && new Date(dto.startDate) > new Date(dto.deadline)) {
      throw new BadRequestException('The deadline must fall after the start date.');
    }

    const parent = dto.parentTaskId
      ? await this.prisma.task.findFirst({
          where: { id: dto.parentTaskId, deletedAt: null },
          select: { id: true, departmentId: true, projectId: true, workflowId: true },
        })
      : null;
    if (dto.parentTaskId && !parent) {
      throw new BadRequestException('The parent task could not be found.');
    }

    const departmentId =
      dto.departmentId ??
      parent?.departmentId ??
      (dto.assigneeId ? await this.departmentOf(dto.assigneeId) : null) ??
      user.departmentId;
    const projectId = dto.projectId ?? parent?.projectId ?? null;

    // Subtasks stay inside their parent's workflow unless told otherwise.
    const workflow = dto.workflowId
      ? await this.engine.getWorkflow(dto.workflowId)
      : await this.engine.resolveDefaultWorkflow({
          taskTypeId: dto.taskTypeId,
          projectId,
          departmentId,
        });
    if (dto.workflowId && !workflow) {
      throw new BadRequestException('The selected workflow could not be found.');
    }

    const firstStage = workflow ? this.engine.getFirstStage(workflow) : null;
    const resolvedAssignee =
      dto.assigneeId ??
      (firstStage
        ? await this.engine.resolveStageAssignee(firstStage, {
            createdById: user.id,
            departmentId,
            projectId,
          })
        : null);

    const isDraft = dto.asDraft === true;
    const ownerId = isDraft ? user.id : (resolvedAssignee ?? user.id);
    const status = isDraft ? TaskStatus.DRAFT : (firstStage?.entryStatus ?? TaskStatus.ASSIGNED);
    const tagIds = dto.tags?.length ? await this.tags.resolveNames(dto.tags) : [];
    const now = new Date();

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title.trim(),
          description: dto.description ?? null,
          status,
          priority: dto.priority ?? 'MEDIUM',
          createdById: user.id,
          currentOwnerId: ownerId,
          assignedById: isDraft ? null : user.id,
          departmentId,
          projectId,
          taskTypeId: dto.taskTypeId ?? null,
          workflowId: workflow?.id ?? null,
          currentStageId: firstStage?.id ?? null,
          parentTaskId: parent?.id ?? null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          estimatedHours: dto.estimatedHours ?? null,
          ownerSince: now,
          waitingForUserId: isDraft ? null : ownerId,
          waitingReason: isDraft ? WaitingReason.NONE : WaitingReason.ACTION,
          waitingSince: isDraft ? null : now,
          tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
          watchers: {
            create: [
              ...new Set([user.id, ...(dto.watcherIds ?? [])].filter(Boolean)),
            ].map((userId) => ({ userId })),
          },
        },
        select: { id: true, number: true, title: true, status: true },
      });

      await this.assignments.openTenure(
        {
          taskId: created.id,
          userId: ownerId,
          assignedById: user.id,
          stageId: firstStage?.id ?? null,
          role: AssignmentRole.OWNER,
          at: now,
        },
        tx,
      );

      await this.history.record(
        {
          taskId: created.id,
          actorId: user.id,
          action: HistoryAction.TASK_CREATED,
          summary: 'Created ' + taskRef(created),
          toValue: status,
          metadata: { workflowId: workflow?.id ?? null, stageId: firstStage?.id ?? null },
        },
        tx,
      );

      if (!isDraft) {
        await this.history.record(
          {
            taskId: created.id,
            actorId: user.id,
            action: HistoryAction.TASK_ASSIGNED,
            summary: 'Assigned the task to ' + (await this.nameOf(ownerId, tx)),
            toValue: ownerId,
            metadata: { stageId: firstStage?.id ?? null },
          },
          tx,
        );
      }

      if (parent) {
        await tx.task.update({
          where: { id: parent.id },
          data: { subtaskCount: { increment: 1 } },
        });
      }

      return created;
    });

    if (!isDraft && ownerId !== user.id) {
      await this.notifications.notify({
        userId: ownerId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'New task assigned: ' + taskRef(task),
        body: dto.description?.slice(0, 200) ?? null,
        taskId: task.id,
        link: '/tasks/' + task.number,
        email: { actorName: user.firstName + ' ' + user.lastName },
        skipUserId: user.id,
      });
    }

    await this.audit.record({
      actorId: user.id,
      action: 'task.created',
      resourceType: 'Task',
      resourceId: task.id,
      summary: 'Created task ' + taskRef(task),
      departmentId,
      after: { title: task.title, status, ownerId },
    });

    return this.findOne(user, task.id);
  }

  private async departmentOf(userId: string): Promise<string | null> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return found?.departmentId ?? null;
  }

  private async nameOf(userId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const found = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return found ? found.firstName + ' ' + found.lastName : 'an employee';
  }

  // =========================================================================
  // Field edits
  // =========================================================================

  async update(user: AuthenticatedUser, idOrNumber: string, dto: UpdateTaskDto) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    const actor = await this.actorContext(user, task);

    const mayEdit =
      actor.isOwner || actor.isSupervisor || (user.permissions ?? []).includes(PERMISSIONS.EDIT_TASK);
    if (!mayEdit) {
      throw new ForbiddenException('You do not have permission to edit this task.');
    }
    if (TERMINAL_STATUSES.includes(task.status) && dto.progress === undefined) {
      throw new BadRequestException('This task is closed and can no longer be edited.');
    }

    const tagIds = dto.tags ? await this.tags.resolveNames(dto.tags) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const events: Array<Parameters<TaskHistoryService['record']>[0]> = [];

      if (dto.priority && dto.priority !== task.priority) {
        events.push({
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.PRIORITY_CHANGED,
          summary: 'Changed priority from ' + task.priority + ' to ' + dto.priority,
          fromValue: task.priority,
          toValue: dto.priority,
          comment: dto.reason ?? null,
        });
      }

      const newDeadline = dto.deadline ? new Date(dto.deadline) : undefined;
      if (newDeadline && newDeadline.getTime() !== task.deadline?.getTime()) {
        events.push({
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.DEADLINE_CHANGED,
          summary:
            'Moved the deadline to ' + newDeadline.toDateString() +
            (task.deadline ? ' (was ' + task.deadline.toDateString() + ')' : ''),
          fromValue: task.deadline?.toISOString() ?? null,
          toValue: newDeadline.toISOString(),
          comment: dto.reason ?? null,
        });
      }

      const changedFields = Object.keys(dto).filter(
        (key) => !['reason', 'priority', 'deadline'].includes(key),
      );
      if (changedFields.length > 0) {
        events.push({
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_UPDATED,
          summary: 'Updated ' + changedFields.join(', '),
          comment: dto.reason ?? null,
        });
      }

      if (tagIds) {
        await tx.taskTag.deleteMany({ where: { taskId: task.id } });
        if (tagIds.length > 0) {
          await tx.taskTag.createMany({
            data: tagIds.map((tagId) => ({ taskId: task.id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      const result = await tx.task.update({
        where: { id: task.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
          ...(dto.projectId !== undefined ? { projectId: dto.projectId || null } : {}),
          ...(dto.taskTypeId !== undefined ? { taskTypeId: dto.taskTypeId || null } : {}),
          ...(dto.startDate !== undefined
            ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
            : {}),
          ...(dto.deadline !== undefined
            ? { deadline: dto.deadline ? new Date(dto.deadline) : null }
            : {}),
          ...(dto.estimatedHours !== undefined ? { estimatedHours: dto.estimatedHours } : {}),
          ...(dto.actualHours !== undefined ? { actualHours: dto.actualHours } : {}),
          ...(dto.progress !== undefined ? { progress: dto.progress } : {}),
        },
        select: { id: true, number: true, title: true },
      });

      await this.history.recordMany(events, tx);
      return result;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'task.updated',
      resourceType: 'Task',
      resourceId: task.id,
      summary: 'Updated task ' + taskRef(updated),
      departmentId: task.department?.id ?? null,
      before: { title: task.title, priority: task.priority, deadline: task.deadline },
      after: { title: updated.title, priority: dto.priority ?? task.priority },
    });

    return this.findOne(user, task.id);
  }

  async remove(user: AuthenticatedUser, idOrNumber: string, reason?: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);

    const openSubtasks = await this.prisma.task.count({
      where: { parentTaskId: task.id, deletedAt: null, status: { in: OPEN_STATUSES } },
    });
    if (openSubtasks > 0) {
      throw new BadRequestException(
        'This task still has ' + openSubtasks + ' open subtask(s). Close them first.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: { deletedAt: new Date(), status: TaskStatus.CANCELLED, cancelReason: reason ?? null },
      });
      await this.assignments.closeOpenTenure(task.id, new Date(), tx);
      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_CANCELLED,
          summary: 'Archived the task',
          comment: reason ?? null,
        },
        tx,
      );
      if (task.parentTaskId) {
        await tx.task.update({
          where: { id: task.parentTaskId },
          data: { subtaskCount: { decrement: 1 } },
        });
      }
    });

    await this.audit.record({
      actorId: user.id,
      action: 'task.archived',
      resourceType: 'Task',
      resourceId: task.id,
      summary: 'Archived task ' + taskRef(task),
      departmentId: task.department?.id ?? null,
    });
    return { success: true };
  }

  // =========================================================================
  // Ownership moves - assignment, handover, submission, review
  // =========================================================================

  /**
   * The single place task ownership ever changes.
   *
   * Closes the outgoing tenure, opens the incoming one and updates the
   * denormalised "who has it now / what is it waiting for" columns in the same
   * transaction, so the ledger and the task row can never disagree.
   */
  private async moveOwnership(
    tx: Prisma.TransactionClient,
    task: { id: string; status: TaskStatus; currentOwnerId: string | null },
    actorId: string,
    move: OwnershipMove,
    at: Date = new Date(),
  ): Promise<void> {
    await this.assignments.openTenure(
      {
        taskId: task.id,
        userId: move.toUserId,
        assignedById: actorId,
        stageId: move.stageId ?? null,
        role: move.role ?? AssignmentRole.OWNER,
        note: move.note ?? null,
        at,
      },
      tx,
    );

    const isFinished = move.status === TaskStatus.COMPLETED;
    await tx.task.update({
      where: { id: task.id },
      data: {
        currentOwnerId: move.toUserId,
        assignedById: actorId,
        ownerSince: at,
        status: move.status,
        ...(move.stageId !== undefined ? { currentStageId: move.stageId } : {}),
        waitingForUserId: isFinished ? null : move.toUserId,
        waitingReason: isFinished ? WaitingReason.NONE : move.waitingReason,
        waitingSince: isFinished ? null : at,
        ...(move.status === TaskStatus.SUBMITTED ? { submittedAt: at } : {}),
        ...(move.status === TaskStatus.APPROVED ? { approvedAt: at } : {}),
        ...(isFinished ? { completedAt: at, progress: 100 } : {}),
      },
    });
  }

  async assign(user: AuthenticatedUser, idOrNumber: string, dto: AssignTaskDto) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);

    if (!(user.permissions ?? []).includes(PERMISSIONS.ASSIGN_TASK)) {
      throw new ForbiddenException('You do not have permission to assign tasks.');
    }
    await this.assertAssignable(dto.assigneeId);

    const target =
      task.status === TaskStatus.DRAFT || task.status === TaskStatus.ASSIGNED
        ? TaskStatus.ASSIGNED
        : task.status;
    if (target !== task.status) assertTransition(task.status, target);
    if (task.currentOwnerId === dto.assigneeId) {
      throw new BadRequestException('This task is already with that employee.');
    }

    const previousOwnerId = task.currentOwnerId;
    const name = await this.nameOf(dto.assigneeId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.moveOwnership(
        tx,
        task,
        user.id,
        {
          toUserId: dto.assigneeId,
          stageId: dto.stageId ?? task.currentStage?.id ?? null,
          note: dto.note ?? null,
          waitingReason: WaitingReason.ACTION,
          status: TaskStatus.ASSIGNED,
        },
        now,
      );

      if (dto.deadline) {
        await tx.task.update({
          where: { id: task.id },
          data: { deadline: new Date(dto.deadline) },
        });
      }

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: previousOwnerId ? HistoryAction.TASK_REASSIGNED : HistoryAction.TASK_ASSIGNED,
          summary: (previousOwnerId ? 'Reassigned the task to ' : 'Assigned the task to ') + name,
          fromValue: previousOwnerId,
          toValue: dto.assigneeId,
          comment: dto.note ?? null,
        },
        tx,
      );
    });

    await this.notifications.notify({
      userId: dto.assigneeId,
      type: NotificationType.TASK_ASSIGNED,
      title: 'Task assigned to you: ' + taskRef(task),
      body: dto.note ?? null,
      taskId: task.id,
      link: '/tasks/' + task.number,
      email: { actorName: user.firstName + ' ' + user.lastName },
      skipUserId: user.id,
    });

    await this.audit.record({
      actorId: user.id,
      action: 'task.assigned',
      resourceType: 'Task',
      resourceId: task.id,
      summary: 'Assigned task ' + taskRef(task) + ' to ' + name,
      departmentId: task.department?.id ?? null,
      before: { ownerId: previousOwnerId },
      after: { ownerId: dto.assigneeId },
    });

    return this.findOne(user, task.id);
  }

  private async assertAssignable(userId: string): Promise<void> {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!target) {
      throw new BadRequestException('That employee cannot receive tasks (inactive or removed).');
    }
  }

  /** Owner starts work: ASSIGNED / CHANGES_REQUESTED / BLOCKED -> IN_PROGRESS. */
  async start(user: AuthenticatedUser, idOrNumber: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    const actor = await this.actorContext(user, task);

    if (!actor.isOwner && !actor.isSupervisor) {
      throw new ForbiddenException('Only the current owner can start this task.');
    }
    assertTransition(task.status, TaskStatus.IN_PROGRESS);

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.IN_PROGRESS,
          startDate: task.startDate ?? new Date(),
          blockedReason: null,
          waitingReason: WaitingReason.ACTION,
          waitingForUserId: task.currentOwnerId,
          waitingSince: new Date(),
        },
      });
      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_STARTED,
          summary: 'Started working on the task',
          fromValue: task.status,
          toValue: TaskStatus.IN_PROGRESS,
        },
        tx,
      );
    });

    return this.findOne(user, task.id);
  }

  /**
   * Submit finished work. When the workflow defines a next stage the task is
   * routed there automatically; otherwise it goes to the named reviewer, and
   * failing both, to the person who assigned or created it.
   */
  async submit(user: AuthenticatedUser, idOrNumber: string, dto: SubmitTaskDto) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    const actor = await this.actorContext(user, task);

    if (!actor.isOwner && !actor.isSupervisor) {
      throw new ForbiddenException('Only the current owner can submit this task.');
    }
    if (!(user.permissions ?? []).includes(PERMISSIONS.SUBMIT_TASK)) {
      throw new ForbiddenException('You do not have permission to submit tasks.');
    }
    assertTransition(task.status, TaskStatus.SUBMITTED);

    const routing = await this.resolveNextHolder(task, dto.reviewerId);
    const now = new Date();
    const submitterName = user.firstName + ' ' + user.lastName;

    await this.prisma.$transaction(async (tx) => {
      await this.moveOwnership(
        tx,
        task,
        user.id,
        {
          toUserId: routing.userId,
          stageId: routing.stageId,
          role: routing.role,
          note: dto.note ?? null,
          waitingReason: routing.waitingReason,
          status: TaskStatus.SUBMITTED,
        },
        now,
      );

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_SUBMITTED,
          summary: 'Submitted the work to ' + routing.name + ' for review',
          fromValue: task.status,
          toValue: TaskStatus.SUBMITTED,
          comment: dto.note ?? null,
          metadata: { stageId: routing.stageId, reviewerId: routing.userId },
        },
        tx,
      );

      if (routing.requiresApproval) {
        await tx.approval.create({
          data: {
            taskId: task.id,
            stageId: routing.stageId,
            approverId: routing.userId,
            requestedById: user.id,
            sequence: (await tx.approval.count({ where: { taskId: task.id } })) + 1,
            dueAt: task.deadline,
          },
        });
        await this.history.record(
          {
            taskId: task.id,
            actorId: user.id,
            action: HistoryAction.APPROVAL_REQUESTED,
            summary: 'Requested approval from ' + routing.name,
            toValue: routing.userId,
          },
          tx,
        );
      }
    });

    await this.notifications.notify({
      userId: routing.userId,
      type: routing.requiresApproval
        ? NotificationType.APPROVAL_REQUESTED
        : NotificationType.TASK_SUBMITTED,
      title:
        (routing.requiresApproval ? 'Approval requested: ' : 'Work submitted for review: ') +
        taskRef(task),
      body: dto.note ?? null,
      taskId: task.id,
      link: '/tasks/' + task.number,
      email: { actorName: submitterName },
      skipUserId: user.id,
    });

    await this.audit.record({
      actorId: user.id,
      action: 'task.submitted',
      resourceType: 'Task',
      resourceId: task.id,
      summary: submitterName + ' submitted task ' + taskRef(task),
      departmentId: task.department?.id ?? null,
      after: { reviewerId: routing.userId },
    });

    return this.findOne(user, task.id);
  }

  /**
   * Works out who a submitted task should go to next.
   * Preference order: explicit reviewer > next workflow stage > assigner >
   * creator > the owner's line manager.
   */
  private async resolveNextHolder(
    task: {
      id: string;
      workflowId?: string | null;
      currentStage?: { id: string } | null;
      currentOwnerId: string | null;
      createdBy?: { id: string } | null;
      assignedBy?: { id: string } | null;
      departmentId?: string | null;
      projectId?: string | null;
      department?: { id: string } | null;
      project?: { id: string } | null;
    },
    explicitUserId?: string,
  ): Promise<{
    userId: string;
    name: string;
    stageId: string | null;
    role: AssignmentRole;
    waitingReason: WaitingReason;
    requiresApproval: boolean;
  }> {
    if (explicitUserId) {
      await this.assertAssignable(explicitUserId);
      return {
        userId: explicitUserId,
        name: await this.nameOf(explicitUserId),
        stageId: task.currentStage?.id ?? null,
        role: AssignmentRole.REVIEWER,
        waitingReason: WaitingReason.REVIEW,
        requiresApproval: false,
      };
    }

    const workflow = task.workflowId ? await this.engine.getWorkflow(task.workflowId) : null;
    const nextStage = workflow
      ? this.engine.getNextStage(workflow, task.currentStage?.id ?? null)
      : null;

    if (nextStage) {
      const resolved = await this.engine.resolveStageAssignee(nextStage, {
        taskId: task.id,
        createdById: task.createdBy?.id ?? null,
        currentOwnerId: task.currentOwnerId,
        departmentId: task.department?.id ?? task.departmentId ?? null,
        projectId: task.project?.id ?? task.projectId ?? null,
      });
      if (resolved) {
        return {
          userId: resolved,
          name: await this.nameOf(resolved),
          stageId: nextStage.id,
          role: nextStage.type === 'APPROVAL' ? AssignmentRole.APPROVER : AssignmentRole.REVIEWER,
          waitingReason:
            nextStage.type === 'APPROVAL' ? WaitingReason.APPROVAL : WaitingReason.REVIEW,
          requiresApproval: nextStage.requiresApproval || nextStage.type === 'APPROVAL',
        };
      }
    }

    const fallback =
      task.assignedBy?.id ??
      task.createdBy?.id ??
      (task.currentOwnerId ? await this.managerOf(task.currentOwnerId) : null);

    if (!fallback) {
      throw new BadRequestException(
        'There is nobody to send this task to. Pick a reviewer before submitting.',
      );
    }

    return {
      userId: fallback,
      name: await this.nameOf(fallback),
      stageId: nextStage?.id ?? task.currentStage?.id ?? null,
      role: AssignmentRole.REVIEWER,
      waitingReason: WaitingReason.REVIEW,
      requiresApproval: false,
    };
  }

  private async managerOf(userId: string): Promise<string | null> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { managerId: true },
    });
    return found?.managerId ?? null;
  }

  /**
   * Submit & Handover. Transfers the task to a named colleague with a note
   * describing what is being asked of them.
   */
  async handover(user: AuthenticatedUser, idOrNumber: string, dto: HandoverTaskDto) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    const actor = await this.actorContext(user, task);

    if (!(user.permissions ?? []).includes(PERMISSIONS.HANDOVER_TASK)) {
      throw new ForbiddenException('You do not have permission to hand over tasks.');
    }
    if (!actor.isOwner && !actor.isSupervisor) {
      throw new ForbiddenException('Only the current owner can hand this task over.');
    }
    if (TERMINAL_STATUSES.includes(task.status)) {
      throw new BadRequestException('This task is closed and can no longer be handed over.');
    }
    if (dto.toUserId === task.currentOwnerId) {
      throw new BadRequestException('This task has already been handed over to that employee.');
    }
    await this.assertAssignable(dto.toUserId);

    const targetStatus = this.statusForHandoverAction(dto.action);
    assertTransition(task.status, targetStatus);

    const stageId = dto.stageId ?? (await this.stageForHandover(task, dto.action));
    const recipientName = await this.nameOf(dto.toUserId);
    const actorName = user.firstName + ' ' + user.lastName;
    const now = new Date();

    const roleForAction: Record<HandoverTaskDto['action'], AssignmentRole> = {
      CONTINUE: AssignmentRole.OWNER,
      SUBMIT: AssignmentRole.OWNER,
      REVIEW: AssignmentRole.REVIEWER,
      APPROVE: AssignmentRole.APPROVER,
    };
    const waitingForAction: Record<HandoverTaskDto['action'], WaitingReason> = {
      CONTINUE: WaitingReason.ACTION,
      SUBMIT: WaitingReason.ACTION,
      REVIEW: WaitingReason.REVIEW,
      APPROVE: WaitingReason.APPROVAL,
    };

    await this.prisma.$transaction(async (tx) => {
      await this.moveOwnership(
        tx,
        task,
        user.id,
        {
          toUserId: dto.toUserId,
          stageId,
          role: roleForAction[dto.action],
          note: dto.note ?? null,
          waitingReason: waitingForAction[dto.action],
          status: targetStatus,
        },
        now,
      );

      if (dto.deadline) {
        await tx.task.update({ where: { id: task.id }, data: { deadline: new Date(dto.deadline) } });
      }

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_HANDED_OVER,
          summary: 'Handed the task over to ' + recipientName + ' to ' + dto.action.toLowerCase(),
          fromValue: task.currentOwnerId,
          toValue: dto.toUserId,
          comment: dto.note ?? null,
          metadata: { action: dto.action, stageId },
        },
        tx,
      );

      if (dto.action === 'APPROVE') {
        await tx.approval.create({
          data: {
            taskId: task.id,
            stageId,
            approverId: dto.toUserId,
            requestedById: user.id,
            sequence: (await tx.approval.count({ where: { taskId: task.id } })) + 1,
            dueAt: task.deadline,
          },
        });
      }
    });

    await this.notifications.notify({
      userId: dto.toUserId,
      type:
        dto.action === 'APPROVE'
          ? NotificationType.APPROVAL_REQUESTED
          : NotificationType.TASK_HANDED_OVER,
      title: 'Task handed over to you: ' + taskRef(task),
      body: dto.note ?? null,
      taskId: task.id,
      link: '/tasks/' + task.number,
      email: { actorName },
      skipUserId: user.id,
    });

    // Keep the originator informed that their work moved on.
    await this.notifications.notifyMany(
      [task.createdBy?.id, task.assignedBy?.id],
      {
        type: NotificationType.TASK_HANDED_OVER,
        title: taskRef(task) + ' moved to ' + recipientName,
        body: dto.note ?? null,
        taskId: task.id,
        link: '/tasks/' + task.number,
        email: { actorName },
        skipUserId: user.id,
      },
    );

    await this.audit.record({
      actorId: user.id,
      action: 'task.handed_over',
      resourceType: 'Task',
      resourceId: task.id,
      summary: actorName + ' handed task ' + taskRef(task) + ' to ' + recipientName,
      departmentId: task.department?.id ?? null,
      before: { ownerId: task.currentOwnerId, status: task.status },
      after: { ownerId: dto.toUserId, status: targetStatus, action: dto.action },
    });

    return this.findOne(user, task.id);
  }

  private statusForHandoverAction(action: HandoverTaskDto['action']): TaskStatus {
    switch (action) {
      case 'REVIEW':
        return TaskStatus.UNDER_REVIEW;
      case 'APPROVE':
      case 'SUBMIT':
        return TaskStatus.SUBMITTED;
      default:
        return TaskStatus.ASSIGNED;
    }
  }

  private async stageForHandover(
    task: { workflowId?: string | null; currentStage?: { id: string } | null },
    action: HandoverTaskDto['action'],
  ): Promise<string | null> {
    if (!task.workflowId) return null;
    if (action === 'CONTINUE') return task.currentStage?.id ?? null;
    const workflow = await this.engine.getWorkflow(task.workflowId);
    if (!workflow) return null;
    const next = this.engine.getNextStage(workflow, task.currentStage?.id ?? null);
    return next?.id ?? task.currentStage?.id ?? null;
  }

  /** Reviewer takes a submitted task under review. */
  async startReview(user: AuthenticatedUser, idOrNumber: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);

    if (!(user.permissions ?? []).includes(PERMISSIONS.REVIEW_TASK)) {
      throw new ForbiddenException('You do not have permission to review tasks.');
    }
    assertTransition(task.status, TaskStatus.UNDER_REVIEW);

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.UNDER_REVIEW,
          waitingReason: WaitingReason.REVIEW,
          waitingForUserId: task.currentOwnerId ?? user.id,
          waitingSince: new Date(),
        },
      });
      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_REVIEW_STARTED,
          summary: 'Started reviewing the submission',
          fromValue: task.status,
          toValue: TaskStatus.UNDER_REVIEW,
        },
        tx,
      );
    });

    return this.findOne(user, task.id);
  }

  /**
   * Approve, request changes, or reject.
   *
   * Approving advances the workflow: if another stage follows, the task moves
   * there; if not, it is completed. Requesting changes or rejecting returns
   * the task to whoever submitted it, with the reason recorded.
   */
  async review(user: AuthenticatedUser, idOrNumber: string, dto: ReviewTaskDto) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);

    const needsReason = dto.decision !== 'APPROVE';
    if (needsReason && !dto.comment?.trim()) {
      throw new BadRequestException(
        'Please explain what needs to change so the task can move forward.',
      );
    }

    const permission =
      dto.decision === 'APPROVE' ? PERMISSIONS.APPROVE_TASK : PERMISSIONS.REVIEW_TASK;
    if (!(user.permissions ?? []).includes(permission)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return dto.decision === 'APPROVE'
      ? this.approve(user, task, dto)
      : this.sendBack(user, task, dto);
  }

  private async approve(
    user: AuthenticatedUser,
    task: Awaited<ReturnType<TasksService['loadTask']>>,
    dto: ReviewTaskDto,
  ) {
    assertTransition(task.status, TaskStatus.APPROVED);

    const workflow = task.workflow?.id ? await this.engine.getWorkflow(task.workflow.id) : null;
    const nextStage = workflow
      ? this.engine.getNextStage(workflow, task.currentStage?.id ?? null)
      : null;

    const nextHolderId = nextStage
      ? await this.engine.resolveStageAssignee(nextStage, {
          taskId: task.id,
          createdById: task.createdBy?.id ?? null,
          currentOwnerId: task.currentOwnerId,
          departmentId: task.department?.id ?? null,
          projectId: task.project?.id ?? null,
        })
      : null;

    const completesNow = !nextStage || nextStage.isFinal || !nextHolderId;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.approval.updateMany({
        where: { taskId: task.id, approverId: user.id, status: 'PENDING' },
        data: { status: 'APPROVED', comment: dto.comment ?? null, decidedAt: now },
      });

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_APPROVED,
          summary: 'Approved the task',
          fromValue: task.status,
          toValue: TaskStatus.APPROVED,
          comment: dto.comment ?? null,
        },
        tx,
      );

      if (completesNow) {
        await this.assignments.closeOpenTenure(task.id, now, tx);
        await tx.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.COMPLETED,
            approvedAt: now,
            completedAt: now,
            progress: 100,
            waitingForUserId: null,
            waitingReason: WaitingReason.NONE,
            waitingSince: null,
            ...(nextStage?.isFinal ? { currentStageId: nextStage.id } : {}),
          },
        });
        await this.history.record(
          {
            taskId: task.id,
            actorId: user.id,
            action: HistoryAction.TASK_COMPLETED,
            summary: 'Task completed',
            toValue: TaskStatus.COMPLETED,
          },
          tx,
        );
        if (task.parentTaskId) {
          await tx.task.update({
            where: { id: task.parentTaskId },
            data: { completedSubtaskCount: { increment: 1 } },
          });
        }
      } else {
        await this.moveOwnership(
          tx,
          task,
          user.id,
          {
            toUserId: nextHolderId as string,
            stageId: nextStage.id,
            role:
              nextStage.type === 'APPROVAL' ? AssignmentRole.APPROVER : AssignmentRole.OWNER,
            note: dto.comment ?? null,
            waitingReason: this.engine.waitingReasonFor(nextStage) as WaitingReason,
            status: nextStage.entryStatus,
          },
          now,
        );
        await this.history.record(
          {
            taskId: task.id,
            actorId: user.id,
            action: HistoryAction.WORKFLOW_STAGE_ADVANCED,
            summary:
              'Advanced the task to "' + nextStage.name + '" with ' +
              (await this.nameOf(nextHolderId as string, tx)),
            toValue: nextStage.id,
          },
          tx,
        );
      }
    });

    const recipients = completesNow
      ? [task.createdBy?.id, task.currentOwner?.id, ...task.watchers.map((w) => w.user.id)]
      : [nextHolderId];

    await this.notifications.notifyMany(recipients, {
      type: completesNow ? NotificationType.TASK_COMPLETED : NotificationType.TASK_APPROVED,
      title: completesNow
        ? 'Task completed: ' + taskRef(task)
        : 'Task approved and moved on: ' + taskRef(task),
      body: dto.comment ?? null,
      taskId: task.id,
      link: '/tasks/' + task.number,
      email: { actorName: user.firstName + ' ' + user.lastName },
      skipUserId: user.id,
    });

    await this.audit.record({
      actorId: user.id,
      action: completesNow ? 'task.completed' : 'task.approved',
      resourceType: 'Task',
      resourceId: task.id,
      summary:
        user.firstName + ' ' + user.lastName +
        (completesNow ? ' completed task ' : ' approved task ') + taskRef(task),
      departmentId: task.department?.id ?? null,
      before: { status: task.status },
      after: { status: completesNow ? TaskStatus.COMPLETED : TaskStatus.APPROVED },
    });

    return this.findOne(user, task.id);
  }

  /** Rejection / changes requested: the task goes back with a reason. */
  private async sendBack(
    user: AuthenticatedUser,
    task: Awaited<ReturnType<TasksService['loadTask']>>,
    dto: ReviewTaskDto,
  ) {
    const targetStatus = TaskStatus.CHANGES_REQUESTED;
    assertTransition(task.status, targetStatus);

    // Back to whoever last held it, unless the reviewer names someone else.
    const previousWorker = await this.assignments.getPreviousHolder(task.id);

    const returnToId =
      dto.returnToUserId ?? previousWorker?.userId ?? task.createdBy?.id ?? task.currentOwnerId;
    if (!returnToId) {
      throw new BadRequestException('There is nobody to send this task back to.');
    }
    await this.assertAssignable(returnToId);

    const isRejection = dto.decision === 'REJECT';
    const actorName = user.firstName + ' ' + user.lastName;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.approval.updateMany({
        where: { taskId: task.id, approverId: user.id, status: 'PENDING' },
        data: {
          status: isRejection ? 'REJECTED' : 'CHANGES_REQUESTED',
          comment: dto.comment ?? null,
          decidedAt: now,
        },
      });

      await this.moveOwnership(
        tx,
        task,
        user.id,
        {
          toUserId: returnToId,
          stageId: previousWorker?.stageId ?? task.currentStage?.id ?? null,
          role: AssignmentRole.OWNER,
          note: dto.comment ?? null,
          waitingReason: WaitingReason.ACTION,
          status: targetStatus,
        },
        now,
      );

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: isRejection ? HistoryAction.TASK_REJECTED : HistoryAction.CHANGES_REQUESTED,
          summary:
            (isRejection ? 'Rejected the submission' : 'Requested changes') +
            ' and sent the task back to ' + (await this.nameOf(returnToId, tx)),
          fromValue: task.status,
          toValue: targetStatus,
          comment: dto.comment ?? null,
        },
        tx,
      );
    });

    await this.notifications.notify({
      userId: returnToId,
      type: isRejection ? NotificationType.TASK_REJECTED : NotificationType.CHANGES_REQUESTED,
      title: (isRejection ? 'Task rejected: ' : 'Changes requested: ') + taskRef(task),
      body: dto.comment ?? null,
      taskId: task.id,
      link: '/tasks/' + task.number,
      email: { actorName },
      skipUserId: user.id,
    });

    await this.audit.record({
      actorId: user.id,
      action: isRejection ? 'task.rejected' : 'task.changes_requested',
      resourceType: 'Task',
      resourceId: task.id,
      summary:
        actorName + (isRejection ? ' rejected task ' : ' requested changes on task ') + taskRef(task),
      departmentId: task.department?.id ?? null,
      before: { status: task.status },
      after: { status: targetStatus, returnedTo: returnToId },
    });

    return this.findOne(user, task.id);
  }

  // =========================================================================
  // Status, waiting state and watchers
  // =========================================================================

  /** Generic guarded status change used by the Kanban board and status menu. */
  async changeStatus(user: AuthenticatedUser, idOrNumber: string, dto: ChangeStatusDto) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    const actor = await this.actorContext(user, task);

    if (dto.status === task.status) {
      throw new BadRequestException('The task is already in that status.');
    }

    // Route through the richer handlers where one exists, so their side
    // effects (routing, approvals, notifications) are never bypassed.
    if (dto.status === TaskStatus.IN_PROGRESS && task.status !== TaskStatus.BLOCKED) {
      return this.start(user, idOrNumber);
    }
    if (dto.status === TaskStatus.SUBMITTED) {
      return this.submit(user, idOrNumber, { note: dto.reason });
    }
    if (dto.status === TaskStatus.UNDER_REVIEW) {
      return this.startReview(user, idOrNumber);
    }
    if (dto.status === TaskStatus.APPROVED || dto.status === TaskStatus.COMPLETED) {
      return this.review(user, idOrNumber, { decision: 'APPROVE', comment: dto.reason });
    }
    if (dto.status === TaskStatus.CHANGES_REQUESTED) {
      return this.review(user, idOrNumber, { decision: 'REQUEST_CHANGES', comment: dto.reason });
    }

    const rule = assertTransition(task.status, dto.status);
    if (rule.permission && !(user.permissions ?? []).includes(rule.permission)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }
    if (rule.ownerOnly && !actor.isOwner && !actor.isSupervisor) {
      throw new ForbiddenException('Only the current owner can perform this action.');
    }

    const blocking = dto.status === TaskStatus.BLOCKED;
    const cancelling = dto.status === TaskStatus.CANCELLED;
    if ((blocking || cancelling) && !dto.reason?.trim()) {
      throw new BadRequestException(
        'Please give a reason so the rest of the team understands why.',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (cancelling) await this.assignments.closeOpenTenure(task.id, now, tx);

      await tx.task.update({
        where: { id: task.id },
        data: {
          status: dto.status,
          ...(blocking
            ? { blockedReason: dto.reason ?? null, waitingReason: WaitingReason.BLOCKED }
            : {}),
          ...(cancelling
            ? {
                cancelReason: dto.reason ?? null,
                waitingForUserId: null,
                waitingReason: WaitingReason.NONE,
                waitingSince: null,
              }
            : {}),
          ...(task.status === TaskStatus.BLOCKED && !blocking
            ? { blockedReason: null, waitingReason: WaitingReason.ACTION }
            : {}),
        },
      });

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: this.historyActionForStatus(task.status, dto.status),
          summary: 'Changed the status from ' + task.status + ' to ' + dto.status,
          fromValue: task.status,
          toValue: dto.status,
          comment: dto.reason ?? null,
        },
        tx,
      );
    });

    if (blocking) {
      await this.notifications.notifyMany(
        [task.createdBy?.id, task.assignedBy?.id, ...task.watchers.map((w) => w.user.id)],
        {
          type: NotificationType.TASK_BLOCKED,
          title: 'Task blocked: ' + taskRef(task),
          body: dto.reason ?? null,
          taskId: task.id,
          link: '/tasks/' + task.number,
          email: { actorName: user.firstName + ' ' + user.lastName },
          skipUserId: user.id,
        },
      );
    }

    await this.audit.record({
      actorId: user.id,
      action: 'task.status_changed',
      resourceType: 'Task',
      resourceId: task.id,
      summary: 'Moved task ' + taskRef(task) + ' to ' + dto.status,
      departmentId: task.department?.id ?? null,
      before: { status: task.status },
      after: { status: dto.status },
    });

    return this.findOne(user, task.id);
  }

  private historyActionForStatus(from: TaskStatus, to: TaskStatus): HistoryAction {
    if (to === TaskStatus.BLOCKED) return HistoryAction.TASK_BLOCKED;
    if (from === TaskStatus.BLOCKED) return HistoryAction.TASK_UNBLOCKED;
    if (to === TaskStatus.CANCELLED) return HistoryAction.TASK_CANCELLED;
    if (to === TaskStatus.COMPLETED) return HistoryAction.TASK_COMPLETED;
    if (from === TaskStatus.COMPLETED || from === TaskStatus.CANCELLED) {
      return HistoryAction.TASK_REOPENED;
    }
    return HistoryAction.STATUS_CHANGED;
  }

  /** Explicit "waiting for" marker, e.g. waiting for documents from finance. */
  async setWaiting(user: AuthenticatedUser, idOrNumber: string, dto: SetWaitingDto) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    const actor = await this.actorContext(user, task);
    if (!actor.isOwner && !actor.isSupervisor) {
      throw new ForbiddenException('Only the current owner can change what this task waits for.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          waitingReason: dto.reason,
          waitingForUserId: dto.waitingForUserId ?? task.currentOwnerId,
          waitingSince: new Date(),
        },
      });
      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.TASK_UPDATED,
          summary: 'Marked the task as waiting for ' + dto.reason.toLowerCase().replace('_', ' '),
          fromValue: task.waitingReason,
          toValue: dto.reason,
        },
        tx,
      );
    });

    if (dto.waitingForUserId && dto.waitingForUserId !== user.id) {
      await this.notifications.notify({
        userId: dto.waitingForUserId,
        type: NotificationType.SYSTEM,
        title: taskRef(task) + ' is waiting for you',
        body: 'Reason: ' + dto.reason,
        taskId: task.id,
        link: '/tasks/' + task.number,
        skipUserId: user.id,
      });
    }

    return this.findOne(user, task.id);
  }

  async changePriority(user: AuthenticatedUser, idOrNumber: string, dto: ChangePriorityDto) {
    return this.update(user, idOrNumber, { priority: dto.priority, reason: dto.reason });
  }

  async changeDeadline(user: AuthenticatedUser, idOrNumber: string, dto: ChangeDeadlineDto) {
    return this.update(user, idOrNumber, { deadline: dto.deadline, reason: dto.reason });
  }

  async addWatcher(user: AuthenticatedUser, idOrNumber: string, userId: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    await this.prisma.taskWatcher.upsert({
      where: { taskId_userId: { taskId: task.id, userId } },
      create: { taskId: task.id, userId },
      update: {},
    });
    return { success: true };
  }

  async removeWatcher(user: AuthenticatedUser, idOrNumber: string, userId: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);
    await this.prisma.taskWatcher.deleteMany({ where: { taskId: task.id, userId } });
    return { success: true };
  }

  /** Employees this user may hand a task to, grouped for the handover modal. */
  async handoverCandidates(user: AuthenticatedUser, idOrNumber: string, search?: string) {
    const task = await this.loadTask(idOrNumber);
    await this.assertCanView(user, task.id);

    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        id: { not: task.currentOwnerId ?? undefined },
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
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        position: { select: { id: true, title: true, level: true } },
        department: { select: { id: true, name: true, color: true } },
        _count: { select: { ownedTasks: { where: { deletedAt: null, status: { in: OPEN_STATUSES } } } } },
      },
      orderBy: [{ firstName: 'asc' }],
      take: 100,
    });

    // The workflow's own suggestion goes first so the common path is one click.
    let suggestedId: string | null = null;
    if (task.workflow?.id) {
      const workflow = await this.engine.getWorkflow(task.workflow.id);
      const next = workflow ? this.engine.getNextStage(workflow, task.currentStage?.id ?? null) : null;
      if (next) {
        suggestedId = await this.engine.resolveStageAssignee(next, {
          taskId: task.id,
          createdById: task.createdBy?.id ?? null,
          currentOwnerId: task.currentOwnerId,
          departmentId: task.department?.id ?? null,
          projectId: task.project?.id ?? null,
        });
      }
    }

    return {
      suggestedUserId: suggestedId,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        activeTaskCount: candidate._count.ownedTasks,
        isSuggested: candidate.id === suggestedId,
      })),
    };
  }
}
