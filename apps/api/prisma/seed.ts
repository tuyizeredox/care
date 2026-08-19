/* eslint-disable no-console */
/**
 * OrgFlow database seed.
 *
 * Creates the permission catalogue, roles, the organisation described in
 * `seed-data.ts`, and a body of realistic demo work: projects, workflows and
 * tasks that have genuinely travelled between people, with the ownership
 * ledger, history, comments, approvals and notifications those journeys imply.
 *
 * Safe to re-run: every write is an upsert, and demo tasks are only generated
 * when the tasks table is empty.
 *
 * DEVELOPMENT DATA ONLY - the accounts below use an obvious shared password.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PERMISSION_CATALOGUE } from '../src/common/constants/permissions';
import { ROLE_CATALOGUE } from '../src/common/constants/roles';
import { DEFAULT_SETTINGS } from '../src/modules/settings/settings.service';
import {
  DEPARTMENTS,
  DEPARTMENT_HEADS,
  POSITIONS,
  PROJECTS,
  TAGS,
  TASK_TYPES,
  USERS,
  WORKFLOWS,
} from './seed-data';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Passw0rd!Demo';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const daysAgo = (days: number, hour = 9): Date => {
  const date = new Date(Date.now() - days * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const daysAhead = (days: number, hour = 17): Date => {
  const date = new Date(Date.now() + days * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const monthsFromNow = (months: number): Date => {
  const date = new Date();
  date.setMonth(date.getMonth() + months, 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

/** Lookup tables built up as the seed progresses. */
const ids = {
  roles: new Map<string, string>(),
  departments: new Map<string, string>(),
  positions: new Map<string, string>(),
  usersByPosition: new Map<string, string>(),
  usersByEmail: new Map<string, string>(),
  taskTypes: new Map<string, string>(),
  projects: new Map<string, string>(),
  workflows: new Map<string, string>(),
  stages: new Map<string, string>(),
  tags: new Map<string, string>(),
};

const userAt = (positionCode: string): string => {
  const id = ids.usersByPosition.get(positionCode);
  if (!id) throw new Error('Seed error: no user seeded for position ' + positionCode);
  return id;
};

const stageKey = (workflowCode: string, order: number): string => workflowCode + ':' + order;

// ---------------------------------------------------------------------------
// 1. Permissions and roles
// ---------------------------------------------------------------------------

async function seedPermissionsAndRoles(): Promise<void> {
  for (const permission of PERMISSION_CATALOGUE) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: {
        name: permission.name,
        description: permission.description,
        category: permission.category,
      },
    });
  }

  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map((row) => [
      row.key,
      row.id,
    ]),
  );

  for (const role of ROLE_CATALOGUE) {
    const record = await prisma.role.upsert({
      where: { key: role.key },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        level: role.level,
        isSystem: true,
      },
      update: { name: role.name, description: role.description, level: role.level },
    });
    ids.roles.set(role.key, record.id);

    // Role permissions are declarative: reset and re-apply on every seed.
    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    const rows = role.permissions
      .map((key) => permissionIds.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: record.id, permissionId }));
    if (rows.length > 0) {
      await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
    }
  }

  console.log(
    '  roles: ' + ROLE_CATALOGUE.length + ', permissions: ' + PERMISSION_CATALOGUE.length,
  );
}

// ---------------------------------------------------------------------------
// 2. Organisation structure
// ---------------------------------------------------------------------------

async function seedOrganization(): Promise<void> {
  const root = await prisma.organizationUnit.upsert({
    where: { code: 'ORG' },
    create: {
      code: 'ORG',
      name: 'Country Programme',
      type: 'ORGANIZATION',
      description: 'The country office as a whole.',
      sortOrder: 0,
    },
    update: {},
  });

  for (const department of DEPARTMENTS) {
    const unit = await prisma.organizationUnit.upsert({
      where: { code: 'UNIT_' + department.code },
      create: {
        code: 'UNIT_' + department.code,
        name: department.name,
        type: 'DEPARTMENT',
        description: department.description,
        parentId: root.id,
        sortOrder: department.sortOrder,
      },
      update: { name: department.name, parentId: root.id },
    });

    const record = await prisma.department.upsert({
      where: { code: department.code },
      create: {
        code: department.code,
        name: department.name,
        description: department.description,
        color: department.color,
        sortOrder: department.sortOrder,
        unitId: unit.id,
      },
      update: {
        name: department.name,
        description: department.description,
        color: department.color,
        sortOrder: department.sortOrder,
        unitId: unit.id,
      },
    });
    ids.departments.set(department.code, record.id);
  }

  // Two passes: create every position, then wire up reporting lines.
  for (const position of POSITIONS) {
    const record = await prisma.position.upsert({
      where: { code: position.code },
      create: {
        code: position.code,
        title: position.title,
        description: position.description,
        level: position.level,
        departmentId: ids.departments.get(position.departmentCode) ?? null,
      },
      update: {
        title: position.title,
        description: position.description,
        level: position.level,
        departmentId: ids.departments.get(position.departmentCode) ?? null,
      },
    });
    ids.positions.set(position.code, record.id);
  }

  for (const position of POSITIONS) {
    if (!position.reportsToCode) continue;
    await prisma.position.update({
      where: { id: ids.positions.get(position.code) as string },
      data: { reportsToId: ids.positions.get(position.reportsToCode) ?? null },
    });
  }

  console.log(
    '  departments: ' + DEPARTMENTS.length + ', positions: ' + POSITIONS.length,
  );
}

