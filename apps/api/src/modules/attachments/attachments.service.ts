import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HistoryAction, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { formatBytes, validateUpload } from '../storage/file-rules';
import { TaskHistoryService } from '../tasks/task-history.service';
import { USER_SUMMARY_SELECT } from '../users/user.select';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly accessControl: AccessControlService,
    private readonly history: TaskHistoryService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
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
        departmentId: true,
        currentOwnerId: true,
        createdById: true,
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

  async findForTask(user: AuthenticatedUser, idOrNumber: string) {
    const task = await this.loadTask(idOrNumber, user);
    const rows = await this.prisma.taskAttachment.findMany({
      where: { taskId: task.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: USER_SUMMARY_SELECT } },
    });
    return rows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      extension: row.extension,
      sizeBytes: row.sizeBytes,
      size: formatBytes(row.sizeBytes),
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
      commentId: row.commentId,
      downloadUrl: '/api/attachments/' + row.id + '/download',
    }));
  }

  async upload(
    user: AuthenticatedUser,
    idOrNumber: string,
    file: UploadedFile,
    commentId?: string,
  ) {
    const task = await this.loadTask(idOrNumber, user);
    const validated = validateUpload(file, this.storage.maxUploadBytes);

    const stored = await this.storage.save(
      {
        buffer: file.buffer,
        originalName: validated.fileName,
        mimeType: validated.mimeType,
        size: validated.sizeBytes,
      },
      'tasks/' + task.id,
    );

    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskAttachment.create({
        data: {
          taskId: task.id,
          commentId: commentId ?? null,
          uploadedById: user.id,
          fileName: validated.fileName,
          storageKey: stored.storageKey,
          storageProvider: stored.provider,
          mimeType: validated.mimeType,
          extension: validated.extension,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
        },
        include: { uploadedBy: { select: USER_SUMMARY_SELECT } },
      });

      await this.history.record(
        {
          taskId: task.id,
          actorId: user.id,
          action: HistoryAction.ATTACHMENT_ADDED,
          summary: 'Attached ' + validated.fileName + ' (' + formatBytes(stored.sizeBytes) + ')',
          toValue: validated.fileName,
          metadata: { attachmentId: created.id, sizeBytes: stored.sizeBytes },
        },
        tx,
      );
      return created;
    });

    await this.notifications.notifyMany([task.currentOwnerId, task.createdById], {
      type: NotificationType.SYSTEM,
      title: 'New file on #' + task.number + ' ' + task.title,
      body: validated.fileName,
      taskId: task.id,
      link: '/tasks/' + task.number,
      skipUserId: user.id,
    });

    await this.audit.record({
      actorId: user.id,
      action: 'attachment.uploaded',
      resourceType: 'TaskAttachment',
      resourceId: attachment.id,
      summary: 'Uploaded ' + validated.fileName + ' to task #' + task.number,
      departmentId: task.departmentId,
      after: { fileName: validated.fileName, sizeBytes: stored.sizeBytes },
    });

    return {
      ...attachment,
      size: formatBytes(attachment.sizeBytes),
      downloadUrl: '/api/attachments/' + attachment.id + '/download',
    };
  }

  /**
   * Streams a file back to an authorised caller. Downloads always go through
   * this check - storage keys are never exposed to the browser.
   */
  async download(user: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.prisma.taskAttachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      select: {
        id: true,
        taskId: true,
        fileName: true,
        mimeType: true,
        storageKey: true,
        sizeBytes: true,
      },
    });
    if (!attachment) throw new NotFoundException('This file could not be found.');

    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);
    const visible = await this.prisma.task.count({
      where: { id: attachment.taskId, deletedAt: null, AND: [visibility] },
    });
    if (visible === 0) {
      throw new ForbiddenException('You do not have permission to open this file.');
    }

    const object = await this.storage.read(attachment.storageKey);
    return {
      buffer: object.buffer,
      fileName: attachment.fileName,
      mimeType: object.mimeType ?? attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  async remove(user: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.prisma.taskAttachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      select: {
        id: true,
        taskId: true,
        fileName: true,
        uploadedById: true,
        storageKey: true,
        task: { select: { number: true, departmentId: true } },
      },
    });
    if (!attachment) throw new NotFoundException('This file could not be found.');

    const isUploader = attachment.uploadedById === user.id;
    const mayDelete = (user.permissions ?? []).includes(PERMISSIONS.DELETE_ATTACHMENT);
    if (!isUploader && !mayDelete) {
      throw new ForbiddenException('You do not have permission to remove this file.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.taskAttachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date() },
      });
      await this.history.record(
        {
          taskId: attachment.taskId,
          actorId: user.id,
          action: HistoryAction.ATTACHMENT_REMOVED,
          summary: 'Removed the attachment ' + attachment.fileName,
          fromValue: attachment.fileName,
        },
        tx,
      );
    });

    // Storage cleanup is best-effort: the record is already soft-deleted, and
    // a failed unlink must not fail the request.
    await this.storage.delete(attachment.storageKey).catch(() => undefined);

    await this.audit.record({
      actorId: user.id,
      action: 'attachment.deleted',
      resourceType: 'TaskAttachment',
      resourceId: attachmentId,
      summary: 'Removed ' + attachment.fileName + ' from task #' + attachment.task.number,
      departmentId: attachment.task.departmentId,
    });
    return { success: true };
  }
}
