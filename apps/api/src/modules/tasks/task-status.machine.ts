import { UnprocessableEntityException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PERMISSIONS, PermissionKey } from '../../common/constants/permissions';

export interface TransitionRule {
  to: TaskStatus;
  /** Action label surfaced on buttons in the UI. */
  label: string;
  /** Permission the actor must hold to take this transition. */
  permission?: PermissionKey;
  /**
   * When true only the current owner (or someone who manages them / holds
   * assign_task) may take the transition.
   */
  ownerOnly?: boolean;
}

/**
 * The authoritative task status graph.
 *
 * Nothing in the codebase may change `Task.status` without going through
 * `assertTransition`, which is what makes the lifecycle enforceable rather
 * than advisory.
 *
 *   DRAFT -> ASSIGNED -> IN_PROGRESS -> SUBMITTED -> UNDER_REVIEW
 *         -> APPROVED -> COMPLETED
 *   UNDER_REVIEW -> CHANGES_REQUESTED -> IN_PROGRESS  (rework loop)
 *   Any live status -> BLOCKED / CANCELLED
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TransitionRule[]> = {
  [TaskStatus.DRAFT]: [
    { to: TaskStatus.ASSIGNED, label: 'Assign', permission: PERMISSIONS.ASSIGN_TASK },
    { to: TaskStatus.IN_PROGRESS, label: 'Start work', ownerOnly: true },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.ASSIGNED]: [
    { to: TaskStatus.IN_PROGRESS, label: 'Start work', ownerOnly: true },
    { to: TaskStatus.ASSIGNED, label: 'Reassign', permission: PERMISSIONS.ASSIGN_TASK },
    { to: TaskStatus.SUBMITTED, label: 'Submit', permission: PERMISSIONS.SUBMIT_TASK, ownerOnly: true },
    { to: TaskStatus.BLOCKED, label: 'Mark blocked', ownerOnly: true },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.IN_PROGRESS]: [
    { to: TaskStatus.SUBMITTED, label: 'Submit for review', permission: PERMISSIONS.SUBMIT_TASK, ownerOnly: true },
    { to: TaskStatus.ASSIGNED, label: 'Hand over', permission: PERMISSIONS.HANDOVER_TASK, ownerOnly: true },
    // Handing finished work straight to a named reviewer, rather than
    // submitting it into an unattended queue first.
    {
      to: TaskStatus.UNDER_REVIEW,
      label: 'Hand over for review',
      permission: PERMISSIONS.HANDOVER_TASK,
      ownerOnly: true,
    },
    { to: TaskStatus.BLOCKED, label: 'Mark blocked', ownerOnly: true },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.SUBMITTED]: [
    { to: TaskStatus.UNDER_REVIEW, label: 'Start review', permission: PERMISSIONS.REVIEW_TASK },
    { to: TaskStatus.CHANGES_REQUESTED, label: 'Request changes', permission: PERMISSIONS.REVIEW_TASK },
    { to: TaskStatus.APPROVED, label: 'Approve', permission: PERMISSIONS.APPROVE_TASK },
    { to: TaskStatus.IN_PROGRESS, label: 'Recall submission', ownerOnly: true },
    { to: TaskStatus.BLOCKED, label: 'Mark blocked' },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.UNDER_REVIEW]: [
    { to: TaskStatus.APPROVED, label: 'Approve', permission: PERMISSIONS.APPROVE_TASK },
    { to: TaskStatus.CHANGES_REQUESTED, label: 'Request changes', permission: PERMISSIONS.REVIEW_TASK },
    { to: TaskStatus.SUBMITTED, label: 'Pass to next reviewer', permission: PERMISSIONS.HANDOVER_TASK },
    { to: TaskStatus.BLOCKED, label: 'Mark blocked' },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.CHANGES_REQUESTED]: [
    { to: TaskStatus.IN_PROGRESS, label: 'Resume work', ownerOnly: true },
    { to: TaskStatus.ASSIGNED, label: 'Hand over', permission: PERMISSIONS.HANDOVER_TASK, ownerOnly: true },
    { to: TaskStatus.BLOCKED, label: 'Mark blocked', ownerOnly: true },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.APPROVED]: [
    { to: TaskStatus.COMPLETED, label: 'Complete', permission: PERMISSIONS.APPROVE_TASK },
    { to: TaskStatus.UNDER_REVIEW, label: 'Send to next approver', permission: PERMISSIONS.HANDOVER_TASK },
    { to: TaskStatus.ASSIGNED, label: 'Hand over', permission: PERMISSIONS.HANDOVER_TASK },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.BLOCKED]: [
    { to: TaskStatus.IN_PROGRESS, label: 'Unblock and resume' },
    { to: TaskStatus.ASSIGNED, label: 'Unblock and reassign', permission: PERMISSIONS.ASSIGN_TASK },
    { to: TaskStatus.SUBMITTED, label: 'Unblock and submit', permission: PERMISSIONS.SUBMIT_TASK },
    { to: TaskStatus.UNDER_REVIEW, label: 'Unblock and review', permission: PERMISSIONS.REVIEW_TASK },
    { to: TaskStatus.CANCELLED, label: 'Cancel', permission: PERMISSIONS.DELETE_TASK },
  ],

  [TaskStatus.COMPLETED]: [
    { to: TaskStatus.IN_PROGRESS, label: 'Reopen', permission: PERMISSIONS.REOPEN_TASK },
    { to: TaskStatus.ASSIGNED, label: 'Reopen and reassign', permission: PERMISSIONS.REOPEN_TASK },
  ],

  [TaskStatus.CANCELLED]: [
    { to: TaskStatus.ASSIGNED, label: 'Reopen', permission: PERMISSIONS.REOPEN_TASK },
    { to: TaskStatus.IN_PROGRESS, label: 'Reopen and resume', permission: PERMISSIONS.REOPEN_TASK },
  ],
};

/** Statuses that mean the task is no longer moving through the workflow. */
export const TERMINAL_STATUSES: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