// ---------------------------------------------------------------------------
// 3. People
// ---------------------------------------------------------------------------

async function seedUsers(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const positionByCode = new Map(POSITIONS.map((position) => [position.code, position]));

  // A dedicated administrator account, separate from the org chart.
  const admin = await prisma.user.upsert({
    where: { email: 'admin@care.demo' },
    create: {
      email: 'admin@care.demo',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      jobTitle: 'System Administrator',
      roleId: ids.roles.get('SUPER_ADMIN') as string,
      status: 'ACTIVE',
      emailVerified: true,
    },
    update: { roleId: ids.roles.get('SUPER_ADMIN') as string },
  });
  ids.usersByEmail.set(admin.email, admin.id);

  for (const person of USERS) {
    const position = positionByCode.get(person.positionCode);
    if (!position) throw new Error('Seed error: unknown position ' + person.positionCode);

    const record = await prisma.user.upsert({
      where: { email: person.email },
      create: {
        email: person.email,
        passwordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        jobTitle: position.title,
        roleId: ids.roles.get(person.roleKey) as string,
        departmentId: ids.departments.get(position.departmentCode) ?? null,
        positionId: ids.positions.get(person.positionCode) ?? null,
        status: 'ACTIVE',
        emailVerified: true,
        timezone: 'Africa/Kigali',
      },
      update: {
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        jobTitle: position.title,
        roleId: ids.roles.get(person.roleKey) as string,
        departmentId: ids.departments.get(position.departmentCode) ?? null,
        positionId: ids.positions.get(person.positionCode) ?? null,
      },
    });

    ids.usersByPosition.set(person.positionCode, record.id);
    ids.usersByEmail.set(person.email, record.id);
  }

  // Effective reporting lines mirror the structural ones from the organigram.
  for (const person of USERS) {
    const position = positionByCode.get(person.positionCode);
    if (!position?.reportsToCode) continue;
    const managerId = ids.usersByPosition.get(position.reportsToCode);
    if (!managerId) continue;
    await prisma.user.update({
      where: { id: ids.usersByPosition.get(person.positionCode) as string },
      data: { managerId },
    });
  }

  for (const [departmentCode, positionCode] of Object.entries(DEPARTMENT_HEADS)) {
    const headId = ids.usersByPosition.get(positionCode);
    const departmentId = ids.departments.get(departmentCode);
    if (!headId || !departmentId) continue;
    await prisma.department.update({ where: { id: departmentId }, data: { headUserId: headId } });
    await prisma.organizationUnit.updateMany({
      where: { code: 'UNIT_' + departmentCode },
      data: { headUserId: headId },
    });
  }

  await prisma.organizationUnit.updateMany({
    where: { code: 'ORG' },
    data: { headUserId: ids.usersByPosition.get('CD') },
  });

  console.log('  users: ' + (USERS.length + 1) + ' (including the admin account)');
}

// ---------------------------------------------------------------------------
// 4. Task types, tags and projects
// ---------------------------------------------------------------------------

async function seedCatalogues(): Promise<void> {
  for (const taskType of TASK_TYPES) {
    const record = await prisma.taskType.upsert({
      where: { code: taskType.code },
      create: taskType,
      update: { name: taskType.name, description: taskType.description, icon: taskType.icon },
    });
    ids.taskTypes.set(taskType.code, record.id);
  }

  for (const tag of TAGS) {
    const record = await prisma.tag.upsert({
      where: { name: tag.name },
      create: tag,
      update: { color: tag.color, deletedAt: null },
    });
    ids.tags.set(tag.name, record.id);
  }

  for (const project of PROJECTS) {
    const managerId = ids.usersByPosition.get(project.managerPositionCode) ?? null;
    const record = await prisma.project.upsert({
      where: { code: project.code },
      create: {
        code: project.code,
        name: project.name,
        description: project.description,
        color: project.color,
        status: 'ACTIVE',
        managerId,
        departmentId: ids.departments.get(project.departmentCode) ?? null,
        startDate: monthsFromNow(-project.startMonthsAgo),
        endDate: monthsFromNow(project.endMonthsAhead),
      },
      update: {
        name: project.name,
        description: project.description,
        color: project.color,
        managerId,
      },
    });
    ids.projects.set(project.code, record.id);

    for (const positionCode of project.memberPositionCodes) {
      const userId = ids.usersByPosition.get(positionCode);
      if (!userId) continue;
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: record.id, userId } },
        create: {
          projectId: record.id,
          userId,
          role: positionCode === project.managerPositionCode ? 'MANAGER' : 'MEMBER',
        },
        update: {},
      });
    }
  }

  console.log(
    '  task types: ' + TASK_TYPES.length + ', projects: ' + PROJECTS.length + ', tags: ' + TAGS.length,
  );
}

// ---------------------------------------------------------------------------
// 5. Workflows
// ---------------------------------------------------------------------------

