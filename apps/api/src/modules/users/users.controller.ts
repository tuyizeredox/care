import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  SetUserPermissionsDto,
  UpdateProfileDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users visible to the current user' })
  findAll(@Query() query: UserQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(query, user);
  }

  @Get('directory')
  @ApiOperation({ summary: 'Lightweight user list for pickers and @mentions' })
  directory(@Query('search') search?: string, @Query('departmentId') departmentId?: string) {
    return this.usersService.directory(search, departmentId);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Own profile with statistics' })
  myProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findOne(userId);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update own profile' })
  updateMyProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateOwnProfile(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User profile' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Recent activity for a user' })
  activity(@Param('id') id: string) {
    return this.usersService.recentActivity(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Performance statistics for a user' })
  stats(@Param('id') id: string) {
    return this.usersService.stats(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  @ApiOperation({ summary: 'Create a user account' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  @ApiOperation({ summary: 'Update a user account' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  @ApiOperation({ summary: 'Issue a temporary password' })
  resetPassword(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.resetPassword(id, user);
  }

  @Patch(':id/permissions')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  @ApiOperation({ summary: 'Set per-user permission overrides' })
  setPermissions(
    @Param('id') id: string,
    @Body() dto: SetUserPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setPermissionOverrides(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  @ApiOperation({ summary: 'Deactivate (soft delete) a user account' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.remove(id, user);
  }
}
