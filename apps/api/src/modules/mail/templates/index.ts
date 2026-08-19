import { renderEmail } from './layout';

export interface TaskEmailContext {
  recipientName: string;
  taskNumber: number;
  taskTitle: string;
  taskUrl: string;
  actorName?: string;
  actorPosition?: string;
  projectName?: string | null;
  departmentName?: string | null;
  priority?: string;
  deadline?: string | null;
  note?: string | null;
  daysUntilDue?: number;
  daysOverdue?: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplateKey =
  | 'TASK_ASSIGNED'
  | 'TASK_HANDED_OVER'
  | 'TASK_SUBMITTED'
  | 'APPROVAL_REQUESTED'
  | 'TASK_APPROVED'
  | 'TASK_REJECTED'
  | 'CHANGES_REQUESTED'
  | 'MENTIONED'
  | 'COMMENT_ADDED'
  | 'DEADLINE_APPROACHING'
  | 'DEADLINE_TODAY'
  | 'TASK_OVERDUE'
  | 'TEAM_TASK_OVERDUE'
  | 'TASK_COMPLETED'
  | 'TASK_BLOCKED'
  | 'SYSTEM';

const ref = (context: TaskEmailContext) => '#' + context.taskNumber + ' ' + context.taskTitle;

const baseFacts = (context: TaskEmailContext) => ({
  Task: '#' + context.taskNumber + ' ' + context.taskTitle,
  Project: context.projectName ?? undefined,
  Department: context.departmentName ?? undefined,
  Priority: context.priority,
  Deadline: context.deadline ?? undefined,
});

const build = (
  subject: string,
  context: TaskEmailContext,
  intro: string,
  actionLabel: string,
  extraFacts: Record<string, string | undefined> = {},
): RenderedEmail => {
  const { html, text } = renderEmail({
    title: subject,
    preheader: intro,
    greeting: 'Hi ' + context.recipientName + ',',
    intro,
    facts: { ...baseFacts(context), ...extraFacts },
    quote: context.note ?? null,
    action: { label: actionLabel, url: context.taskUrl },
  });
  return { subject, html, text };
};

/**
 * Every transactional email the platform can send. Adding a channel (SMS,
 * WhatsApp) means adding a renderer here - callers stay unchanged.
 */
export const EMAIL_TEMPLATES: Record<
  EmailTemplateKey,
  (context: TaskEmailContext) => RenderedEmail
> = {
  TASK_ASSIGNED: (c) =>
    build(
      'New task assigned: ' + ref(c),
      c,
      (c.actorName ?? 'A colleague') + ' assigned this task to you.',
      'Open task',
      { 'Assigned by': c.actorName },
    ),

  TASK_HANDED_OVER: (c) =>
    build(
      'Task handed over to you: ' + ref(c),
      c,
      (c.actorName ?? 'A colleague') +
        ' has finished their part and handed this task over to you. You are now the current owner.',
      'Take over task',
      { 'Handed over by': c.actorName, Position: c.actorPosition },
    ),

  TASK_SUBMITTED: (c) =>
    build(
      'Work submitted for review: ' + ref(c),
      c,
      (c.actorName ?? 'A colleague') + ' submitted this task and it is waiting for your review.',
      'Review submission',
      { 'Submitted by': c.actorName },
    ),

  APPROVAL_REQUESTED: (c) =>
    build(
      'Approval requested: ' + ref(c),
      c,
      (c.actorName ?? 'A colleague') + ' has requested your approval on this task.',
      'Review and approve',
      { 'Requested by': c.actorName },
    ),

  TASK_APPROVED: (c) =>
    build(
      'Task approved: ' + ref(c),
      c,
      (c.actorName ?? 'The approver') + ' approved this task.',
      'View task',
      { 'Approved by': c.actorName },
    ),

  TASK_REJECTED: (c) =>
    build(
      'Task rejected: ' + ref(c),
      c,
      (c.actorName ?? 'The approver') + ' rejected this task. The reason is below.',
      'View task',
      { 'Rejected by': c.actorName },
    ),

  CHANGES_REQUESTED: (c) =>
    build(
      'Changes requested: ' + ref(c),
      c,
      (c.actorName ?? 'The reviewer') +
        ' has requested changes before this task can move forward. It is back with you.',
      'Make changes',
      { 'Reviewed by': c.actorName },
    ),

  MENTIONED: (c) =>
    build(
      'You were mentioned on ' + ref(c),
      c,
      (c.actorName ?? 'A colleague') + ' mentioned you in a comment.',
      'Read comment',
    ),

  COMMENT_ADDED: (c) =>
    build(
      'New comment on ' + ref(c),
      c,
      (c.actorName ?? 'A colleague') + ' commented on a task you are following.',
      'Read comment',
    ),

  DEADLINE_APPROACHING: (c) =>
    build(
      'Due in ' + (c.daysUntilDue ?? 3) + ' days: ' + ref(c),
      c,
      'This task is due in ' + (c.daysUntilDue ?? 3) + ' days and is currently with you.',
      'Open task',
    ),

  DEADLINE_TODAY: (c) =>
    build('Due today: ' + ref(c), c, 'This task is due today and is currently with you.', 'Open task'),

  TASK_OVERDUE: (c) =>
    build(
      'Overdue by ' + (c.daysOverdue ?? 1) + ' day(s): ' + ref(c),
      c,
      'This task passed its deadline ' + (c.daysOverdue ?? 1) + ' day(s) ago and is still with you.',
      'Open task',
    ),

  TEAM_TASK_OVERDUE: (c) =>
    build(
      'Team task overdue: ' + ref(c),
      c,
      'A task owned by someone in your team is overdue by ' + (c.daysOverdue ?? 1) + ' day(s).',
      'View task',
      { 'Current owner': c.actorName },
    ),

  TASK_COMPLETED: (c) =>
    build(
      'Task completed: ' + ref(c),
      c,
      'This task has completed its full workflow and is now closed.',
      'View task',
    ),

  TASK_BLOCKED: (c) =>
    build(
      'Task blocked: ' + ref(c),
      c,
      (c.actorName ?? 'A colleague') + ' marked this task as blocked.',
      'View task',
    ),

  SYSTEM: (c) => build(c.taskTitle, c, c.note ?? '', 'Open OrgFlow'),
};

export { renderEmail } from './layout';
