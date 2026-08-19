import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { ApprovalDecisionDto, ApprovalQueryDto, RequestApprovalDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Approvals')
@ApiBearerAuth()
@Controller()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('approvals')
  @ApiOperation({ summary: 'Approvals waiting on me (or filtered)' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ApprovalQueryDto) {
    return this.approvals.findAll(user, query);
  }

  @Get('approvals/pending-count')
  @ApiOperation({ summary: 'How many approvals are waiting on me' })
  pendingCount(@CurrentUser('id') userId: string) {
    return this.approvals.pendingCount(userId);
  }

  @Get('approvals/:id')
  @ApiOperation({ summary: 'Approval detail' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvals.findOne(user, id);
  }

  @Post('tasks/:taskId/approvals')
  @RequirePermissions(PERMISSIONS.HANDOVER_TASK)
  @ApiOperation({ summary: 'Request approval from someone' })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Body() dto: RequestApprovalDto,
  ) {
    return this.approvals.request(user, taskId, dto);
  }

  @Post('approvals/:id/approve')
  @RequirePermissions(PERMISSIONS.APPROVE_TASK)
  @ApiOperation({ summary: 'Approve' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvals.approve(user, id, dto?.comment);
  }

  @Post('approvals/:id/reject')
  @RequirePermissions(PERMISSIONS.REJECT_TASK)
  @ApiOperation({ summary: 'Reject with a reason' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    if (!dto?.comment?.trim()) {
      throw new BadRequestException('Give a reason so the team knows what went wrong.');
    }
    return this.approvals.reject(user, id, dto.comment, dto.returnToUserId);
  }

  @Post('approvals/:id/request-changes')
  @RequirePermissions(PERMISSIONS.REVIEW_TASK)
  @ApiOperation({ summary: 'Send back for changes' })
  requestChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    if (!dto?.comment?.trim()) {
      throw new BadRequestException('Explain what needs to change before sending the task back.');
    }
    return this.approvals.requestChanges(user, id, dto.comment, dto.returnToUserId);
  }

  @Post('approvals/:id/cancel')
  @ApiOperation({ summary: 'Cancel an approval request you made' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvals.cancel(user, id);
  }
}
