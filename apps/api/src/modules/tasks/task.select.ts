import { Prisma } from '@prisma/client';
import { USER_SUMMARY_SELECT } from '../users/user.select';

const DEPARTMENT_SELECT = { id: true, name: true, code: true, color: true };
const PROJECT_SELECT = { id: true, name: true, code: true, color: true };

/** Columns every list view (table, kanban, calendar) needs - and no more. */
export const TASK_SUMMARY_SELECT = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  deadline: true,
  startDate: true,
  completedAt: true,
  submittedAt: true,
  ownerSince: true,
  progress: true,
  waitingReason: true,
  waitingSince: true,
  subtaskCount: true,
  completedSubtaskCount: true,
  estimatedHours: true,
  createdAt: true,
  updatedAt: true,
  parentTaskId: true,
  createdById: true,
  currentOwnerId: true,
  assignedById: true,
  departmentId: true,
  projectId: true,
  taskTypeId: true,
  workflowId: true,
  currentStageId: true,
  waitingForUserId: true,
  currentOwner: { select: USER_SUMMARY_SELECT },
  createdBy: { select: USER_SUMMARY_SELECT },
  assignedBy: { select: USER_SUMMARY_SELECT },
  waitingFor: { select: USER_SUMMARY_SELECT },
  department: { select: DEPARTMENT_SELECT },
  project: { select: PROJECT_SELECT },
  taskType: { select: { id: true, name: true, code: true, icon: true } },
  workflow: { select: { id: true, name: true, code: true } },
  currentStage: { select: { id: true, name: true, order: true, type: true, slaHours: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  _count: { select: { comments: true, attachments: true, subtasks: true } },
} satisfies Prisma.TaskSelect;

/** Everything the task detail page renders in one round trip. */
export const TASK_DETAIL_SELECT = {
  ...TASK_SUMMARY_SELECT,
  description: true,
  actualHours: true,
  blockedReason: true,
  cancelReason: true,
  approvedAt: true,
  parentTask: {
    select: { id: true, number: true, title: true, status: true },
  },
  subtasks: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      deadline: true,
      completedAt: true,
      currentOwner: { select: USER_SUMMARY_SELECT },
    },
  },
  attachments: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      extension: true,
      sizeBytes: true,
      createdAt: true,
      commentId: true,
      uploadedBy: { select: USER_SUMMARY_SELECT },
    },
  },
  approvals: {
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      status: true,
      sequence: true,
      comment: true,
      dueAt: true,
      decidedAt: true,
      createdAt: true,
      approver: { select: USER_SUMMARY_SELECT },
      requestedBy: { select: USER_SUMMARY_SELECT },
      stage: { select: { id: true, name: true, order: true } },
    },
  },
  watchers: { select: { user: { select: USER_SUMMARY_SELECT } } },
} satisfies Prisma.TaskSelect;

export type TaskSummary = Prisma.TaskGetPayload<{ select: typeof TASK_SUMMARY_SELECT }>;
export type TaskDetail = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;

export const taskRef = (task: { number: number; title: string }): string =>
  '#' + task.number + ' ' + task.title;