async function seedWorkflows(): Promise<void> {
  for (const workflow of WORKFLOWS) {
    const record = await prisma.taskWorkflow.upsert({
      where: { code: workflow.code },
      create: {
        code: workflow.code,
        name: workflow.name,
        description: workflow.description,
        taskTypeId: ids.taskTypes.get(workflow.taskTypeCode) ?? null,
        departmentId: workflow.departmentCode
          ? (ids.departments.get(workflow.departmentCode) ?? null)
          : null,
        isActive: true,
        isDefault: workflow.isDefault ?? false,
        createdById: ids.usersByEmail.get('admin@care.demo') ?? null,
      },
      update: {
        name: workflow.name,
        description: workflow.description,
        isDefault: workflow.isDefault ?? false,
      },
    });
    ids.workflows.set(workflow.code, record.id);

    for (const stage of workflow.stages) {
      const existing = await prisma.workflowStage.findUnique({
        where: { workflowId_order: { workflowId: record.id, order: stage.order } },
      });

      const data = {
        name: stage.name,
        description: stage.description,
        type: stage.type,
        assigneeMode: stage.assigneeMode,
        assigneeUserId: null,
        positionId: stage.positionCode ? (ids.positions.get(stage.positionCode) ?? null) : null,
        entryStatus: stage.entryStatus,
        requiresApproval: stage.requiresApproval ?? stage.type === 'APPROVAL',
        slaHours: stage.slaHours ?? null,
        isFinal: stage.isFinal ?? false,
      };

      const saved = existing
        ? await prisma.workflowStage.update({ where: { id: existing.id }, data })
        : await prisma.workflowStage.create({
            data: { ...data, workflowId: record.id, order: stage.order },
          });

      ids.stages.set(stageKey(workflow.code, stage.order), saved.id);
    }

    // Linear transitions, written explicitly so the builder shows the graph.
    for (let index = 0; index < workflow.stages.length - 1; index += 1) {
      const from = ids.stages.get(stageKey(workflow.code, workflow.stages[index].order));
      const to = ids.stages.get(stageKey(workflow.code, workflow.stages[index + 1].order));
      if (!from || !to) continue;
      await prisma.workflowTransition.upsert({
        where: { fromStageId_toStageId: { fromStageId: from, toStageId: to } },
        create: {
          workflowId: record.id,
          fromStageId: from,
          toStageId: to,
          label: 'Send to ' + workflow.stages[index + 1].name,
        },
        update: {},
      });
    }
  }

  console.log('  workflows: ' + WORKFLOWS.length);
}

// ---------------------------------------------------------------------------
// 6. Demo work
// ---------------------------------------------------------------------------

type StepAction = 'work' | 'submit' | 'review' | 'approve' | 'changes';

interface JourneyStep {
  positionCode: string;
  /** How long this person held the task before passing it on. */
  days: number;
  action: StepAction;
  note?: string;
  stageOrder?: number;
}

interface TaskScenario {
  title: string;
  description: string;
  taskTypeCode: string;
  workflowCode: string;
  projectCode?: string;
  departmentCode: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  createdByPosition: string;
  createdDaysAgo: number;
  deadlineInDays: number;
  tags?: string[];
  steps: JourneyStep[];
  /** Where the task ends up once the steps have been replayed. */
  outcome: 'IN_PROGRESS' | 'UNDER_REVIEW' | 'SUBMITTED' | 'COMPLETED' | 'BLOCKED' | 'CHANGES_REQUESTED' | 'ASSIGNED';
  blockedReason?: string;
  comments?: Array<{ positionCode: string; body: string; daysAgo: number; mentions?: string[] }>;
  subtasks?: Array<{ title: string; positionCode: string; done: boolean }>;
}

/**
 * Replays a scenario as though it really happened: each holder takes the task,
 * works on it for a while and hands it on, leaving a tenure in the ownership
 * ledger and matching immutable history entries behind them.
 */
