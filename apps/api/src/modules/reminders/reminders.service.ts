import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays, endOfDay, getDeadlineMeta } from '../../common/utils/date.util';
import { NotificationsService } from '../notifications/notifications.service';
import { OPEN_STATUSES } from '../tasks/task-status.machine';

interface SweepResult {
  dueSoon: number;
  dueToday: number;
  overdue: number;
  managerAlerts: number;
}

/**
 * Daily deadline sweep.
 *
 * Runs on the schedule in `REMINDERS_CRON` and sends: a heads-up three days
 * out, a reminder on the due date, an overdue notice to the current owner, and
 * a roll-up to that owner's line manager. Notifications are de-duplicated
 * against what was already sent today, so a restart cannot spam anyone.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(process.env.REMINDERS_CRON ?? '0 7 * * *', { name: 'deadline-sweep' })
  async scheduledSweep(): Promise<void> {
    if (!this.config.get<boolean>('reminders.enabled')) {
      this.logger.debug('Deadline reminders are disabled');
      return;
    }
    const result = await this.runSweep();
    this.logger.log(
      'Deadline sweep sent ' + result.dueSoon + ' upcoming, ' + result.dueToday + ' due-today, ' +
        result.overdue + ' overdue and ' + result.managerAlerts + ' manager notices',
    );
  }

  /** Exposed so administrators can trigger the sweep manually. */
  async runSweep(now: Date = new Date()): Promise<SweepResult> {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result: SweepResult = { dueSoon: 0, dueToday: 0, overdue: 0, managerAlerts: 0 };

    const select = {
      id: true,
      number: true,
      title: true,
      deadline: true,
      completedAt: true,
      currentOwnerId: true,
      currentOwner: { select: { id: true, managerId: true } },
    } satisfies Prisma.TaskSelect;

    const openWithOwner: Prisma.TaskWhereInput = {
      deletedAt: null,
      status: { in: OPEN_STATUSES },
      currentOwnerId: { not: null },
    };

    const [dueSoon, dueToday, overdue] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          ...openWithOwner,
          deadline: { gte: endOfDay(addDays(now, 2)), lte: endOfDay(addDays(now, 3)) },
        },
        select,
      }),
      this.prisma.task.findMany({
        where: { ...openWithOwner, deadline: { gte: startOfToday, lte: endOfDay(now) } },
        select,
      }),
      this.prisma.task.findMany({
        where: { ...openWithOwner, deadline: { lt: startOfToday } },
        select,
        take: 1000,
      }),
    ]);

    for (const task of dueSoon) {
      if (await this.alreadyNotified(task.id, task.currentOwnerId, NotificationType.DEADLINE_APPROACHING, startOfToday)) {
        continue;
      }
      const meta = getDeadlineMeta(task.deadline, now, task.completedAt);
      await this.notifications.notify({
        userId: task.currentOwnerId as string,
        type: NotificationType.DEADLINE_APPROACHING,
        title: 'Task #' + task.number + ' is due in ' + meta.daysRemaining + ' days.',
        body: task.title,
        taskId: task.id,
        link: '/tasks/' + task.number,
        email: { daysUntilDue: meta.daysRemaining ?? 3 },
      });
      result.dueSoon += 1;
    }

    for (const task of dueToday) {
      if (await this.alreadyNotified(task.id, task.currentOwnerId, NotificationType.DEADLINE_TODAY, startOfToday)) {
        continue;
      }
      await this.notifications.notify({
        userId: task.currentOwnerId as string,
        type: NotificationType.DEADLINE_TODAY,
        title: 'Task #' + task.number + ' is due today.',
        body: task.title,
        taskId: task.id,
        link: '/tasks/' + task.number,
      });
      result.dueToday += 1;
    }

    for (const task of overdue) {
      const meta = getDeadlineMeta(task.deadline, now, task.completedAt);
      if (!(await this.alreadyNotified(task.id, task.currentOwnerId, NotificationType.TASK_OVERDUE, startOfToday))) {
        await this.notifications.notify({
          userId: task.currentOwnerId as string,
          type: NotificationType.TASK_OVERDUE,
          title: 'Task #' + task.number + ' is overdue by ' + meta.daysOverdue + ' day(s).',
          body: task.title,
          taskId: task.id,
          link: '/tasks/' + task.number,
          email: { daysOverdue: meta.daysOverdue },
        });
        result.overdue += 1;
      }

      const managerId = task.currentOwner?.managerId;
      if (
        managerId &&
        !(await this.alreadyNotified(task.id, managerId, NotificationType.TEAM_TASK_OVERDUE, startOfToday))
      ) {
        await this.notifications.notify({
          userId: managerId,
          type: NotificationType.TEAM_TASK_OVERDUE,
          title: 'Team task #' + task.number + ' is overdue by ' + meta.daysOverdue + ' day(s).',
          body: task.title,
          taskId: task.id,
          link: '/tasks/' + task.number,
          email: { daysOverdue: meta.daysOverdue },
        });
        result.managerAlerts += 1;
      }
    }

    return result;
  }

  private async alreadyNotified(
    taskId: string,
    userId: string | null,
    type: NotificationType,
    since: Date,
  ): Promise<boolean> {
    if (!userId) return true;
    const existing = await this.prisma.notification.count({
      where: { taskId, userId, type, createdAt: { gte: since } },
    });
    return existing > 0;
  }
}
