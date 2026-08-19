import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { AddProjectMemberDto, CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ProjectQueryDto) {
    return this.projects.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Project detail with members and statistics' })
  findOne(@Param('id') id: string) {
    return this.projects.findOne(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Project progress metrics' })
  stats(@Param('id') id: string) {
    return this.projects.getProgress(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Create a project' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Update a project' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(user, id, dto);
  }

  @Post(':id/members')
  @RequirePermissions(PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Add or update a project member' })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.projects.addMember(user, id, dto);
  }

  @Delete(':id/members/:userId')
  @RequirePermissions(PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Remove a project member' })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.projects.removeMember(user, id, userId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Archive a project' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.remove(user, id);
  }
}
