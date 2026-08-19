import { PERMISSIONS, PermissionKey } from './permissions';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COUNTRY_DIRECTOR: 'COUNTRY_DIRECTOR',
  DIRECTOR: 'DIRECTOR',
  MANAGER: 'MANAGER',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  SUPERVISOR: 'SUPERVISOR',
  STAFF: 'STAFF',
  VIEWER: 'VIEWER',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

const P = PERMISSIONS;

const STAFF_PERMISSIONS: PermissionKey[] = [
  P.CREATE_TASK,
  P.EDIT_TASK,
  P.SUBMIT_TASK,
  P.HANDOVER_TASK,
  P.COMMENT_TASK,
  P.UPLOAD_ATTACHMENT,
];

const SUPERVISOR_PERMISSIONS: PermissionKey[] = [
  ...STAFF_PERMISSIONS,
  P.ASSIGN_TASK,
  P.REVIEW_TASK,
  P.REJECT_TASK,
  P.VIEW_TEAM_TASKS,
  P.VIEW_REPORTS,
  P.DELETE_ATTACHMENT,
];

const PROJECT_MANAGER_PERMISSIONS: PermissionKey[] = [
  ...SUPERVISOR_PERMISSIONS,
  P.APPROVE_TASK,
  P.DELETE_TASK,
  P.VIEW_DEPARTMENT_TASKS,
  P.VIEW_ANALYTICS,
  P.EXPORT_REPORTS,
  P.MANAGE_WORKFLOWS,
];

const MANAGER_PERMISSIONS: PermissionKey[] = [
  ...PROJECT_MANAGER_PERMISSIONS,
  P.REOPEN_TASK,
  P.MANAGE_PROJECTS,
];

const DIRECTOR_PERMISSIONS: PermissionKey[] = [
  ...MANAGER_PERMISSIONS,
  P.VIEW_ALL_TASKS,
  P.VIEW_AUDIT_LOGS,
];

const COUNTRY_DIRECTOR_PERMISSIONS: PermissionKey[] = [
  ...DIRECTOR_PERMISSIONS,
  P.MANAGE_USERS,
  P.MANAGE_ORGANIZATION,
];

const ALL_PERMISSIONS: PermissionKey[] = Object.values(P);

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  level: number;
  permissions: PermissionKey[];
}

/** Seeded roles. `level` drives seniority checks (higher = more senior). */
export const ROLE_CATALOGUE: RoleDefinition[] = [
  {
    key: ROLES.SUPER_ADMIN,
    name: 'Super Administrator',
    description: 'Unrestricted access to every part of the system.',
    level: 100,
    permissions: ALL_PERMISSIONS,
  },
  {
    key: ROLES.COUNTRY_DIRECTOR,
    name: 'Country Director',
    description: 'Organisation-wide visibility, approvals, reports and analytics.',
    level: 90,
    permissions: COUNTRY_DIRECTOR_PERMISSIONS,
  },
  {
    key: ROLES.DIRECTOR,
    name: 'Director',
    description: 'Leads a functional area across departments and projects.',
    level: 80,
    permissions: DIRECTOR_PERMISSIONS,
  },
  {
    key: ROLES.MANAGER,
    name: 'Manager',
    description: 'Manages a department, team or function.',
    level: 70,
    permissions: MANAGER_PERMISSIONS,
  },
  {
    key: ROLES.PROJECT_MANAGER,
    name: 'Project Manager',
    description: 'Runs project delivery and the workflows attached to it.',
    level: 60,
    permissions: PROJECT_MANAGER_PERMISSIONS,
  },
  {
    key: ROLES.SUPERVISOR,
    name: 'Supervisor',
    description: 'Assigns, reviews and follows up on team work.',
    level: 50,
    permissions: SUPERVISOR_PERMISSIONS,
  },
  {
    key: ROLES.STAFF,
    name: 'Staff',
    description: 'Executes assigned work and hands it on.',
    level: 30,
    permissions: STAFF_PERMISSIONS,
  },
  {
    key: ROLES.VIEWER,
    name: 'Viewer',
    description: 'Read-only access to permitted tasks.',
    level: 10,
    permissions: [],
  },
];
