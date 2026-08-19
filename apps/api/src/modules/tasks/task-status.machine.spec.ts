import { UnprocessableEntityException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  ActorContext,
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  assertTransition,
  availableTransitions,
  canTransition,
  isTerminal,
} from './task-status.machine';

const actor = (overrides: Partial<ActorContext> = {}): ActorContext => ({
  permissions: [],
  isOwner: false,
  isSupervisor: false,
  ...overrides,
});

describe('task status machine', () => {
  describe('the documented happy path', () => {
    it('allows ASSIGNED -> IN_PROGRESS -> SUBMITTED -> UNDER_REVIEW -> APPROVED -> COMPLETED', () => {
      expect(canTransition(TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS)).toBe(true);
      expect(canTransition(TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED)).toBe(true);
      expect(canTransition(TaskStatus.SUBMITTED, TaskStatus.UNDER_REVIEW)).toBe(true);
      expect(canTransition(TaskStatus.UNDER_REVIEW, TaskStatus.APPROVED)).toBe(true);
      expect(canTransition(TaskStatus.APPROVED, TaskStatus.COMPLETED)).toBe(true);
    });

    it('allows the rework loop UNDER_REVIEW -> CHANGES_REQUESTED -> IN_PROGRESS', () => {
      expect(canTransition(TaskStatus.UNDER_REVIEW, TaskStatus.CHANGES_REQUESTED)).toBe(true);
      expect(canTransition(TaskStatus.CHANGES_REQUESTED, TaskStatus.IN_PROGRESS)).toBe(true);
    });
  });

  describe('illegal moves', () => {
    it.each([
      [TaskStatus.DRAFT, TaskStatus.COMPLETED],
      [TaskStatus.ASSIGNED, TaskStatus.APPROVED],
      [TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED],
      [TaskStatus.COMPLETED, TaskStatus.SUBMITTED],
      [TaskStatus.CANCELLED, TaskStatus.COMPLETED],
    ])('rejects %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(UnprocessableEntityException);
    });

    it('reports the refusal in language safe to show a user', () => {
      expect(() => assertTransition(TaskStatus.DRAFT, TaskStatus.COMPLETED)).toThrow(
        /This workflow transition is not allowed/,
      );
    });
  });

  describe('terminal statuses', () => {
    it('treats COMPLETED and CANCELLED as terminal', () => {
      expect(TERMINAL_STATUSES).toEqual([TaskStatus.COMPLETED, TaskStatus.CANCELLED]);
      expect(isTerminal(TaskStatus.COMPLETED)).toBe(true);
      expect(isTerminal(TaskStatus.IN_PROGRESS)).toBe(false);
    });

    it('counts every other status as open work', () => {
      expect(OPEN_STATUSES).toContain(TaskStatus.BLOCKED);
      expect(OPEN_STATUSES).not.toContain(TaskStatus.COMPLETED);
      expect(OPEN_STATUSES).not.toContain(TaskStatus.CANCELLED);
    });
  });

  describe('permission and ownership gates', () => {
    it('hides owner-only moves from an unrelated user', () => {
      const options = availableTransitions(TaskStatus.ASSIGNED, actor());
      expect(options.map((rule) => rule.to)).not.toContain(TaskStatus.IN_PROGRESS);
    });

    it('offers "start work" to the current owner', () => {
      const options = availableTransitions(TaskStatus.ASSIGNED, actor({ isOwner: true }));
      expect(options.map((rule) => rule.to)).toContain(TaskStatus.IN_PROGRESS);
    });

    it('lets a supervisor act on behalf of the owner', () => {
      const options = availableTransitions(TaskStatus.ASSIGNED, actor({ isSupervisor: true }));
      expect(options.map((rule) => rule.to)).toContain(TaskStatus.IN_PROGRESS);
    });

    it('requires approve_task to approve', () => {
      const withoutPermission = availableTransitions(TaskStatus.UNDER_REVIEW, actor());
      expect(withoutPermission.map((rule) => rule.to)).not.toContain(TaskStatus.APPROVED);

      const withPermission = availableTransitions(
        TaskStatus.UNDER_REVIEW,
        actor({ permissions: [PERMISSIONS.APPROVE_TASK] }),
      );
      expect(withPermission.map((rule) => rule.to)).toContain(TaskStatus.APPROVED);
    });

    it('requires reopen_task to revive a completed task', () => {
      const withoutPermission = availableTransitions(TaskStatus.COMPLETED, actor({ isOwner: true }));
      expect(withoutPermission).toHaveLength(0);

      const withPermission = availableTransitions(
        TaskStatus.COMPLETED,
        actor({ permissions: [PERMISSIONS.REOPEN_TASK] }),
      );
      expect(withPermission.map((rule) => rule.to)).toContain(TaskStatus.IN_PROGRESS);
    });

    it('labels each transition for the UI', () => {
      const options = availableTransitions(TaskStatus.IN_PROGRESS, actor({ isOwner: true, permissions: [PERMISSIONS.SUBMIT_TASK] }));
      const submit = options.find((rule) => rule.to === TaskStatus.SUBMITTED);
      expect(submit?.label).toBe('Submit for review');
    });
  });
});

describe('handing work straight to a reviewer', () => {
  it('allows IN_PROGRESS -> UNDER_REVIEW, the core handover scenario', () => {
    expect(canTransition(TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW)).toBe(true);
  });

  it('still allows it after rework, via IN_PROGRESS', () => {
    expect(canTransition(TaskStatus.CHANGES_REQUESTED, TaskStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW)).toBe(true);
  });

  it('requires handover_task and ownership', () => {
    const stranger = availableTransitions(TaskStatus.IN_PROGRESS, {
      permissions: [PERMISSIONS.HANDOVER_TASK],
      isOwner: false,
      isSupervisor: false,
    });
    expect(stranger.map((rule) => rule.to)).not.toContain(TaskStatus.UNDER_REVIEW);

    const owner = availableTransitions(TaskStatus.IN_PROGRESS, {
      permissions: [PERMISSIONS.HANDOVER_TASK],
      isOwner: true,
      isSupervisor: false,
    });
    expect(owner.map((rule) => rule.to)).toContain(TaskStatus.UNDER_REVIEW);
  });
});
