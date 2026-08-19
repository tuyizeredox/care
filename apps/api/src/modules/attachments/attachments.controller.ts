import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AttachmentsService, UploadedFile as StoredUpload } from './attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ALLOWED_EXTENSIONS } from '../storage/file-rules';

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('tasks/:id/attachments')
  @ApiOperation({ summary: 'Files attached to a task' })
  findForTask(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attachments.findForTask(user, id);
  }

  @Post('tasks/:id/attachments')
  @RequirePermissions(PERMISSIONS.UPLOAD_ATTACHMENT)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file (' + ALLOWED_EXTENSIONS.join(', ') + ')' })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: StoredUpload,
    @Query('commentId') commentId?: string,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    return this.attachments.upload(user, id, file, commentId);
  }

  @Get('attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Download an attachment' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.attachments.download(user, attachmentId);
    // Force a download and stop the browser from sniffing a different type.
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.sizeBytes);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="' + encodeURIComponent(file.fileName) + '"',
    );
    response.end(file.buffer);
  }

  @Delete('attachments/:attachmentId')
  @ApiOperation({ summary: 'Remove an attachment' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.attachments.remove(user, attachmentId);
  }
}