async function createScenarioTask(scenario: TaskScenario): Promise<void> {
  const workflowId = ids.workflows.get(scenario.workflowCode) ?? null;
  const createdById = userAt(scenario.createdByPosition);
  const createdAt = daysAgo(scenario.createdDaysAgo);
  const deadline = daysAhead(scenario.deadlineInDays);
  const isClosed = scenario.outcome === 'COMPLETED';

  const lastStep = scenario.steps[scenario.steps.length - 1];
  const currentOwnerId = userAt(lastStep.positionCode);
  const currentStageId = lastStep.stageOrder
    ? (ids.stages.get(stageKey(scenario.workflowCode, lastStep.stageOrder)) ?? null)
    : null;

  // Wall-clock cursor walked forward one tenure at a time.
  let cursor = new Date(createdAt);
  const tenures = scenario.steps.map((step, index) => {
    const enteredAt = new Date(cursor);
    const isLast = index === scenario.steps.length - 1;
    const exitedAt = isLast && !isClosed ? null : new Date(cursor.getTime() + step.days * DAY);
    if (exitedAt) cursor = new Date(exitedAt);
    return { step, index, enteredAt, exitedAt };
  });

  const completedAt = isClosed ? new Date(cursor) : null;
  const submittedStep = tenures.find((tenure) => tenure.step.action === 'submit');
  const approvedStep = tenures.find((tenure) => tenure.step.action === 'approve');

  const task = await prisma.task.create({
    data: {
      title: scenario.title,
      description: scenario.description,
      status: scenario.outcome,
      priority: scenario.priority,
      createdById,
      currentOwnerId,
      assignedById: createdById,
      departmentId: ids.departments.get(scenario.departmentCode) ?? null,
      projectId: scenario.projectCode ? (ids.projects.get(scenario.projectCode) ?? null) : null,
      taskTypeId: ids.taskTypes.get(scenario.taskTypeCode) ?? null,
      workflowId,
      currentStageId,
      startDate: createdAt,
      deadline,
      createdAt,
      updatedAt: completedAt ?? new Date(),
      completedAt,
      submittedAt: submittedStep?.exitedAt ?? null,
      approvedAt: approvedStep?.exitedAt ?? null,
      ownerSince: tenures[tenures.length - 1].enteredAt,
      progress: isClosed ? 100 : Math.min(90, scenario.steps.length * 20),
      blockedReason: scenario.outcome === 'BLOCKED' ? (scenario.blockedReason ?? null) : null,
      estimatedHours: 8 * scenario.steps.length,
      waitingForUserId: isClosed ? null : currentOwnerId,
      waitingReason: isClosed
        ? 'NONE'
        : scenario.outcome === 'BLOCKED'
          ? 'BLOCKED'
          : scenario.outcome === 'UNDER_REVIEW'
            ? 'REVIEW'
            : scenario.outcome === 'SUBMITTED'
              ? 'APPROVAL'
              : 'ACTION',
      waitingSince: isClosed ? null : tenures[tenures.length - 1].enteredAt,
      tags: {
        create: (scenario.tags ?? [])
          .map((name) => ids.tags.get(name))
          .filter((tagId): tagId is string => Boolean(tagId))
          .map((tagId) => ({ tagId })),
      },
      watchers: {
        create: [...new Set([createdById, currentOwnerId])].map((userId) => ({ userId })),
      },
    },
  });

  await prisma.taskHistory.create({
    data: {
      taskId: task.id,
      actorId: createdById,
      action: 'TASK_CREATED',
      summary: 'Created #' + task.number + ' ' + task.title,
      toValue: 'ASSIGNED',
      createdAt,
    },
  });

  for (const tenure of tenures) {
    const holderId = userAt(tenure.step.positionCode);
    const stageId = tenure.step.stageOrder
      ? (ids.stages.get(stageKey(scenario.workflowCode, tenure.step.stageOrder)) ?? null)
      : null;
    const previous = tenures[tenure.index - 1];
    const previousHolderId = previous ? userAt(previous.step.positionCode) : createdById;

    const seconds = tenure.exitedAt
      ? Math.floor((tenure.exitedAt.getTime() - tenure.enteredAt.getTime()) / 1000)
      : null;

    await prisma.taskAssignment.create({
      data: {
        taskId: task.id,
        userId: holderId,
        assignedById: previousHolderId,
        stageId,
        role:
          tenure.step.action === 'approve'
            ? 'APPROVER'
            : tenure.step.action === 'review' || tenure.step.action === 'changes'
              ? 'REVIEWER'
              : 'OWNER',
        note: tenure.step.note ?? null,
        enteredAt: tenure.enteredAt,
        exitedAt: tenure.exitedAt,
        durationSeconds: seconds,
        sequence: tenure.index + 1,
        createdAt: tenure.enteredAt,
      },
    });

    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        actorId: previousHolderId,
        action: tenure.index === 0 ? 'TASK_ASSIGNED' : 'TASK_HANDED_OVER',
        summary:
          (tenure.index === 0 ? 'Assigned the task to ' : 'Handed the task over to ') +
          (await nameOf(holderId)),
        fromValue: tenure.index === 0 ? null : previousHolderId,
        toValue: holderId,
        comment: tenure.step.note ?? null,
        createdAt: tenure.enteredAt,
        metadata: stageId ? { stageId } : Prisma.DbNull,
      },
    });

    if (!tenure.exitedAt) continue;

    const exitEvents: Record<StepAction, { action: string; summary: string }> = {
      work: { action: 'TASK_STARTED', summary: 'Worked on the task and passed it on' },
      submit: { action: 'TASK_SUBMITTED', summary: 'Submitted the work for review' },
      review: { action: 'TASK_REVIEWED', summary: 'Reviewed the submission' },
      approve: { action: 'TASK_APPROVED', summary: 'Approved the task' },
      changes: { action: 'CHANGES_REQUESTED', summary: 'Requested changes before proceeding' },
    };
    const event = exitEvents[tenure.step.action];

    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        actorId: holderId,
        action: event.action as never,
        summary: event.summary,
        comment: tenure.step.note ?? null,
        createdAt: tenure.exitedAt,
      },
    });

    if (tenure.step.action === 'approve') {
      await prisma.approval.create({
        data: {
          taskId: task.id,
          stageId,
          approverId: holderId,
          requestedById: previousHolderId,
          status: 'APPROVED',
          sequence: tenure.index + 1,
          comment: tenure.step.note ?? null,
          dueAt: deadline,
          decidedAt: tenure.exitedAt,
          createdAt: tenure.enteredAt,
        },
      });
    }
  }

  // An open approval when the task is sitting with an approver right now.
  if (scenario.outcome === 'SUBMITTED') {
    await prisma.approval.create({
      data: {
        taskId: task.id,
        stageId: currentStageId,
        approverId: currentOwnerId,
        requestedById: userAt(
          scenario.steps[Math.max(0, scenario.steps.length - 2)].positionCode,
        ),
        status: 'PENDING',
        sequence: scenario.steps.length,
        dueAt: deadline,
        createdAt: tenures[tenures.length - 1].enteredAt,
      },
    });
  }

  if (isClosed && completedAt) {
    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        actorId: currentOwnerId,
        action: 'TASK_COMPLETED',
        summary: 'Task completed',
        toValue: 'COMPLETED',
        createdAt: completedAt,
      },
    });
  }

  if (scenario.outcome === 'BLOCKED' && scenario.blockedReason) {
    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        actorId: currentOwnerId,
        action: 'TASK_BLOCKED',
        summary: 'Marked the task as blocked',
        comment: scenario.blockedReason,
        createdAt: tenures[tenures.length - 1].enteredAt,
      },
    });
  }

  for (const comment of scenario.comments ?? []) {
    const authorId = userAt(comment.positionCode);
    const mentionIds = (comment.mentions ?? [])
      .map((positionCode) => ids.usersByPosition.get(positionCode))
      .filter((id): id is string => Boolean(id));

    const created = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId,
        body: comment.body,
        createdAt: daysAgo(comment.daysAgo, 11),
        updatedAt: daysAgo(comment.daysAgo, 11),
        mentions: { create: mentionIds.map((userId) => ({ userId })) },
      },
    });

    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        actorId: authorId,
        action: 'COMMENT_ADDED',
        summary: 'Added a comment',
        comment: comment.body.slice(0, 300),
        createdAt: created.createdAt,
        metadata: { commentId: created.id },
      },
    });

    for (const userId of mentionIds) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'MENTIONED',
          title: (await nameOf(authorId)) + ' mentioned you on #' + task.number,
          body: comment.body.slice(0, 200),
          taskId: task.id,
          link: '/tasks/' + task.number,
          createdAt: created.createdAt,
        },
      });
    }
  }

  if (scenario.subtasks?.length) {
    let completedCount = 0;
    for (const subtask of scenario.subtasks) {
      const ownerId = userAt(subtask.positionCode);
      const subtaskCreatedAt = new Date(createdAt.getTime() + HOUR);
      const child = await prisma.task.create({
        data: {
          title: subtask.title,
          status: subtask.done ? 'COMPLETED' : 'IN_PROGRESS',
          priority: scenario.priority,
          createdById,
          currentOwnerId: ownerId,
          assignedById: createdById,
          departmentId: ids.departments.get(scenario.departmentCode) ?? null,
          projectId: scenario.projectCode ? (ids.projects.get(scenario.projectCode) ?? null) : null,
          parentTaskId: task.id,
          deadline,
          createdAt: subtaskCreatedAt,
          ownerSince: subtaskCreatedAt,
          completedAt: subtask.done ? new Date(subtaskCreatedAt.getTime() + 2 * DAY) : null,
          progress: subtask.done ? 100 : 40,
          waitingForUserId: subtask.done ? null : ownerId,
          waitingReason: subtask.done ? 'NONE' : 'ACTION',
          waitingSince: subtask.done ? null : subtaskCreatedAt,
        },
      });

      await prisma.taskAssignment.create({
        data: {
          taskId: child.id,
          userId: ownerId,
          assignedById: createdById,
          role: 'OWNER',
          enteredAt: subtaskCreatedAt,
          exitedAt: subtask.done ? new Date(subtaskCreatedAt.getTime() + 2 * DAY) : null,
          durationSeconds: subtask.done ? 2 * 24 * 3600 : null,
          sequence: 1,
          createdAt: subtaskCreatedAt,
        },
      });

      await prisma.taskHistory.create({
        data: {
          taskId: child.id,
          actorId: createdById,
          action: 'TASK_CREATED',
          summary: 'Created subtask ' + subtask.title,
          createdAt: subtaskCreatedAt,
        },
      });

      if (subtask.done) completedCount += 1;
    }

    await prisma.task.update({
      where: { id: task.id },
      data: {
        subtaskCount: scenario.subtasks.length,
        completedSubtaskCount: completedCount,
      },
    });
  }

  // The person holding live work gets the notification that put it there.
  if (!isClosed) {
    await prisma.notification.create({
      data: {
        userId: currentOwnerId,
        type: scenario.outcome === 'SUBMITTED' ? 'APPROVAL_REQUESTED' : 'TASK_HANDED_OVER',
        title:
          (scenario.outcome === 'SUBMITTED' ? 'Approval requested: #' : 'Task handed over to you: #') +
          task.number + ' ' + task.title,
        body: lastStep.note ?? null,
        taskId: task.id,
        link: '/tasks/' + task.number,
        createdAt: tenures[tenures.length - 1].enteredAt,
      },
    });
  }
}

