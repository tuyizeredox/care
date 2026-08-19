/**
 * Canonical permission catalogue.
 *
 * Permissions are seeded into the database (`permissions` table) and attached
 * to roles through `role_permissions`. The constants below are the single
 * source of truth used by `@RequirePermissions()` guards throughout the API.
 */
export const PERMISSIONS = {
  // Tasks
  CREATE_TASK: 'create_task',
  ASSIGN_TASK: 'assign_task',
  EDIT_TASK: 'edit_task',
  DELETE_TASK: 'delete_task',
  SUBMIT_TASK: 'submit_task',
  HANDOVER_TASK: 'handover_task',
  REVIEW_TASK: 'review_task',
  APPROVE_TASK: 'approve_task',
  REJECT_TASK: 'reject_task',
  REOPEN_TASK: 'reopen_task',
  VIEW_ALL_TASKS: 'view_all_tasks',
  VIEW_DEPARTMENT_TASKS: 'view_department_tasks',
  VIEW_TEAM_TASKS: 'view_team_tasks',
  // Comments & files
  COMMENT_TASK: 'comment_task',
  UPLOAD_ATTACHMENT: 'upload_attachment',
  DELETE_ATTACHMENT: 'delete_attachment',
  // Reporting & analytics
  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',
  VIEW_ANALYTICS: 'view_analytics',
  // Administration
  MANAGE_USERS: 'manage_users',
  MANAGE_ROLES: 'manage_roles',
  MANAGE_ORGANIZATION: 'manage_organization',
  MANAGE_PROJECTS: 'manage_projects',
  MANAGE_WORKFLOWS: 'manage_workflows',
  MANAGE_SETTINGS: 'manage_settings',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  key: PermissionKey;
  name: string;
  description: string;
  category: string;
}

export const PERMISSION_CATALOGUE: PermissionDefinition[] = [
  { key: PERMISSIONS.CREATE_TASK, name: 'Create task', description: 'Create new tasks', category: 'Tasks' },
  { key: PERMISSIONS.ASSIGN_TASK, name: 'Assign task', description: 'Assign or reassign a task to another employee', category: 'Tasks' },
  { key: PERMISSIONS.EDIT_TASK, name: 'Edit task', description: 'Edit task details', category: 'Tasks' },
  { key: PERMISSIONS.DELETE_TASK, name: 'Delete task', description: 'Archive or cancel a task', category: 'Tasks' },
  { key: PERMISSIONS.SUBMIT_TASK, name: 'Submit task', description: 'Submit completed work for review', category: 'Tasks' },
  { key: PERMISSIONS.HANDOVER_TASK, name: 'Handover task', description: 'Transfer ownership of a task to another employee', category: 'Tasks' },
  { key: PERMISSIONS.REVIEW_TASK, name: 'Review task', description: 'Take a submitted task under review', category: 'Approvals' },
  { key: PERMISSIONS.APPROVE_TASK, name: 'Approve task', description: 'Approve submitted work', category: 'Approvals' },
  { key: PERMISSIONS.REJECT_TASK, name: 'Reject task', description: 'Reject submitted work', category: 'Approvals' },
  { key: PERMISSIONS.REOPEN_TASK, name: 'Reopen task', description: 'Reopen a completed or cancelled task', category: 'Tasks' },
  { key: PERMISSIONS.VIEW_ALL_TASKS, name: 'View all tasks', description: 'See every task in the organisation', category: 'Visibility' },
  { key: PERMISSIONS.VIEW_DEPARTMENT_TASKS, name: 'View department tasks', description: 'See all tasks in own department', category: 'Visibility' },
  { key: PERMISSIONS.VIEW_TEAM_TASKS, name: 'View team tasks', description: 'See tasks owned by direct reports', category: 'Visibility' },
  { key: PERMISSIONS.COMMENT_TASK, name: 'Comment on task', description: 'Post comments and replies', category: 'Collaboration' },
  { key: PERMISSIONS.UPLOAD_ATTACHMENT, name: 'Upload attachment', description: 'Attach files to a task', category: 'Collaboration' },
  { key: PERMISSIONS.DELETE_ATTACHMENT, name: 'Delete attachment', description: 'Remove an attachment', category: 'Collaboration' },
  { key: PERMISSIONS.VIEW_REPORTS, name: 'View reports', description: 'Access the reporting module', category: 'Reporting' },
  { key: PERMISSIONS.EXPORT_REPORTS, name: 'Export reports', description: 'Export reports to CSV/Excel/PDF', category: 'Reporting' },
  { key: PERMISSIONS.VIEW_ANALYTICS, name: 'View analytics', description: 'Access dashboards and bottleneck analytics', category: 'Reporting' },
  { key: PERMISSIONS.MANAGE_USERS, name: 'Manage users', description: 'Create, edit and deactivate user accounts', category: 'Administration' },
  { key: PERMISSIONS.MANAGE_ROLES, name: 'Manage roles', description: 'Configure roles and permissions', category: 'Administration' },
  { key: PERMISSIONS.MANAGE_ORGANIZATION, name: 'Manage organization', description: 'Edit departments, positions and reporting lines', category: 'Administration' },
  { key: PERMISSIONS.MANAGE_PROJECTS, name: 'Manage projects', description: 'Create and edit projects', category: 'Administration' },
  { key: PERMISSIONS.MANAGE_WORKFLOWS, name: 'Manage workflows', description: 'Build and edit task workflows', category: 'Administration' },
  { key: PERMISSIONS.MANAGE_SETTINGS, name: 'Manage settings', description: 'Change system settings', category: 'Administration' },
  { key: PERMISSIONS.VIEW_AUDIT_LOGS, name: 'View audit logs', description: 'Read the system audit trail', category: 'Administration' },
];
