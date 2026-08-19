import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto, UpdateWorkflowDto, WorkflowQueryDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @ApiOperation({ summary: 'List workflows' })
  findAll(@Query() query: WorkflowQueryDto) {
    return this.workflows.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Workflow with its full stage chain' })
  findOne(@Param('id') id: string) {
    return this.workflows.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_WORKFLOWS)
  @ApiOperation({ summary: 'Create a workflow' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(user, dto);
  }

  @Post(':id/duplicate')
  @RequirePermissions(PERMISSIONS.MANAGE_WORKFLOWS)
  @ApiOperation({ summary: 'Duplicate a workflow as an inactive draft' })
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workflows.duplicate(user, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_WORKFLOWS)
  @ApiOperation({ summary: 'Update a workflow and its stages' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflows.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_WORKFLOWS)
  @ApiOperation({ summary: 'Archive a workflow' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workflows.remove(user, id);
  }
}