const nameCache = new Map<string, string>();
async function nameOf(userId: string): Promise<string> {
  const cached = nameCache.get(userId);
  if (cached) return cached;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  const name = user ? user.firstName + ' ' + user.lastName : 'a colleague';
  nameCache.set(userId, name);
  return name;
}

/**
 * Demo work. The first scenario is the worked example from the specification:
 * Programme Director to SERVE PM to GESI Advisor and back up the chain.
 */
const SCENARIOS: TaskScenario[] = [
  {
    title: 'Prepare Q3 SERVE programme report',
    description:
      'Consolidate Q3 field data, GESI analysis and the narrative sections into the quarterly donor report. Financial figures come from the Finance team; the GESI section needs technical review before submission.',
    taskTypeCode: 'PROGRAMME_REPORT',
    workflowCode: 'PROGRAMME_REPORT',
    projectCode: 'SERVE',
    departmentCode: 'PROG',
    priority: 'HIGH',
    createdByPosition: 'PROG_DIR',
    createdDaysAgo: 12,
    deadlineInDays: 3,
    tags: ['quarterly-report', 'donor', 'gesi'],
    outcome: 'UNDER_REVIEW',
    steps: [
      { positionCode: 'PROG_DIR', days: 1, action: 'work', stageOrder: 1, note: 'Kicking off the Q3 report. Please pull together the field data first.' },
      { positionCode: 'SERVE_PM', days: 2, action: 'submit', stageOrder: 1, note: 'Draft narrative and field data compiled. Sending to GESI for the inclusion analysis.' },
      { positionCode: 'GESI_ADV', days: 5, action: 'review', stageOrder: 2, note: 'GESI section reviewed and strengthened with disaggregated data.' },
      { positionCode: 'SERVE_PM', days: 1, action: 'submit', stageOrder: 3, note: 'Report consolidated and ready for Programme Director review.' },
      { positionCode: 'PROG_DIR', days: 0, action: 'review', stageOrder: 3 },
    ],
    comments: [
      { positionCode: 'SERVE_PM', body: '@GESI Advisor please update section 4 with the disaggregated participation figures before this goes up.', daysAgo: 9, mentions: ['GESI_ADV'] },
      { positionCode: 'GESI_ADV', body: 'Section 4 is updated. I have added the age and disability breakdown and flagged two districts where the sample is thin.', daysAgo: 4 },
      { positionCode: 'PROG_DIR', body: 'Thanks both. Reviewing now - the narrative reads well, I just want to check the finance annex before approving.', daysAgo: 1 },
    ],
    subtasks: [
      { title: 'Collect field data from all districts', positionCode: 'MEAL_1', done: true },
      { title: 'Verify GESI disaggregated data', positionCode: 'GESI_ADV', done: true },
      { title: 'Prepare financial section', positionCode: 'FIN_OFF', done: true },
      { title: 'Prepare narrative section', positionCode: 'SERVE_PM', done: true },
      { title: 'Review consolidated report', positionCode: 'PROG_DIR', done: false },
      { title: 'Submit final report to donor', positionCode: 'PROG_DIR', done: false },
    ],
  },
  {
    title: 'Procure 30 tablets for field data collection',
    description:
      'Purchase 30 rugged Android tablets for MEAL field enumerators, including protective cases and a two-year warranty. Budget line SERVE-EQ-004.',
    taskTypeCode: 'PROCUREMENT',
    workflowCode: 'PROCUREMENT',
    projectCode: 'SERVE',
    departmentCode: 'OPS',
    priority: 'MEDIUM',
    createdByPosition: 'MEAL_1',
    createdDaysAgo: 18,
    deadlineInDays: 7,
    tags: ['procurement', 'field-data'],
    outcome: 'SUBMITTED',
    steps: [
      { positionCode: 'MEAL_1', days: 2, action: 'submit', stageOrder: 1, note: 'Specification and budget line confirmed.' },
      { positionCode: 'PROC_OFF', days: 6, action: 'submit', stageOrder: 2, note: 'Three quotations collected and the comparison table is attached.' },
      { positionCode: 'PROC_SPEC', days: 4, action: 'review', stageOrder: 3, note: 'Bid evaluation complete. Recommending supplier B on value and warranty terms.' },
      { positionCode: 'OPS_MGR', days: 0, action: 'approve', stageOrder: 4 },
    ],
    comments: [
      { positionCode: 'PROC_SPEC', body: 'Supplier B is 4% more expensive than the lowest bid but includes a two-year on-site warranty, which matters for field use.', daysAgo: 3 },
    ],
  },
  {
    title: 'Process April payment run for KUNGAHARA field staff',
    description:
      'Prepare and release the April payment run covering field allowances and travel reimbursements for 24 KUNGAHARA staff.',
    taskTypeCode: 'PAYMENT',
    workflowCode: 'PAYMENT',
    projectCode: 'KUNGAHARA',
    departmentCode: 'FIN',
    priority: 'HIGH',
    createdByPosition: 'FIN_MGR',
    createdDaysAgo: 9,
    deadlineInDays: -2,
    tags: ['compliance', 'urgent'],
    outcome: 'CHANGES_REQUESTED',
    steps: [
      { positionCode: 'FIN_OFF', days: 3, action: 'submit', stageOrder: 1, note: 'Voucher prepared with supporting documents.' },
      { positionCode: 'FIN_SUP', days: 2, action: 'changes', stageOrder: 2, note: 'Please correct the financial figures in section 3 - the per-diem rate used is last year’s.' },
      { positionCode: 'FIN_OFF', days: 0, action: 'work', stageOrder: 1 },
    ],
    comments: [
      { positionCode: 'FIN_SUP', body: 'The per-diem rate changed in January. Rows 12 to 24 need recalculating before this can go to the Finance Manager.', daysAgo: 4 },
    ],
  },
];

