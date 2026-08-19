import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List departments' })
  findAll(@Query('withStats') withStats?: string) {
    return this.departmentsService.findAll(withStats === 'true');
  }

  @Get('performance')
  @RequirePermissions(PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Delivery metrics per department' })
  performance() {
    return this.departmentsService.performance();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Department detail with members and projects' })
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  @ApiOperation({ summary: 'Create a department' })
  create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.departmentsService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  @ApiOperation({ summary: 'Update a department' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departmentsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  @ApiOperation({ summary: 'Delete an empty department' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.departmentsService.remove(id, user);
  }
}
