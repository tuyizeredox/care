import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS } from '../constants/permissions';
import { AuthenticatedUser } from '../types/authenticated-user';
import { AccessControlService } from './access-control.service';

const principal = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'user-1',
  email: 'user@care.demo',
  firstName: 'Test',
  lastName: 'User',
  roleId: 'role-1',
  roleKey: 'STAFF',
  roleLevel: 30,
  departmentId: 'dept-1',
  positionId: 'position-1',
  managerId: 'manager-1',
  permissions: [],
  ...overrides,
});

describe('AccessControlService', () => {
  let service: AccessControlService;
  let prisma: {
    user: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AccessControlService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AccessControlService);
  });

  describe('effective permissions', () => {
    it('starts from the role and adds per-user grants', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: { permissions: [{ permission: { key: 'create_task' } }] },
        permissions: [{ granted: true, permission: { key: 'approve_task' } }],
      });

      const permissions = await service.getEffectivePermissions('user-1');
      expect(permissions).toEqual(expect.arrayContaining(['create_task', 'approve_task']));
    });

    it('lets a per-user revocation override the role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: {
          permissions: [{ permission: { key: 'create_task' } }, { permission: { key: 'delete_task' } }],
        },
        permissions: [{ granted: false, permission: { key: 'delete_task' } }],
      });

      const permissions = await service.getEffectivePermissions('user-1');
      expect(permissions).toContain('create_task');
      expect(permissions).not.toContain('delete_task');
    });

    it('returns nothing for an unknown account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await service.getEffectivePermissions('missing')).toEqual([]);
    });
  });

  describe('task visibility', () => {
    it('places no restriction on someone who may view all tasks', async () => {
      const filter = await service.buildTaskVisibilityFilter(
        principal({ permissions: [PERMISSIONS.VIEW_ALL_TASKS] }),
      );
      expect(filter).toEqual({});
    });

    it('limits a staff member to their own involvement', async () => {
      const filter = await service.buildTaskVisibilityFilter(principal());
      expect(filter.OR).toEqual(
        expect.arrayContaining([
          { currentOwnerId: 'user-1' },
          { createdById: 'user-1' },
          { assignedById: 'user-1' },
        ]),
      );
      // No department-wide clause without the department permission.
      expect(JSON.stringify(filter)).not.toContain('"departmentId":"dept-1"');
    });

    it('adds the department when the user may see department tasks', async () => {
      const filter = await service.buildTaskVisibilityFilter(
        principal({ permissions: [PERMISSIONS.VIEW_DEPARTMENT_TASKS] }),
      );
      expect(JSON.stringify(filter)).toContain('"departmentId":"dept-1"');
    });

    it('adds direct and indirect reports when the user may see team tasks', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'user-1' }, { id: 'report-1' }, { id: 'report-2' }]);

      const filter = await service.buildTaskVisibilityFilter(
        principal({ permissions: [PERMISSIONS.VIEW_TEAM_TASKS] }),
      );
      expect(JSON.stringify(filter)).toContain('report-1');
      expect(JSON.stringify(filter)).toContain('report-2');
    });
  });

  describe('management chain', () => {
    it('treats a user as managing themselves', async () => {
      expect(await service.managesUser(principal(), 'user-1')).toBe(true);
    });

    it('recognises a subordinate anywhere below in the tree', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'user-1' }, { id: 'grand-report' }]);
      expect(await service.managesUser(principal(), 'grand-report')).toBe(true);
    });

    it('rejects someone outside the chain', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
      expect(await service.managesUser(principal(), 'stranger')).toBe(false);
    });
  });

  describe('has()', () => {
    it('checks a single permission', () => {
      expect(service.has(principal({ permissions: [PERMISSIONS.CREATE_TASK] }), PERMISSIONS.CREATE_TASK)).toBe(true);
      expect(service.has(principal(), PERMISSIONS.CREATE_TASK)).toBe(false);
    });
  });
});