SCENARIOS.push(
  {
    title: 'Annual safeguarding refresher training for all field staff',
    description:
      'Design and deliver the annual safeguarding refresher, including updated case studies and the reporting-channel briefing.',
    taskTypeCode: 'GENERAL',
    workflowCode: 'GENERAL',
    projectCode: 'GEAR',
    departmentCode: 'PROG',
    priority: 'MEDIUM',
    createdByPosition: 'PROG_DIR',
    createdDaysAgo: 30,
    deadlineInDays: -5,
    tags: ['training', 'compliance'],
    outcome: 'COMPLETED',
    steps: [
      { positionCode: 'SAFEGUARD_ADV', days: 12, action: 'submit', stageOrder: 1, note: 'Materials updated and sessions delivered in all four districts.' },
      { positionCode: 'PROG_DIR', days: 3, action: 'approve', stageOrder: 2, note: 'Attendance records complete. Approved.' },
    ],
    comments: [
      { positionCode: 'SAFEGUARD_ADV', body: 'All 118 field staff attended across the four sessions. Attendance sheets and the post-training quiz results are attached.', daysAgo: 18 },
    ],
  },
  {
    title: 'Verify Powered by Women baseline dataset',
    description:
      'Run data quality checks on the baseline survey, resolve outliers with the field team and prepare the cleaned dataset for analysis.',
    taskTypeCode: 'MEAL',
    workflowCode: 'MEAL_REVIEW',
    projectCode: 'PBW',
    departmentCode: 'PQL',
    priority: 'HIGH',
    createdByPosition: 'PQL_DIR',
    createdDaysAgo: 21,
    deadlineInDays: 1,
    tags: ['field-data'],
    outcome: 'BLOCKED',
    blockedReason:
      'Waiting for the field team to re-collect 42 household records lost in the tablet sync failure.',
    steps: [
      { positionCode: 'MEAL_3', days: 8, action: 'submit', stageOrder: 1, note: 'First cleaning pass done; 42 records are missing.' },
      { positionCode: 'MEAL_1', days: 0, action: 'review', stageOrder: 2 },
    ],
    comments: [
      { positionCode: 'MEAL_1', body: '@MEAL Specialist 3 can you confirm with the district team when the missing households can be revisited? We cannot sign this off until they are back in.', daysAgo: 6, mentions: ['MEAL_3'] },
    ],
  },
  {
    title: 'Recruit two enumerators for the SERVE endline survey',
    description:
      'Run the recruitment process for two short-term enumerators: advertise, shortlist, interview and prepare contracts.',
    taskTypeCode: 'HR_REQUEST',
    workflowCode: 'HR_REQUEST',
    projectCode: 'SERVE',
    departmentCode: 'HR',
    priority: 'MEDIUM',
    createdByPosition: 'SERVE_PM',
    createdDaysAgo: 15,
    deadlineInDays: 10,
    tags: ['urgent'],
    outcome: 'IN_PROGRESS',
    steps: [
      { positionCode: 'HR_OFF', days: 0, action: 'work', stageOrder: 1, note: 'Advert drafted and shared for review.' },
    ],
    subtasks: [
      { title: 'Draft and publish the vacancy advert', positionCode: 'HR_OFF', done: true },
      { title: 'Shortlist applicants', positionCode: 'HR_OFF', done: false },
      { title: 'Run interviews with the SERVE team', positionCode: 'HR_MGR', done: false },
    ],
  },
  {
    title: 'Draft the 2026 country programme communications plan',
    description:
      'Produce the annual communications plan covering donor visibility, story collection and the social media calendar.',
    taskTypeCode: 'GENERAL',
    workflowCode: 'GENERAL',
    departmentCode: 'PQL',
    priority: 'LOW',
    createdByPosition: 'PQL_DIR',
    createdDaysAgo: 6,
    deadlineInDays: 14,
    outcome: 'ASSIGNED',
    steps: [
      { positionCode: 'COMMS_SPEC', days: 0, action: 'work', stageOrder: 1, note: 'Please build on last year’s plan and add the KUNGAHARA launch.' },
    ],
  },
  {
    title: 'Reconcile GEAR advance accounts for March',
    description: 'Clear outstanding staff advances and reconcile them against field activity reports.',
    taskTypeCode: 'PAYMENT',
    workflowCode: 'PAYMENT',
    projectCode: 'GEAR',
    departmentCode: 'FIN',
    priority: 'CRITICAL',
    createdByPosition: 'FIN_MGR',
    createdDaysAgo: 25,
    deadlineInDays: -8,
    tags: ['compliance', 'urgent'],
    outcome: 'UNDER_REVIEW',
    steps: [
      { positionCode: 'AWARD_OFF_1', days: 11, action: 'submit', stageOrder: 1, note: 'Reconciliation complete except for three advances with missing receipts.' },
      { positionCode: 'FIN_SUP', days: 0, action: 'review', stageOrder: 2 },
    ],
    comments: [
      { positionCode: 'FIN_MGR', body: 'This is now well past the donor deadline. @Finance & Accounting Supervisor please prioritise the review today.', daysAgo: 2, mentions: ['FIN_SUP'] },
    ],
  },
  {
    title: 'Arrange transport for the KUNGAHARA community launch',
    description: 'Book vehicles and drivers for the district launch events across three sites.',
    taskTypeCode: 'GENERAL',
    workflowCode: 'GENERAL',
    projectCode: 'KUNGAHARA',
    departmentCode: 'OPS',
    priority: 'MEDIUM',
    createdByPosition: 'KUNGAHARA_PM',
    createdDaysAgo: 4,
    deadlineInDays: 2,
    outcome: 'IN_PROGRESS',
    steps: [
      { positionCode: 'LOG_OFF', days: 0, action: 'work', stageOrder: 1, note: 'Three sites, roughly 60 participants in total.' },
    ],
  },
  {
    title: 'Update the enterprise development toolkit for SPRING',
    description:
      'Revise the enterprise toolkit with lessons from the first cohort and align it with the new market systems guidance.',
    taskTypeCode: 'PROGRAMME_REPORT',
    workflowCode: 'PROGRAMME_REPORT',
    projectCode: 'SPRING',
    departmentCode: 'PROG',
    priority: 'LOW',
    createdByPosition: 'SPRING_ADV',
    createdDaysAgo: 40,
    deadlineInDays: -12,
    outcome: 'COMPLETED',
    steps: [
      { positionCode: 'ENT_ADV', days: 14, action: 'submit', stageOrder: 1, note: 'Toolkit revised with cohort-one lessons.' },
      { positionCode: 'GESI_ADV', days: 6, action: 'review', stageOrder: 2, note: 'Inclusion checklist added to each module.' },
      { positionCode: 'SERVE_PM', days: 2, action: 'submit', stageOrder: 3, note: 'Consolidated and formatted.' },
      { positionCode: 'PROG_DIR', days: 2, action: 'approve', stageOrder: 4, note: 'Approved for publication.' },
    ],
  },
);

