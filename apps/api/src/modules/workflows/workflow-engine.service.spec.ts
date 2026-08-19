import { Test } from '@nestjs/testing';
import { AssigneeMode, StageType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowEngineService, type WorkflowWithStages } from './workflow-engine.service';

const stage = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'stage-1',
    workflowId: 'wf-1',
    name: 'Stage',
    description: null,
    order: 1,
    type: StageType.WORK,
    assigneeMode: AssigneeMode.UNASSIGNED,
    assigneeUserId: null,
    positionId: null,
    roleId: null,
    entryStatus: TaskStatus.ASSIGNED,
    requiresApproval: false,
    slaHours: null,
    isFinal: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    assigneeUser: null,
    position: null,
    role: null,
    ...overrides,
  }) as unknown as WorkflowWithStages['stages'][number];

const workflow = (
  stages: WorkflowWithStages['stages'],
  transitions: WorkflowWithStages['transitions'] = [],
): WorkflowWithStages =>
  ({ id: 'wf-1', stages, transitions }) as unknown as WorkflowWithStages;

describe('WorkflowEngineService', () => {
  let engine: WorkflowEngineService;
  let prisma: {
    user: { findMany: jest.Mock; findUnique: jest.Mock };
    department: { findUnique: jest.Mock };
    project: { findUnique: jest.Mock };
    taskWorkflow: { findFirst: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), findUnique: jest.fn() },
      department: { findUnique: jest.fn() },
      project: { findUnique: jest.fn() },
      taskWorkflow: { findFirst: jest.fn(), findMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [WorkflowEngineService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    engine = moduleRef.get(WorkflowEngineService);
  });

  describe('stage navigation', () => {
    const chain = [
      stage({ id: 's1', order: 1 }),
      stage({ id: 's2', order: 2 }),
      stage({ id: 's3', order: 3, isFinal: true }),
    ];

    it('starts at the first stage', () => {
      expect(engine.getFirstStage(workflow(chain))?.id).toBe('s1');
    });

    it('walks the chain in order when no transitions are defined', () => {
      expect(engine.getNextStage(workflow(chain), 's1')?.id).toBe('s2');
      expect(engine.getNextStage(workflow(chain), 's2')?.id).toBe('s3');
    });

    it('returns null past the last stage', () => {
      expect(engine.getNextStage(workflow(chain), 's3')).toBeNull();
    });

    it('prefers an explicit transition over linear order', () => {
      const withJump = workflow(chain, [
        { id: 't1', workflowId: 'wf-1', fromStageId: 's1', toStageId: 's3', label: null, requiresPermission: null, createdAt: new Date() },
      ] as unknown as WorkflowWithStages['transitions']);
      expect(engine.getNextStage(withJump, 's1')?.id).toBe('s3');
    });

    it('walks backwards for a rework loop', () => {
      expect(engine.getPreviousStage(workflow(chain), 's2')?.id).toBe('s1');
      expect(engine.getPreviousStage(workflow(chain), 's1')).toBeNull();
    });
  });

  describe('assignee resolution', () => {
    it('returns the named user for SPECIFIC_USER', async () => {
      const resolved = await engine.resolveStageAssignee(
        {
          assigneeMode: AssigneeMode.SPECIFIC_USER,
          assigneeUserId: 'user-7',
          positionId: null,
          roleId: null,
        },
        {},
      );
      expect(resolved).toBe('user-7');
    });

    it('prefers someone in the task department when resolving by position', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-a', departmentId: 'dept-other' },
        { id: 'user-b', departmentId: 'dept-target' },
      ]);

      const resolved = await engine.resolveStageAssignee(
        {
          assigneeMode: AssigneeMode.POSITION,
          assigneeUserId: null,
          positionId: 'position-1',
          roleId: null,
        },
        { departmentId: 'dept-target' },
      );
      expect(resolved).toBe('user-b');
    });

    it('falls back to the first holder when nobody matches the department', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-a', departmentId: 'dept-other' }]);

      const resolved = await engine.resolveStageAssignee(
        {
          assigneeMode: AssigneeMode.POSITION,
          assigneeUserId: null,
          positionId: 'position-1',
          roleId: null,
        },
        { departmentId: 'dept-target' },
      );
      expect(resolved).toBe('user-a');
    });

    it('resolves the department head', async () => {
      prisma.department.findUnique.mockResolvedValue({ headUserId: 'head-1' });
      const resolved = await engine.resolveStageAssignee(
        {
          assigneeMode: AssigneeMode.DEPARTMENT_HEAD,
          assigneeUserId: null,
          positionId: null,
          roleId: null,
        },
        { departmentId: 'dept-1' },
      );
      expect(resolved).toBe('head-1');
    });

    it('resolves the line manager of the current holder', async () => {
      prisma.user.findUnique.mockResolvedValue({ managerId: 'manager-1' });
      const resolved = await engine.resolveStageAssignee(
        {
          assigneeMode: AssigneeMode.MANAGER_OF_PREVIOUS,
          assigneeUserId: null,
          positionId: null,
          roleId: null,
        },
        { currentOwnerId: 'user-1' },
      );
      expect(resolved).toBe('manager-1');
    });

    it('returns null for an UNASSIGNED stage so the caller asks a human', async () => {
      const resolved = await engine.resolveStageAssignee(
        {
          assigneeMode: AssigneeMode.UNASSIGNED,
          assigneeUserId: null,
          positionId: null,
          roleId: null,
        },
        {},
      );
      expect(resolved).toBeNull();
    });

    it('returns null rather than guessing when a position has nobody in it', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const resolved = await engine.resolveStageAssignee(
        {
          assigneeMode: AssigneeMode.POSITION,
          assigneeUserId: null,
          positionId: 'vacant',
          roleId: null,
        },
        {},
      );
      expect(resolved).toBeNull();
    });
  });

  describe('status and waiting reason', () => {
    it('completes the task on a final stage regardless of entry status', () => {
      expect(
        engine.entryStatusFor({ type: StageType.WORK, entryStatus: TaskStatus.ASSIGNED, isFinal: true }),
      ).toBe(TaskStatus.COMPLETED);
    });

    it('uses the configured entry status otherwise', () => {
      expect(
        engine.entryStatusFor({
          type: StageType.REVIEW,
          entryStatus: TaskStatus.UNDER_REVIEW,
          isFinal: false,
        }),
      ).toBe(TaskStatus.UNDER_REVIEW);
    });

    it('maps stage type to what the task is waiting for', () => {
      expect(engine.waitingReasonFor({ type: StageType.REVIEW })).toBe('REVIEW');
      expect(engine.waitingReasonFor({ type: StageType.APPROVAL })).toBe('APPROVAL');
      expect(engine.waitingReasonFor({ type: StageType.WORK })).toBe('ACTION');
    });
  });

  describe('default workflow selection', () => {
    it('scores the most specific match highest', async () => {
      const generic = { ...workflow([]), id: 'generic', taskTypeId: null, projectId: null, departmentId: null, isDefault: true };
      const specific = { ...workflow([]), id: 'specific', taskTypeId: 'type-1', projectId: 'project-1', departmentId: null, isDefault: false };
      prisma.taskWorkflow.findMany.mockResolvedValue([generic, specific]);

      const resolved = await engine.resolveDefaultWorkflow({
        taskTypeId: 'type-1',
        projectId: 'project-1',
        departmentId: null,
      });
      expect(resolved?.id).toBe('specific');
    });

    it('returns null when nothing matches', async () => {
      prisma.taskWorkflow.findMany.mockResolvedValue([]);
      expect(await engine.resolveDefaultWorkflow({})).toBeNull();
    });
  });
});