/** Statuses that count as "open work" in dashboards and overdue calculations. */
export const OPEN_STATUSES: TaskStatus[] = Object.values(TaskStatus).filter(
  (status) => !TERMINAL_STATUSES.includes(status),
);

export const isTerminal = (status: TaskStatus): boolean => TERMINAL_STATUSES.includes(status);

export const findRule = (from: TaskStatus, to: TaskStatus): TransitionRule | undefined =>
  TASK_TRANSITIONS[from]?.find((rule) => rule.to === to);

export const canTransition = (from: TaskStatus, to: TaskStatus): boolean =>
  Boolean(findRule(from, to));

const readable = (status: TaskStatus): string =>
  status
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');

/**
 * Throws the user-facing "not allowed" error unless the move is legal.
 * A no-op move (same status, not a self-loop rule) is rejected too.
 */
export function assertTransition(from: TaskStatus, to: TaskStatus): TransitionRule {
  const rule = findRule(from, to);
  if (!rule) {
    throw new UnprocessableEntityException(
      'This workflow transition is not allowed (' +
        readable(from) +
        ' cannot move to ' +
        readable(to) +
        ').',
    );
  }
  return rule;
}

export interface ActorContext {
  permissions: PermissionKey[];
  isOwner: boolean;
  /** Manager of the owner, task creator or assigner - may act on their behalf. */
  isSupervisor: boolean;
}

export const actorMaySkipOwnership = (actor: ActorContext): boolean =>
  actor.isSupervisor || actor.permissions.includes(PERMISSIONS.ASSIGN_TASK);

/** Transitions this specific actor may currently take - drives the UI buttons. */
export function availableTransitions(
  from: TaskStatus,
  actor: ActorContext,
): TransitionRule[] {
  return (TASK_TRANSITIONS[from] ?? []).filter((rule) => {
    if (rule.permission && !actor.permissions.includes(rule.permission)) return false;
    if (rule.ownerOnly && !actor.isOwner && !actorMaySkipOwnership(actor)) return false;
    return true;
  });
}

/** Status a task should hold while it sits with a reviewer/approver stage. */
export const statusForStageType = (
  stageType: 'WORK' | 'REVIEW' | 'APPROVAL' | 'FINAL',
): TaskStatus => {
  switch (stageType) {
    case 'REVIEW':
      return TaskStatus.UNDER_REVIEW;
    case 'APPROVAL':
      return TaskStatus.SUBMITTED;
    case 'FINAL':
      return TaskStatus.COMPLETED;
    default:
      return TaskStatus.ASSIGNED;
  }
};
