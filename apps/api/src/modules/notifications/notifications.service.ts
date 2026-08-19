import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, NotificationType, Prisma, TaskPriority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { MailService } from '../mail/mail.service';
import { EmailTemplateKey, TaskEmailContext } from '../mail/templates';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationPreferenceDto } from './dto/update-preferences.dto';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  taskId?: string | null;
  link?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  /** Extra context merged into the email template. */
  email?: Partial<TaskEmailContext>;
  /** Never notify this user (usually the actor performing the action). */
  skipUserId?: string | null;
}

const TEMPLATE_FOR_TYPE: Partial<Record<NotificationType, EmailTemplateKey>> = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_HANDED_OVER: 'TASK_HANDED_OVER',
  TASK_SUBMITTED: 'TASK_SUBMITTED',
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  TASK_APPROVED: 'TASK_APPROVED',
  TASK_REJECTED: 'TASK_REJECTED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  MENTIONED: 'MENTIONED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  DEADLINE_APPROACHING: 'DEADLINE_APPROACHING',
  DEADLINE_TODAY: 'DEADLINE_TODAY',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TEAM_TASK_OVERDUE: 'TEAM_TASK_OVERDUE',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_BLOCKED: 'TASK_BLOCKED',
};

/**
 * Single entry point for user-facing notifications.
 *
 * Writes the in-app record first (that is the durable part) and then attempts
 * email delivery, recording the outcome on the notification row. Delivery
 * failures are logged, never thrown, so business operations are unaffected.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    if (!input.userId || input.userId === input.skipUserId) return;

    try {
      const [recipient, preference] = await Promise.all([
        this.prisma.user.findFirst({
          where: { id: input.userId, deletedAt: null, status: 'ACTIVE' },
          select: { id: true, email: true, firstName: true },
        }),
        this.prisma.notificationPreference.findUnique({
          where: { userId_type: { userId: input.userId, type: input.type } },
          select: { inApp: true, email: true },
        }),
      ]);
      if (!recipient) return;

      const wantsInApp = preference?.inApp ?? true;
      const wantsEmail = preference?.email ?? true;
      if (!wantsInApp && !wantsEmail) return;

      const willEmail = wantsEmail && this.mail.isEnabled;
      const notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          taskId: input.taskId ?? null,
          link: input.link ?? null,
          metadata: input.metadata ?? Prisma.DbNull,
          emailStatus: willEmail ? DeliveryStatus.PENDING : DeliveryStatus.SKIPPED,
        },
        select: { id: true },
      });

      if (!willEmail) return;

      const template = TEMPLATE_FOR_TYPE[input.type] ?? 'SYSTEM';
      const context = await this.buildEmailContext(recipient.firstName, input);
      const sent = await this.mail.sendTemplate(template, recipient.email, context);

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { emailStatus: sent ? DeliveryStatus.SENT : DeliveryStatus.FAILED },
      });
    } catch (error) {
      this.logger.error(
        'Notification delivery failed (' + input.type + ' to ' + input.userId + ')',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Fan-out helper; duplicates and the acting user are filtered out. */
  async notifyMany(
    userIds: Array<string | null | undefined>,
    input: Omit<NotifyInput, 'userId'>,
  ): Promise<void> {
    const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))].filter(
      (id) => id !== input.skipUserId,
    );
    await Promise.all(unique.map((userId) => this.notify({ ...input, userId })));
  }

  private async buildEmailContext(
    recipientName: string,
    input: NotifyInput,
  ): Promise<TaskEmailContext> {
    const appUrl = this.config.get<string>('appUrl') ?? 'http://localhost:3000';
    const base: TaskEmailContext = {
      recipientName,
      taskNumber: 0,
      taskTitle: input.title,
      taskUrl: appUrl + (input.link ?? '/dashboard'),
      note: input.body ?? null,
      ...input.email,
    };

    if (!input.taskId) return base;

    const task = await this.prisma.task.findUnique({
      where: { id: input.taskId },
      select: {
        number: true,
        title: true,
        priority: true,
        deadline: true,
        project: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!task) return base;

    return {
      ...base,
      taskNumber: task.number,
      taskTitle: task.title,
      taskUrl: appUrl + '/tasks/' + task.number,
      projectName: task.project?.name ?? null,
      departmentName: task.department?.name ?? null,
      priority: this.humanPriority(task.priority),
      deadline: task.deadline ? task.deadline.toDateString() : null,
      ...input.email,
    };
  }

  private humanPriority(priority: TaskPriority): string {
    return priority.charAt(0) + priority.slice(1).toLowerCase();
  }

  // -------------------------------------------------------------------------
  // Reading side
  // -------------------------------------------------------------------------

  async findForUser(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<{ data: unknown[]; meta: PaginationMeta & { unreadCount: number } }> {
    const { page, pageSize } = query;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [total, data, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          task: { select: { id: true, number: true, title: true, status: true, priority: true } },
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { data, meta: { ...buildMeta(page, pageSize, total), unreadCount } };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string): Promise<{ success: boolean }> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async markAllRead(userId: string): Promise<{ success: boolean; updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: result.count };
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { success: true };
  }

  async getPreferences(userId: string) {
    const stored = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byType = new Map(stored.map((preference) => [preference.type, preference]));
    return Object.values(NotificationType).map((type) => ({
      type,
      inApp: byType.get(type)?.inApp ?? true,
      email: byType.get(type)?.email ?? true,
    }));
  }

  async updatePreferences(userId: string, preferences: NotificationPreferenceDto[]) {
    await this.prisma.$transaction(
      preferences.map((preference) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type: { userId, type: preference.type } },
          create: {
            userId,
            type: preference.type,
            inApp: preference.inApp,
            email: preference.email,
          },
          update: { inApp: preference.inApp, email: preference.email },
        }),
      ),
    );
    return this.getPreferences(userId);
  }
}
