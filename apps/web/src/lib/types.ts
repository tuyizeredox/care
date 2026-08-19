import type { TaskPriority, TaskStatus } from './constants';

export interface DepartmentRef {
  id: string;
  name: string;
  code?: string;
  color: string;
}

export interface ProjectRef {
  id: string;
  name: string;
  code: string;
  color?: string;
}

export interface PositionRef {
  id: string;
  title: string;
  level?: number;
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  jobTitle?: string | null;
  position?: PositionRef | null;
  department?: DepartmentRef | null;
}

export interface DeadlineMeta {
  state: 'none' | 'completed' | 'overdue' | 'due_today' | 'due_tomorrow' | 'due_soon' | 'on_track';
  daysRemaining: number | null;
  daysOverdue: number;
  isOverdue: boolean;
  isDueToday: boolean;
  isDueTomorrow: boolean;
}

export interface TagRef {
  id: string;
  name: string;
  color: string;
}

export interface TaskSummary {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  startDate: string | null;
  completedAt: string | null;
  submittedAt: string | null;
  ownerSince: string | null;
  progress: number;
  waitingReason: string;
  waitingSince: string | null;
  subtaskCount: number;
  completedSubtaskCount: number;
  estimatedHours: number | null;
  createdAt: string;
  updatedAt: string;
  parentTaskId: string | null;
  currentOwnerId: string | null;
  currentOwner: UserSummary | null;
  createdBy: UserSummary | null;
  assignedBy: UserSummary | null;
  waitingFor: UserSummary | null;
  department: DepartmentRef | null;
  project: ProjectRef | null;
  taskType: { id: string; name: string; code: string; icon: string | null } | null;
  workflow: { id: string; name: string; code: string } | null;
  currentStage: { id: string; name: string; order: number; type: string; slaHours: number | null } | null;
  tags: Array<{ tag: TagRef }>;
  _count: { comments: number; attachments: number; subtasks: number };
  deadlineMeta: DeadlineMeta;
  isOverdue: boolean;
  isOpen: boolean;
  timeWithOwner: string | null;
  timeWithOwnerSeconds: number | null;
}

export interface JourneyStep {
  kind: 'CREATED' | 'HANDLED' | 'CURRENT' | 'UPCOMING' | 'FINISH';
  state: 'completed' | 'current' | 'upcoming';
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
  enteredAt: string | null;
  exitedAt: string | null;
  durationSeconds: number | null;
  duration: string | null;
  breachedSla: boolean;
}

export interface TaskJourney {
  taskId: string;
  taskNumber: number;
  status: TaskStatus;
  steps: JourneyStep[];
  currentStepIndex: number;
  handoverCount: number;
  totalElapsed: string;
  totalElapsedSeconds: number;
  timePerHolder: Array<{
    userId: string;
    user: UserSummary;
    duration: string;
    hours: number;
    seconds: number;
    visits: number;
    isCurrent: boolean;
  }>;
  slowestStage: { user: UserSummary; duration: string; share: number } | null;
}

export interface TaskAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  size?: string;
  createdAt: string;
  commentId: string | null;
  uploadedBy: UserSummary;
  downloadUrl?: string;
}

export interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  parentId: string | null;
  author: UserSummary;
  mentions: Array<{ user: UserSummary }>;
  attachments: TaskAttachment[];
  replies?: TaskComment[];
}

export interface Approval {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'CANCELLED' | 'SKIPPED';
  sequence: number;
  comment: string | null;
  dueAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  approver: UserSummary;
  requestedBy: UserSummary | null;
  stage: { id: string; name: string; order: number } | null;
  task?: TaskSummary;
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  actualHours: number | null;
  blockedReason: string | null;
  cancelReason: string | null;
  approvedAt: string | null;
  parentTask: { id: string; number: number; title: string; status: TaskStatus } | null;
  subtasks: Array<{
    id: string;
    number: number;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    deadline: string | null;
    completedAt: string | null;
    currentOwner: UserSummary | null;
  }>;
  attachments: TaskAttachment[];
  approvals: Approval[];
  watchers: Array<{ user: UserSummary }>;
  commentCount: number;
  journey: TaskJourney;
  availableActions: Array<{ status: TaskStatus; label: string }>;
  viewer: {
    isOwner: boolean;
    isSupervisor: boolean;
    canEdit: boolean;
    canApprove: boolean;
    canHandover: boolean;
  };
}

export interface TaskHistoryEntry {
  id: string;
  action: string;
  summary: string;
  fromValue: string | null;
  toValue: string | null;
  comment: string | null;
  createdAt: string;
  actor: UserSummary | null;
  metadata: Record<string, unknown> | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  task: { id: string; number: number; title: string; status: TaskStatus } | null;
}

export interface CurrentUser extends UserSummary {
  phone: string | null;
  bio: string | null;
  status: string;
  timezone: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  roleId: string;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  role: { id: string; key: string; name: string; level: number };
  manager: UserSummary | null;
  permissions: string[];
}

export interface StatusTotals {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  overdue: number;
  blocked: number;
  awaitingReview: number;
  awaitingApproval: number;
  dueToday: number;
  dueThisWeek: number;
  completionRate: number;
  overduePercentage: number;
}
