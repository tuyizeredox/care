import { Injectable } from '@nestjs/common';
import { ApprovalStatus, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { getDeadlineMeta, humanizeDuration } from '../../common/utils/date.util';
import { AnalyticsService } from '../analytics/analytics.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { OPEN_STATUSES } from '../tasks/task-status.machine';
import { ReportQueryDto, ReportType } from './dto';

export interface ReportColumn {
  key: string;
  label: string;
  /** Right-aligns numbers and formats them in exports. */
  numeric?: boolean;
}

export interface ReportResult {
  type: ReportType;
  title: string;
  description: string;
  generatedAt: Date;
  filters: Record<string, unknown>;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  summary: Array<{ label: string; value: string | number }>;
}

const REPORT_TITLES: Record<ReportType, { title: string; description: string }> = {
  'task-completion': {
    title: 'Task completion report',
    description: 'Tasks completed in the selected period, with cycle times.',
  },
  overdue: {
    title: 'Overdue task report',
    description: 'Open tasks past their deadline, grouped by owner and department.',
  },
  'department-performance': {
    title: 'Department performance',
    description: 'Volume, completion rate and average completion time per department.',
  },
  'employee-workload': {
    title: 'Employee workload',
    description: 'Active, overdue and awaiting-review counts per employee.',
  },
  'project-performance': {
    title: 'Project performance',
    description: 'Progress and delivery metrics for each project.',
  },
  'workflow-performance': {
    title: 'Workflow performance',
    description: 'Cycle time and handover counts per configured workflow.',
  },
  bottleneck: {
    title: 'Bottleneck report',
    description: 'Where work waits longest across the organisation.',
  },
  approval: {
    title: 'Approval report',
    description: 'Approval decisions, turnaround times and outstanding requests.',
  },
  'task-aging': {
    title: 'Task aging report',
    description: 'How long open work has been outstanding.',
  },
  'monthly-activity': {
    title: 'Monthly activity report',
    description: 'Tasks created, completed and handed over per month.',
  },
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly analytics: AnalyticsService,
    private readonly dashboard: DashboardService,
  ) {}

  listAvailable() {
    return Object.entries(REPORT_TITLES).map(([type, meta]) => ({ type, ...meta }));
  }

  private async scope(
    user: AuthenticatedUser,
    query: ReportQueryDto,
  ): Promise<Prisma.TaskWhereInput> {
    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);
    return {
      deletedAt: null,
      AND: [
        visibility,
        {
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.projectId ? { projectId: query.projectId } : {}),
          ...(query.workflowId ? { workflowId: query.workflowId } : {}),
          ...(query.userId ? { currentOwnerId: query.userId } : {}),
          ...(query.status?.length ? { status: { in: query.status } } : {}),
          ...(query.priority?.length ? { priority: { in: query.priority } } : {}),
          ...(query.dateFrom || query.dateTo
            ? {
                createdAt: {
                  ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                  ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
                },
              }
            : {}),
        },
      ],
    };
  }

  async generate(user: AuthenticatedUser, query: ReportQueryDto): Promise<ReportResult> {
    const meta = REPORT_TITLES[query.type];
    const base = {
      type: query.type,
      title: meta.title,
      description: meta.description,
      generatedAt: new Date(),
      filters: { ...query },
    };

    switch (query.type) {
      case 'task-completion':
        return { ...base, ...(await this.taskCompletion(user, query)) };
      case 'overdue':
        return { ...base, ...(await this.overdue(user, query)) };
      case 'department-performance':
        return { ...base, ...(await this.departmentPerformance()) };
      case 'employee-workload':
        return { ...base, ...(await this.employeeWorkload(query)) };
      case 'project-performance':
        return { ...base, ...(await this.projectPerformance()) };
      case 'workflow-performance':
        return { ...base, ...(await this.workflowPerformance(query)) };
      case 'bottleneck':
        return { ...base, ...(await this.bottleneck(query)) };
      case 'approval':
        return { ...base, ...(await this.approvals(user, query)) };
      case 'task-aging':
        return { ...base, ...(await this.aging(query)) };
      default:
        return { ...base, ...(await this.monthlyActivity(user, query)) };
    }
  }

  private async taskCompletion(user: AuthenticatedUser, query: ReportQueryDto) {
    const where = await this.scope(user, query);
    const tasks = await this.prisma.task.findMany({
      where: { ...where, status: TaskStatus.COMPLETED, completedAt: { not: null } },
      select: {
        number: true,
        title: true,
        priority: true,
        createdAt: true,
        deadline: true,
        completedAt: true,
        currentOwner: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        project: { select: { name: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: 5000,
    });

    const rows = tasks.map((task) => {
      const cycleSeconds = Math.floor(
        ((task.completedAt as Date).getTime() - task.createdAt.getTime()) / 1000,
      );
      const onTime = task.deadline ? (task.completedAt as Date) <= task.deadline : null;
      return {
        number: '#' + task.number,
        title: task.title,
        department: task.department?.name ?? '-',
        project: task.project?.name ?? '-',
        owner: task.currentOwner
          ? task.currentOwner.firstName + ' ' + task.currentOwner.lastName
          : '-',
        priority: task.priority,
        completedAt: (task.completedAt as Date).toISOString().slice(0, 10),
        cycleTime: humanizeDuration(cycleSeconds),
        cycleHours: Math.round((cycleSeconds / 3600) * 10) / 10,
        handovers: Math.max(0, task._count.assignments - 1),
        onTime: onTime === null ? '-' : onTime ? 'Yes' : 'No',
      };
    });

    const onTimeCount = rows.filter((row) => row.onTime === 'Yes').length;
    const withDeadline = rows.filter((row) => row.onTime !== '-').length;
    const averageHours =
      rows.length > 0
        ? Math.round((rows.reduce((sum, row) => sum + row.cycleHours, 0) / rows.length) * 10) / 10
        : 0;

    return {
      columns: [
        { key: 'number', label: 'Task' },
        { key: 'title', label: 'Title' },
        { key: 'department', label: 'Department' },
        { key: 'project', label: 'Project' },
        { key: 'owner', label: 'Completed by' },
        { key: 'priority', label: 'Priority' },
        { key: 'completedAt', label: 'Completed' },
        { key: 'cycleTime', label: 'Cycle time' },
        { key: 'handovers', label: 'Handovers', numeric: true },
        { key: 'onTime', label: 'On time' },
      ],
      rows,
      summary: [
        { label: 'Tasks completed', value: rows.length },
        { label: 'Average cycle time', value: humanizeDuration(averageHours * 3600) },
        {
          label: 'Delivered on time',
          value: withDeadline > 0 ? Math.round((onTimeCount / withDeadline) * 100) + '%' : 'n/a',
        },
      ],
    };
  }

  private async overdue(user: AuthenticatedUser, query: ReportQueryDto) {
    const where = await this.scope(user, query);
    const now = new Date();
    const tasks = await this.prisma.task.findMany({
      where: { ...where, status: { in: OPEN_STATUSES }, deadline: { lt: now } },
      select: {
        number: true,
        title: true,
        status: true,
        priority: true,
        deadline: true,
        completedAt: true,
        currentOwner: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        project: { select: { name: true } },
        waitingReason: true,
      },
      orderBy: { deadline: 'asc' },
      take: 5000,
    });

    const rows = tasks.map((task) => {
      const meta = getDeadlineMeta(task.deadline, now, task.completedAt);
      return {
        number: '#' + task.number,
        title: task.title,
        department: task.department?.name ?? '-',
        project: task.project?.name ?? '-',
        owner: task.currentOwner
          ? task.currentOwner.firstName + ' ' + task.currentOwner.lastName
          : 'Unassigned',
        status: task.status,
        priority: task.priority,
        deadline: task.deadline ? task.deadline.toISOString().slice(0, 10) : '-',
        daysOverdue: meta.daysOverdue,
        waitingFor: task.waitingReason,
      };
    });

    const critical = rows.filter((row) => row.priority === 'CRITICAL').length;
    const worst = rows.length > 0 ? Math.max(...rows.map((row) => row.daysOverdue)) : 0;

    return {
      columns: [
        { key: 'number', label: 'Task' },
        { key: 'title', label: 'Title' },
        { key: 'department', label: 'Department' },
        { key: 'owner', label: 'Current owner' },
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority' },
        { key: 'deadline', label: 'Deadline' },
        { key: 'daysOverdue', label: 'Days overdue', numeric: true },
        { key: 'waitingFor', label: 'Waiting for' },
      ],
      rows,
      summary: [
        { label: 'Overdue tasks', value: rows.length },
        { label: 'Critical priority', value: critical },
        { label: 'Longest overdue', value: worst + ' days' },
      ],
    };
  }

  private async departmentPerformance() {
    const data = await this.dashboard.departmentPerformance();
    const rows = data.map((entry) => ({
      department: entry.department.name,
      total: entry.total,
      active: entry.active,
      completed: entry.completed,
      overdue: entry.overdue,
      completionRate: entry.completionRate + '%',
      averageCompletion: entry.averageCompletion ?? '-',
    }));

    return {
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'total', label: 'Total', numeric: true },
        { key: 'active', label: 'Active', numeric: true },
        { key: 'completed', label: 'Completed', numeric: true },
        { key: 'overdue', label: 'Overdue', numeric: true },
        { key: 'completionRate', label: 'Completion rate' },
        { key: 'averageCompletion', label: 'Avg completion time' },
      ],
      rows,
      summary: [
        { label: 'Departments', value: rows.length },
        { label: 'Total tasks', value: data.reduce((sum, entry) => sum + entry.total, 0) },
        { label: 'Total overdue', value: data.reduce((sum, entry) => sum + entry.overdue, 0) },
      ],
    };
  }

  private async employeeWorkload(query: ReportQueryDto) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.userId ? { id: query.userId } : {}),
      },
      select: { id: true },
    });

    const workload = await this.dashboard.employeeWorkload(users.map((user) => user.id));
    const rows = workload.map((entry) => ({
      employee: entry.user.firstName + ' ' + entry.user.lastName,
      position: entry.user.position?.title ?? '-',
      department: entry.user.department?.name ?? '-',
      active: entry.activeTasks,
      overdue: entry.overdueTasks,
      awaitingReview: entry.awaitingReview,
    }));

    return {
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'position', label: 'Position' },
        { key: 'department', label: 'Department' },
        { key: 'active', label: 'Active tasks', numeric: true },
        { key: 'overdue', label: 'Overdue', numeric: true },
        { key: 'awaitingReview', label: 'Awaiting review', numeric: true },
      ],
      rows,
      summary: [
        { label: 'Employees', value: rows.length },
        { label: 'Active tasks', value: rows.reduce((sum, row) => sum + row.active, 0) },
        {
          label: 'Busiest',
          value: rows.length > 0 ? rows[0].employee + ' (' + rows[0].active + ')' : '-',
        },
      ],
    };
  }

  private async projectPerformance() {
    const data = await this.dashboard.projectPerformance();
    const rows = data.map((entry) => ({
      project: entry.project.name,
      code: entry.project.code,
      total: entry.total,
      active: entry.active,
      completed: entry.completed,
      overdue: entry.overdue,
      progress: entry.completionRate + '%',
    }));

    return {
      columns: [
        { key: 'project', label: 'Project' },
        { key: 'code', label: 'Code' },
        { key: 'total', label: 'Total', numeric: true },
        { key: 'active', label: 'Active', numeric: true },
        { key: 'completed', label: 'Completed', numeric: true },
        { key: 'overdue', label: 'Overdue', numeric: true },
        { key: 'progress', label: 'Progress' },
      ],
      rows,
      summary: [{ label: 'Projects', value: rows.length }],
    };
  }

  private async workflowPerformance(query: ReportQueryDto) {
    const data = await this.analytics.workflowPerformance({
      departmentId: query.departmentId,
      projectId: query.projectId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    const rows = data.map((entry) => ({
      workflow: entry.workflow.name,
      code: entry.workflow.code,
      active: entry.active,
      completed: entry.completed,
      averageCycle: entry.averageCycle,
      medianCycle: entry.medianCycle,
      averageHandovers: entry.averageHandovers,
    }));

    return {
      columns: [
        { key: 'workflow', label: 'Workflow' },
        { key: 'code', label: 'Code' },
        { key: 'active', label: 'Active', numeric: true },
        { key: 'completed', label: 'Completed', numeric: true },
        { key: 'averageCycle', label: 'Avg cycle time' },
        { key: 'medianCycle', label: 'Median cycle time' },
        { key: 'averageHandovers', label: 'Avg handovers', numeric: true },
      ],
      rows,
      summary: [{ label: 'Workflows', value: rows.length }],
    };
  }

  private async bottleneck(query: ReportQueryDto) {
    const filters = {
      departmentId: query.departmentId,
      projectId: query.projectId,
      workflowId: query.workflowId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };
    const [stages, people] = await Promise.all([
      this.analytics.bottlenecksByStage(filters),
      this.analytics.bottlenecksByPerson(filters),
    ]);

    const rows = stages.map((entry) => ({
      stage: entry.stage?.name ?? 'Unassigned stage',
      workflow: entry.stage?.workflow?.name ?? '-',
      passes: entry.passes,
      averageHold: entry.averageHold,
      medianHold: entry.medianHold,
      longestHold: entry.longestHold,
      slaBreaches: entry.slaBreaches,
      slaBreachRate: entry.slaBreachRate + '%',
    }));

    const slowest = people.rows[0];
    return {
      columns: [
        { key: 'stage', label: 'Stage' },
        { key: 'workflow', label: 'Workflow' },
        { key: 'passes', label: 'Times passed through', numeric: true },
        { key: 'averageHold', label: 'Average hold' },
        { key: 'medianHold', label: 'Median hold' },
        { key: 'longestHold', label: 'Longest hold' },
        { key: 'slaBreaches', label: 'SLA breaches', numeric: true },
        { key: 'slaBreachRate', label: 'Breach rate' },
      ],
      rows,
      summary: [
        { label: 'Stages analysed', value: rows.length },
        { label: 'Organisation average hold', value: people.overallAverage },
        {
          label: 'Longest average hold',
          value: slowest
            ? (slowest.user
                ? slowest.user.firstName + ' ' + slowest.user.lastName
                : 'Unknown') + ' - ' + slowest.averageHold
            : '-',
        },
      ],
    };
  }

  private async approvals(user: AuthenticatedUser, query: ReportQueryDto) {
    const taskScope = await this.scope(user, query);
    const approvals = await this.prisma.approval.findMany({
      where: { task: taskScope },
      select: {
        status: true,
        createdAt: true,
        decidedAt: true,
        comment: true,
        approver: { select: { firstName: true, lastName: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
        task: {
          select: { number: true, title: true, department: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const rows = approvals.map((approval) => {
      const turnaround = approval.decidedAt
        ? Math.floor((approval.decidedAt.getTime() - approval.createdAt.getTime()) / 1000)
        : null;
      return {
        task: '#' + approval.task.number + ' ' + approval.task.title,
        department: approval.task.department?.name ?? '-',
        approver: approval.approver.firstName + ' ' + approval.approver.lastName,
        requestedBy: approval.requestedBy
          ? approval.requestedBy.firstName + ' ' + approval.requestedBy.lastName
          : '-',
        status: approval.status,
        requestedAt: approval.createdAt.toISOString().slice(0, 10),
        decidedAt: approval.decidedAt ? approval.decidedAt.toISOString().slice(0, 10) : '-',
        turnaround: turnaround === null ? 'Pending' : humanizeDuration(turnaround),
        reason: approval.comment ?? '',
      };
    });

    const pending = rows.filter((row) => row.status === ApprovalStatus.PENDING).length;
    const approved = rows.filter((row) => row.status === ApprovalStatus.APPROVED).length;
    const rejected = rows.filter((row) => row.status === ApprovalStatus.REJECTED).length;

    return {
      columns: [
        { key: 'task', label: 'Task' },
        { key: 'department', label: 'Department' },
        { key: 'approver', label: 'Approver' },
        { key: 'requestedBy', label: 'Requested by' },
        { key: 'status', label: 'Decision' },
        { key: 'requestedAt', label: 'Requested' },
        { key: 'decidedAt', label: 'Decided' },
        { key: 'turnaround', label: 'Turnaround' },
        { key: 'reason', label: 'Reason' },
      ],
      rows,
      summary: [
        { label: 'Approval requests', value: rows.length },
        { label: 'Pending', value: pending },
        { label: 'Approved', value: approved },
        { label: 'Rejected', value: rejected },
      ],
    };
  }

  private async aging(query: ReportQueryDto) {
    const data = await this.analytics.taskAging({
      departmentId: query.departmentId,
      projectId: query.projectId,
      workflowId: query.workflowId,
    });

    const rows = data.oldest.map((task) => ({
      number: '#' + task.number,
      title: task.title,
      department: task.department?.name ?? '-',
      owner: task.currentOwner
        ? task.currentOwner.firstName + ' ' + task.currentOwner.lastName
        : 'Unassigned',
      status: task.status,
      priority: task.priority,
      ageDays: task.ageDays,
      heldFor: task.heldFor ?? '-',
    }));

    return {
      columns: [
        { key: 'number', label: 'Task' },
        { key: 'title', label: 'Title' },
        { key: 'department', label: 'Department' },
        { key: 'owner', label: 'Current owner' },
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority' },
        { key: 'ageDays', label: 'Age (days)', numeric: true },
        { key: 'heldFor', label: 'With current owner' },
      ],
      rows,
      summary: [
        { label: 'Open tasks', value: data.total },
        ...data.buckets.map((bucket) => ({ label: bucket.label, value: bucket.count })),
      ],
    };
  }

  private async monthlyActivity(user: AuthenticatedUser, query: ReportQueryDto) {
    const where = await this.scope(user, query);
    const months = 12;
    const now = new Date();
    const rows: Array<Record<string, string | number>> = [];

    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);

      const [created, completed, handovers] = await this.prisma.$transaction([
        this.prisma.task.count({ where: { ...where, createdAt: { gte: from, lte: to } } }),
        this.prisma.task.count({
          where: { ...where, status: TaskStatus.COMPLETED, completedAt: { gte: from, lte: to } },
        }),
        this.prisma.taskAssignment.count({
          where: { task: where, enteredAt: { gte: from, lte: to } },
        }),
      ]);

      rows.push({
        month: from.toLocaleString('en', { month: 'short', year: 'numeric' }),
        created,
        completed,
        handovers,
        netOpen: created - completed,
      });
    }

    return {
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'created', label: 'Created', numeric: true },
        { key: 'completed', label: 'Completed', numeric: true },
        { key: 'handovers', label: 'Handovers', numeric: true },
        { key: 'netOpen', label: 'Net change', numeric: true },
      ],
      rows,
      summary: [
        {
          label: 'Created (12 months)',
          value: rows.reduce((sum, row) => sum + Number(row.created), 0),
        },
        {
          label: 'Completed (12 months)',
          value: rows.reduce((sum, row) => sum + Number(row.completed), 0),
        },
        {
          label: 'Handovers (12 months)',
          value: rows.reduce((sum, row) => sum + Number(row.handovers), 0),
        },
      ],
    };
  }
}
