import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CommentQueryDto, CreateCommentDto, UpdateCommentDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('tasks/:id/comments')
  @ApiOperation({ summary: 'Discussion thread for a task' })
  findForTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CommentQueryDto,
  ) {
    return this.comments.findForTask(user, id, query);
  }

  @Post('tasks/:id/comments')
  @RequirePermissions(PERMISSIONS.COMMENT_TASK)
  @ApiOperation({ summary: 'Post a comment or reply' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(user, id, dto);
  }

  @Get('tasks/:id/mention-candidates')
  @ApiOperation({ summary: 'Users that can be mentioned on this task' })
  mentionCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('search') search?: string,
  ) {
    return this.comments.mentionCandidates(user, id, search);
  }

  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'Edit your own comment' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(user, commentId, dto);
  }

  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'Delete your own comment' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('commentId') commentId: string) {
    return this.comments.remove(user, commentId);
  }
}
