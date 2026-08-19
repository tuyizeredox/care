import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { durationSeconds, humanizeDuration } from '../../common/utils/date.util';
import { WorkflowEngineService } from '../workflows/workflow-engine.service';
import { TaskAssignmentService } from './task-assignment.service';

export type JourneyStepKind = 'CREATED' | 'HANDLED' | 'CURRENT' | 'UPCOMING' | 'FINISH';
export type JourneyStepState = 'completed' | 'current' | 'upcoming';

export interface JourneyStep {
  kind: JourneyStepKind;
  state: JourneyStepState;
  sequence: number;
  title: string;
  person: {
    id: string;
    name: string;
    avatarUrl: string | null;
    position: string | null;
    department: { id: string; name: string; color: string } | null;
  } | null;
  stage: { id: string; name: string; type: string; order: number } | null;
  action: string | null;
  note: string | null;
  enteredAt: Date | null;
  exitedAt: Date | null;
  durationSeconds: number | null;
  duration: string | null;
  /** True when the stage took longer than its configured SLA. */
  breachedSla: boolean;
}

/**
 * Builds the visual task journey: where the task has been, who holds it now,
 * and which stages are still ahead of it.
 *
 * Past steps come from the ownership ledger (facts). Future steps come from
 * the workflow definition (projection) and are clearly marked as upcoming.
 */
@Injectable()
export class TaskJourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: TaskAssignmentService,
    private readonly engine: WorkflowEngineService,
  ) {}

  async build(taskId: string, now: Date = new Date()) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        createdAt: true,
        completedAt: true,
        currentStageId: true,
        currentOwnerId: true,
        workflowId: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            position: { select: { title: true } },
            department: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('This task could not be found.');

    const tenures = await this.assignments.getTenures(taskId);
    const steps: JourneyStep[] = [];

    steps.push({
      kind: 'CREATED',
      state: 'completed',
      sequence: 0,
      title: 'Task created',
      person: task.createdBy
        ? {
            id: task.createdBy.id,
            name: task.createdBy.firstName + ' ' + task.createdBy.lastName,
            avatarUrl: task.createdBy.avatarUrl,
            position: task.createdBy.position?.title ?? null,
            department: task.createdBy.department,
          }
        : null,
      stage: null,
      action: 'Created the task',
      note: null,
      enteredAt: task.createdAt,
      exitedAt: task.createdAt,
      durationSeconds: 0,
      duration: null,
      breachedSla: false,
    });

    for (const tenure of tenures) {
      const isOpen = tenure.exitedAt === null;
      const seconds =
        tenure.durationSeconds ?? (isOpen ? durationSeconds(tenure.enteredAt, now) : 0);
      const slaSeconds = tenure.stage?.slaHours ? tenure.stage.slaHours * 3600 : null;

      steps.push({
        kind: isOpen ? 'CURRENT' : 'HANDLED',
        state: isOpen ? 'current' : 'completed',
        sequence: tenure.sequence,
        title: tenure.stage?.name ?? (tenure.role === 'OWNER' ? 'Working on the task' : tenure.role),
        person: {
          id: tenure.user.id,
          name: tenure.user.firstName + ' ' + tenure.user.lastName,
          avatarUrl: tenure.user.avatarUrl,
          position: tenure.user.position?.title ?? tenure.user.jobTitle ?? null,
          department: tenure.user.department
            ? {
                id: tenure.user.department.id,
                name: tenure.user.department.name,
                color: tenure.user.department.color,
              }
            : null,
        },
        stage: tenure.stage
          ? {
              id: tenure.stage.id,
              name: tenure.stage.name,
              type: tenure.stage.type,
              order: tenure.stage.order,
            }
          : null,
        action: this.describeRole(tenure.role, isOpen),
        note: tenure.note,
        enteredAt: tenure.enteredAt,
        exitedAt: tenure.exitedAt,
        durationSeconds: seconds,
        duration: humanizeDuration(seconds),
        breachedSla: slaSeconds !== null && seconds > slaSeconds,
      });
    }

    const isLive = task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CANCELLED;
    if (task.workflowId && isLive) {
      steps.push(...(await this.buildUpcomingSteps(task, steps.length)));
    }

    const finished = task.status === TaskStatus.COMPLETED;
    steps.push({
      kind: 'FINISH',
      state: finished ? 'completed' : 'upcoming',
      sequence: steps.length,
      title: task.status === TaskStatus.CANCELLED ? 'Cancelled' : 'Completed',
      person: null,
      stage: null,
      action: null,
      note: null,
      enteredAt: task.completedAt,
      exitedAt: task.completedAt,
      durationSeconds: null,
      duration: null,
      breachedSla: false,
    });

    const timing = await this.assignments.getTimePerHolder(taskId, now);
    const totalElapsed = durationSeconds(task.createdAt, task.completedAt ?? now);

    return {
      taskId: task.id,
      taskNumber: task.number,
      status: task.status,
      steps,
      currentStepIndex: steps.findIndex((step) => step.state === 'current'),
      handoverCount: Math.max(0, tenures.length - 1),
      totalElapsedSeconds: totalElapsed,
      totalElapsed: humanizeDuration(totalElapsed),
      timePerHolder: timing.holders,
      slowestStage: timing.slowestStage,
    };
  }

  /** Projects the remaining stages of the workflow onto the timeline. */
  private async buildUpcomingSteps(
    task: { workflowId: string | null; currentStageId: string | null; id: string },
    startSequence: number,
  ): Promise<JourneyStep[]> {
    if (!task.workflowId) return [];
    const workflow = await this.engine.getWorkflow(task.workflowId);
    if (!workflow) return [];

    const currentIndex = task.currentStageId
      ? workflow.stages.findIndex((stage) => stage.id === task.currentStageId)
      : -1;
    // The closing FINISH step already represents completion, so a workflow's
    // own final stage would otherwise appear twice at the end of the timeline.
    const remaining = workflow.stages.slice(currentIndex + 1).filter((stage) => !stage.isFinal);

    return remaining.map((stage, index) => ({
      kind: 'UPCOMING' as const,
      state: 'upcoming' as const,
      sequence: startSequence + index,
      title: stage.name,
      person: stage.assigneeUser
        ? {
            id: stage.assigneeUser.id,
            name: stage.assigneeUser.firstName + ' ' + stage.assigneeUser.lastName,
            avatarUrl: null,
            position: stage.position?.title ?? null,
            department: null,
          }
        : null,
      stage: { id: stage.id, name: stage.name, type: stage.type, order: stage.order },
      action: this.describeStage(stage.type),
      note: stage.position?.title
        ? 'Expected: ' + stage.position.title
        : stage.role?.name
          ? 'Expected: ' + stage.role.name
          : null,
      enteredAt: null,
      exitedAt: null,
      durationSeconds: null,
      duration: null,
      breachedSla: false,
    }));
  }

  private describeRole(role: string, isOpen: boolean): string {
    switch (role) {
      case 'REVIEWER':
        return isOpen ? 'Reviewing' : 'Reviewed';
      case 'APPROVER':
        return isOpen ? 'Awaiting approval' : 'Approved';
      case 'COLLABORATOR':
        return 'Collaborating';
      default:
        return isOpen ? 'Working on it' : 'Handed over';
    }
  }

  private describeStage(type: string): string {
    switch (type) {
      case 'REVIEW':
        return 'Will review';
      case 'APPROVAL':
        return 'Will approve';
      case 'FINAL':
        return 'Closes the task';
      default:
        return 'Will work on it';
    }
  }
}
