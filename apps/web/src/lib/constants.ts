import type { LucideIcon } from 'lucide-react';
import {
  AlertOctagon,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  ClipboardCheck,
  FileEdit,
  RotateCcw,
  Send,
  ShieldCheck,
} from 'lucide-react';

export type TaskStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'CANCELLED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface StatusMeta {
  label: string;
  /** Badge classes - deliberately low-saturation so lists stay readable. */
  badge: string;
  dot: string;
  icon: LucideIcon;
  description: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  DRAFT: {
    label: 'Draft',
    badge: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    dot: 'bg-slate-400',
    icon: FileEdit,
    description: 'Not yet assigned to anyone.',
  },
  ASSIGNED: {
    label: 'Assigned',
    badge: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900',
    dot: 'bg-blue-500',
    icon: CircleDashed,
    description: 'Waiting for the owner to start.',
  },
  IN_PROGRESS: {
    label: 'In progress',
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900',
    dot: 'bg-indigo-500',
    icon: CircleDot,
    description: 'Being worked on right now.',
  },
  SUBMITTED: {
    label: 'Submitted',
    badge: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900',
    dot: 'bg-violet-500',
    icon: Send,
    description: 'Submitted and waiting to be picked up.',
  },
  UNDER_REVIEW: {
    label: 'Under review',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
    dot: 'bg-amber-500',
    icon: ClipboardCheck,
    description: 'A reviewer is looking at it.',
  },
  CHANGES_REQUESTED: {
    label: 'Changes requested',
    badge: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900',
    dot: 'bg-orange-500',
    icon: RotateCcw,
    description: 'Sent back for rework.',
  },
  APPROVED: {
    label: 'Approved',
    badge: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-900',
    dot: 'bg-teal-500',
    icon: ShieldCheck,
    description: 'Approved and ready to close.',
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
    description: 'Finished its full workflow.',
  },
  BLOCKED: {
    label: 'Blocked',
    badge: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
    dot: 'bg-red-500',
    icon: AlertOctagon,
    description: 'Cannot move until something is resolved.',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
    dot: 'bg-slate-300',
    icon: Ban,
    description: 'Stopped before completion.',
  },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; badge: string; bar: string }> = {
  LOW: {
    label: 'Low',
    badge: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    bar: 'bg-slate-300',
  },
  MEDIUM: {
    label: 'Medium',
    badge: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900',
    bar: 'bg-sky-400',
  },
  HIGH: {
    label: 'High',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
    bar: 'bg-amber-500',
  },
  CRITICAL: {
    label: 'Critical',
    badge: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
    bar: 'bg-red-500',
  },
};

export const WAITING_REASON_LABELS: Record<string, string> = {
  NONE: 'Nothing pending',
  ACTION: 'Action',
  REVIEW: 'Review',
  APPROVAL: 'Approval',
  DOCUMENTS: 'Documents',
  INFORMATION: 'Information',
  EXTERNAL_PARTY: 'External party',
  BLOCKED: 'Blocker resolution',
};

/** Columns of the Kanban board, in workflow order. */
export const KANBAN_COLUMNS: TaskStatus[] = [
  'ASSIGNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'COMPLETED',
];

export const CHART_COLORS = [
  '#1F3A5F',
  '#2E7D74',
  '#B26B3E',
  '#6B5B95',
  '#4A7C59',
  '#8C5F6B',
  '#5B7C99',
  '#8A7145',
];