async function seedDemoWork(): Promise<void> {
  const existing = await prisma.task.count();
  if (existing > 0) {
    console.log('  tasks: skipped (' + existing + ' already present)');
    return;
  }

  for (const scenario of SCENARIOS) {
    await createScenarioTask(scenario);
  }

  const [tasks, assignments, history, comments] = await Promise.all([
    prisma.task.count(),
    prisma.taskAssignment.count(),
    prisma.taskHistory.count(),
    prisma.taskComment.count(),
  ]);
  console.log(
    '  tasks: ' + tasks + ' (' + assignments + ' ownership tenures, ' + history +
      ' history events, ' + comments + ' comments)',
  );
}

async function seedSettings(): Promise<void> {
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: setting,
      update: {},
    });
  }
  await prisma.setting.upsert({
    where: { key: 'organization.name' },
    create: {
      key: 'organization.name',
      value: 'CARE',
      category: 'general',
      label: 'Organisation name',
      description: 'Shown in the header, emails and report exports.',
    },
    update: { value: 'CARE' },
  });
  console.log('  settings: ' + DEFAULT_SETTINGS.length);
}

async function main(): Promise<void> {
  // The seed creates demo accounts that share one well-known password. That is
  // fine locally and catastrophic on a live deployment, so production has to
  // ask for it explicitly.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    console.error(
      'Refusing to seed with NODE_ENV=production.
' +
        'This creates demo accounts with a shared password.
' +
        'If you genuinely want reference data in this environment, set ' +
        'ALLOW_PRODUCTION_SEED=true and change SEED_DEFAULT_PASSWORD first.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('Seeding the CARE workflow platform...');

  console.log('- roles and permissions');
  await seedPermissionsAndRoles();

  console.log('- organisation structure');
  await seedOrganization();

  console.log('- people');
  await seedUsers();

  console.log('- projects, task types and tags');
  await seedCatalogues();

  console.log('- workflows');
  await seedWorkflows();

  console.log('- settings');
  await seedSettings();

  console.log('- demo work');
  await seedDemoWork();

  console.log('');
  console.log('Seed complete.');
  console.log('');
  console.log('  DEVELOPMENT CREDENTIALS - do not use these outside development');
  console.log('  ---------------------------------------------------------------');
  console.log('  Super administrator   admin@care.demo');
  console.log('  Country Director      country.director@care.demo');
  console.log('  Programme Director    programme.director@care.demo');
  console.log('  SERVE Project Manager serve.pm@care.demo');
  console.log('  GESI Advisor          gesi.advisor@care.demo');
  console.log('  Finance Manager       finance.manager@care.demo');
  console.log('  Operations Manager    operations.manager@care.demo');
  console.log('  Procurement Officer   procurement.officer@care.demo');
  console.log('');
  console.log('  Password for every account: ' + DEMO_PASSWORD);
  console.log('  (all ' + (USERS.length + 1) + ' demo accounts share it)');
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
