import { Injectable, Logger } from '@nestjs/common';
import { AssigneeMode, Prisma, StageType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const STAGE_INCLUDE = {
  stages: {
    orderBy: { order: 'asc' },
    include: {
      assigneeUser: { select: { id: true, firstName: true, lastName: true } },
      position: { select: { id: true, title: true } },
      role: { select: { id: true, key: true, name: true } },
    },
  },
  transitions: true,
} satisfies Prisma.TaskWorkflowInclude;

export type WorkflowWithStages = Prisma.TaskWorkflowGetPayload<{ include: typeof STAGE_INCLUDE }>;
export type WorkflowStageNode = WorkflowWithStages['stages'][number];

export interface AssigneeResolutionContext {
  taskId?: string | null;
  createdById?: string | null;
  currentOwnerId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
}

/**
 * The workflow engine.
 *
 * Knows how a task moves from one stage to the next and who should hold it at
 * each stage. Kept deliberately separate from `TasksService` so the routing
 * rules can be unit-tested and reasoned about on their own.
 */
@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getWorkflow(workflowId: string): Promise<WorkflowWithStages | null> {
    return this.prisma.taskWorkflow.findFirst({
      where: { id: workflowId, deletedAt: null },
      include: STAGE_INCLUDE,
    });
  }

  /**
   * Picks the workflow a new task should follow when the creator did not
   * choose one: most specific match wins (task type + project > project >
   * task type > department > global default).
   */
  async resolveDefaultWorkflow(criteria: {
    taskTypeId?: string | null;
    projectId?: string | null;
    departmentId?: string | null;
  }): Promise<WorkflowWithStages | null> {
    const candidates = await this.prisma.taskWorkflow.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [
          { taskTypeId: criteria.taskTypeId ?? undefined, projectId: criteria.projectId ?? undefined },
          { projectId: criteria.projectId ?? undefined },
          { taskTypeId: criteria.taskTypeId ?? undefined },
          { departmentId: criteria.departmentId ?? undefined },
          { isDefault: true },
        ],
      },
      include: STAGE_INCLUDE,
    });
    if (candidates.length === 0) return null;

    const score = (workflow: WorkflowWithStages): number => {
      let value = 0;
      if (criteria.projectId && workflow.projectId === criteria.projectId) value += 8;
      if (criteria.taskTypeId && workflow.taskTypeId === criteria.taskTypeId) value += 4;
      if (criteria.departmentId && workflow.departmentId === criteria.departmentId) value += 2;
      if (workflow.isDefault) value += 1;
      return value;
    };

    return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  getFirstStage(workflow: WorkflowWithStages): WorkflowStageNode | null {
    return workflow.stages[0] ?? null;
  }

  /**
   * Next stage after `currentStageId`. Uses the explicit transition graph when
   * the workflow defines one, otherwise falls back to linear order.
   */
  getNextStage(
    workflow: WorkflowWithStages,
    currentStageId: string | null,
  ): WorkflowStageNode | null {
    if (!currentStageId) return this.getFirstStage(workflow);

    const explicit = workflow.transitions.filter(
      (transition) => transition.fromStageId === currentStageId,
    );
    if (explicit.length > 0) {
      const target = workflow.stages.find((stage) => stage.id === explicit[0].toStageId);
      if (target) return target;
    }

    const currentIndex = workflow.stages.findIndex((stage) => stage.id === currentStageId);
    if (currentIndex === -1) return null;
    return workflow.stages[currentIndex + 1] ?? null;
  }

  /** Previous stage - used when a reviewer sends work back for changes. */
  getPreviousStage(
    workflow: WorkflowWithStages,
    currentStageId: string | null,
  ): WorkflowStageNode | null {
    if (!currentStageId) return null;
    const explicit = workflow.transitions.filter(
      (transition) => transition.toStageId === currentStageId,
    );
    if (explicit.length > 0) {
      const source = workflow.stages.find((stage) => stage.id === explicit[0].fromStageId);
      if (source) return source;
    }
    const currentIndex = workflow.stages.findIndex((stage) => stage.id === currentStageId);
    if (currentIndex <= 0) return null;
    return workflow.stages[currentIndex - 1] ?? null;
  }

  /** Every stage reachable from the current one (for handover suggestions). */
  getReachableStages(
    workflow: WorkflowWithStages,
    currentStageId: string | null,
  ): WorkflowStageNode[] {
    if (!currentStageId) return workflow.stages.slice(0, 1);
    const explicit = workflow.transitions.filter(
      (transition) => transition.fromStageId === currentStageId,
    );
    if (explicit.length > 0) {
      return workflow.stages.filter((stage) =>
        explicit.some((transition) => transition.toStageId === stage.id),
      );
    }
    const next = this.getNextStage(workflow, currentStageId);
    return next ? [next] : [];
  }

  /**
   * Works out which employee should hold the task when it enters `stage`.
   * Returns null when the stage is deliberately unassigned - the caller then
   * asks the user to pick someone.
   */
  async resolveStageAssignee(
    stage: {
      assigneeMode: AssigneeMode;
      assigneeUserId: string | null;
      positionId: string | null;
      roleId: string | null;
    },
    context: AssigneeResolutionContext,
  ): Promise<string | null> {
    switch (stage.assigneeMode) {
      case AssigneeMode.SPECIFIC_USER:
        return stage.assigneeUserId;

      case AssigneeMode.POSITION:
        return stage.positionId ? this.firstUserByPosition(stage.positionId, context.departmentId) : null;

      case AssigneeMode.ROLE:
        return stage.roleId ? this.firstUserByRole(stage.roleId, context.departmentId) : null;

      case AssigneeMode.DEPARTMENT_HEAD: {
        if (!context.departmentId) return null;
        const department = await this.prisma.department.findUnique({
          where: { id: context.departmentId },
          select: { headUserId: true },
        });
        return department?.headUserId ?? null;
      }

      case AssigneeMode.PROJECT_MANAGER: {
        if (!context.projectId) return null;
        const project = await this.prisma.project.findUnique({
          where: { id: context.projectId },
          select: { managerId: true },
        });
        return project?.managerId ?? null;
      }

      case AssigneeMode.MANAGER_OF_PREVIOUS: {
        if (!context.currentOwnerId) return null;
        const owner = await this.prisma.user.findUnique({
          where: { id: context.currentOwnerId },
          select: { managerId: true },
        });
        return owner?.managerId ?? null;
      }

      case AssigneeMode.TASK_CREATOR:
        return context.createdById ?? null;

      default:
        return null;
    }
  }

  private async firstUserByPosition(
    positionId: string,
    departmentId?: string | null,
  ): Promise<string | null> {
    const users = await this.prisma.user.findMany({
      where: { positionId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, departmentId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (users.length === 0) return null;
    const sameDepartment = users.find((user) => user.departmentId === departmentId);
    return (sameDepartment ?? users[0]).id;
  }

  private async firstUserByRole(
    roleId: string,
    departmentId?: string | null,
  ): Promise<string | null> {
    const users = await this.prisma.user.findMany({
      where: { roleId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, departmentId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (users.length === 0) return null;
    const sameDepartment = users.find((user) => user.departmentId === departmentId);
    return (sameDepartment ?? users[0]).id;
  }

  /** Status a task takes when it enters a stage. */
  entryStatusFor(stage: { type: StageType; entryStatus: TaskStatus; isFinal: boolean }): TaskStatus {
    if (stage.isFinal) return TaskStatus.COMPLETED;
    return stage.entryStatus;
  }

  /** Human label describing what a stage is waiting for. */
  waitingReasonFor(stage: { type: StageType }): 'ACTION' | 'REVIEW' | 'APPROVAL' {
    switch (stage.type) {
      case StageType.REVIEW:
        return 'REVIEW';
      case StageType.APPROVAL:
        return 'APPROVAL';
      default:
        return 'ACTION';
    }
  }
}
