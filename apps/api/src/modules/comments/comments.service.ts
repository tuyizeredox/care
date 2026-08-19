import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HistoryAction, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Paginated } from '../../common/dto/pagination.dto';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskHistoryService } from '../tasks/task-history.service';
import { USER_SUMMARY_SELECT } from '../users/user.select';
import { CommentQueryDto, CreateCommentDto, UpdateCommentDto } from './dto';

const COMMENT_INCLUDE = {
  author: { select: USER_SUMMARY_SELECT },
  mentions: { select: { user: { select: USER_SUMMARY_SELECT } } },
  attachments: {
    where: { deletedAt: null },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      extension: true,
      sizeBytes: true,
      createdAt: true,
    },
  },
} satisfies Prisma.TaskCommentInclude;

/** Threaded task discussion with @mentions. */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly notifications: NotificationsService,
    private readonly history: TaskHistoryService,
  ) {}

  private async loadTask(idOrNumber: string, user: AuthenticatedUser) {
    const numeric = Number.parseInt(String(idOrNumber).replace('#', ''), 10);
    const task = await this.prisma.task.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: idOrNumber }, ...(Number.isFinite(numeric) ? [{ number: numeric }] : [])],
      },
      select: {
        id: true,
        number: true,
        title: true,
        currentOwnerId: true,
        createdById: true,
        departmentId: true,
        watchers: { select: { userId: true } },
      },
    });
    if (!task) throw new NotFoundException('This task could not be found.');

    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);
    const visible = await this.prisma.task.count({
      where: { id: task.id, deletedAt: null, AND: [visibility] },
    });
    if (visible === 0) {
      throw new ForbiddenException('You do not have permission to view this task.');
    }
    return task;
  }

  async findForTask(
    user: AuthenticatedUser,
    idOrNumber: string,
    query: CommentQueryDto,
  ): Promise<Paginated<unknown>> {
    const task = await this.loadTask(idOrNumber, user);
    const { page, pageSize } = query;
    const where: Prisma.TaskCommentWhereInput = {
      taskId: task.id,
      parentId: null,
      deletedAt: null,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.taskComment.count({ where }),
      this.prisma.taskComment.findMany({
        where,
        ...skipTake(page, pageSize),
        orderBy: { createdAt: 'asc' },
        include: {
          ...COMMENT_INCLUDE,
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            include: COMMENT_INCLUDE,
          },
        },
      }),
    ]);

    return { data, meta: buildMeta(page, pageSize, total) };
  }

  async create(user: AuthenticatedUser, idOrNumber: string, dto: CreateCommentDto) {
    const task = await this.loadTask(idOrNumber, user);

    if (dto.parentId) {
      const parent = await this.prisma.taskComment.findFirst({
        where: { id: dto.parentId, taskId: task.id, deletedAt: null },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('The comment being replied to no longer exists.');
    }

    const mentionIds = [...new Set(dto.mentionIds ?? [])].filter((id) => id !== user.id);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskComment.create({
        data: {
          taskId: task.id,
          authorId: user.id,
          parentId: dto.parentId ?? null,
          body: dto.body.trim(),
          mentions: mentionIds.length
            ? { create: mentionIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: COMMENT_INCLUDE,
      });

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.COMMENT_ADDED,
          summary: dto.parentId ? 'Replied in the discussion' : 'Added a comment',
          comment: dto.body.slice(0, 500),
          metadata: { commentId: created.id, mentioned: mentionIds },
        },
        tx,
      );

      return created;
    });

    // Commenting starts following the task, so the author sees what happens
    // next. Deliberately outside the transaction: it is a convenience, not part
    // of the comment invariant, and it must not widen the transaction window.
    await this.prisma.taskWatcher
      .upsert({
        where: { taskId_userId: { taskId: task.id, userId: user.id } },
        create: { taskId: task.id, userId: user.id },
        update: {},
      })
      .catch(() => undefined);

    const actorName = user.firstName + ' ' + user.lastName;
    const link = '/tasks/' + task.number;

    await this.notifications.notifyMany(mentionIds, {
      type: NotificationType.MENTIONED,
      title: actorName + ' mentioned you on #' + task.number,
      body: dto.body.slice(0, 300),
      taskId: task.id,
      link,
      email: { actorName },
      skipUserId: user.id,
    });

    const others = [
      task.currentOwnerId,
      task.createdById,
      ...task.watchers.map((watcher) => watcher.userId),
    ].filter((id): id is string => Boolean(id) && !mentionIds.includes(id as string));

    await this.notifications.notifyMany(others, {
      type: NotificationType.COMMENT_ADDED,
      title: 'New comment on #' + task.number + ' ' + task.title,
      body: dto.body.slice(0, 300),
      taskId: task.id,
      link,
      email: { actorName },
      skipUserId: user.id,
    });

    return comment;
  }

  async update(user: AuthenticatedUser, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!comment) throw new NotFoundException('This comment could not be found.');
    if (comment.authorId !== user.id) {
      throw new ForbiddenException('You can only edit your own comments.');
    }

    return this.prisma.taskComment.update({
      where: { id: commentId },
      data: { body: dto.body.trim(), editedAt: new Date() },
      include: COMMENT_INCLUDE,
    });
  }

  async remove(user: AuthenticatedUser, commentId: string) {
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!comment) throw new NotFoundException('This comment could not be found.');

    const isAuthor = comment.authorId === user.id;
    const isAdmin = (user.permissions ?? []).includes('manage_settings');
    if (!isAuthor && !isAdmin) {
      throw new ForbiddenException('You can only delete your own comments.');
    }

    // Soft delete - the task history entry recording the comment stays intact.
    await this.prisma.taskComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  /** Users that can be @mentioned on a task. */
  async mentionCandidates(user: AuthenticatedUser, idOrNumber: string, search?: string) {
    await this.loadTask(idOrNumber, user);
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { position: { title: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      select: USER_SUMMARY_SELECT,
      orderBy: { firstName: 'asc' },
      take: 25,
    });
  }
}
