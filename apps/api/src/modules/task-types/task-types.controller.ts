import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTaskTypeDto, TaskTypesService, UpdateTaskTypeDto } from './task-types.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Task types')
@ApiBearerAuth()
@Controller('task-types')
export class TaskTypesController {
  constructor(private readonly taskTypes: TaskTypesService) {}

  @Get()
  @ApiOperation({ summary: 'List task types' })
  findAll() {
    return this.taskTypes.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Task type detail' })
  findOne(@Param('id') id: string) {
    return this.taskTypes.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_WORKFLOWS)
  @ApiOperation({ summary: 'Create a task type' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskTypeDto) {
    return this.taskTypes.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_WORKFLOWS)
  @ApiOperation({ summary: 'Update a task type' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskTypeDto,
  ) {
    return this.taskTypes.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_WORKFLOWS)
  @ApiOperation({ summary: 'Archive a task type' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.taskTypes.remove(user, id);
  }
}
