import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import {
  AssignTaskDto,
  ChangeDeadlineDto,
  ChangePriorityDto,
  ChangeStatusDto,
  CreateTaskDto,
  HandoverTaskDto,
  ReviewTaskDto,
  SetWaitingDto,
  SubmitTaskDto,
  TaskQueryDto,
  UpdateTaskDto,
} from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with filtering, search, sorting and pagination' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: TaskQueryDto) {
    return this.tasks.findAll(user, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TASK)
  @ApiOperation({ summary: 'Create a task' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Task detail including its full journey' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.findOne(user, id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Immutable audit trail for a task' })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '100',
  ) {
    return this.tasks.getHistory(user, id, Number(page) || 1, Number(pageSize) || 100);
  }

  @Get(':id/journey')
  @ApiOperation({ summary: 'Visual workflow timeline for a task' })
  journey(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.getJourney(user, id);
  }

  @Get(':id/timing')
  @ApiOperation({ summary: 'How long the task spent with each person' })
  timing(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.getTiming(user, id);
  }

  @Get(':id/handover-candidates')
  @ApiOperation({ summary: 'Employees this task can be handed over to' })
  handoverCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('search') search?: string,
  ) {
    return this.tasks.handoverCandidates(user, id, search);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit task fields' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user, id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions(PERMISSIONS.ASSIGN_TASK)
  @ApiOperation({ summary: 'Assign or reassign the task' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.tasks.assign(user, id, dto);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start working on the task' })
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.start(user, id);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.SUBMIT_TASK)
  @ApiOperation({ summary: 'Submit the work for review' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitTaskDto,
  ) {
    return this.tasks.submit(user, id, dto);
  }

  @Post(':id/handover')
  @RequirePermissions(PERMISSIONS.HANDOVER_TASK)
  @ApiOperation({ summary: 'Hand the task over to another employee' })
  handover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: HandoverTaskDto,
  ) {
    return this.tasks.handover(user, id, dto);
  }

  @Post(':id/review')
  @RequirePermissions(PERMISSIONS.REVIEW_TASK)
  @ApiOperation({ summary: 'Take the submitted task under review' })
  startReview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.startReview(user, id);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Approve, request changes or reject' })
  decision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewTaskDto,
  ) {
    return this.tasks.review(user, id, dto);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.APPROVE_TASK)
  @ApiOperation({ summary: 'Approve the task' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { comment?: string },
  ) {
    return this.tasks.review(user, id, { decision: 'APPROVE', comment: body?.comment });
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.REJECT_TASK)
  @ApiOperation({ summary: 'Reject the task with a reason' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { comment: string; returnToUserId?: string },
  ) {
    return this.tasks.review(user, id, {
      decision: 'REJECT',
      comment: body?.comment,
      returnToUserId: body?.returnToUserId,
    });
  }

  @Post(':id/request-changes')
  @RequirePermissions(PERMISSIONS.REVIEW_TASK)
  @ApiOperation({ summary: 'Send the task back for changes' })
  requestChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { comment: string; returnToUserId?: string },
  ) {
    return this.tasks.review(user, id, {
      decision: 'REQUEST_CHANGES',
      comment: body?.comment,
      returnToUserId: body?.returnToUserId,
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change the task status through a guarded transition' })
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.tasks.changeStatus(user, id, dto);
  }

  @Patch(':id/waiting')
  @ApiOperation({ summary: 'Set what the task is waiting for' })
  setWaiting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetWaitingDto,
  ) {
    return this.tasks.setWaiting(user, id, dto);
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Change the priority' })
  changePriority(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangePriorityDto,
  ) {
    return this.tasks.changePriority(user, id, dto);
  }

  @Patch(':id/deadline')
  @ApiOperation({ summary: 'Change the deadline' })
  changeDeadline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeDeadlineDto,
  ) {
    return this.tasks.changeDeadline(user, id, dto);
  }

  @Post(':id/watchers')
  @ApiOperation({ summary: 'Follow a task' })
  addWatcher(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { userId?: string },
  ) {
    return this.tasks.addWatcher(user, id, body?.userId ?? user.id);
  }

  @Delete(':id/watchers/:userId')
  @ApiOperation({ summary: 'Stop following a task' })
  removeWatcher(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.tasks.removeWatcher(user, id, userId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DELETE_TASK)
  @ApiOperation({ summary: 'Archive a task' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    return this.tasks.remove(user, id, reason);
  }
}
