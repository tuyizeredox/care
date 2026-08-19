import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'My personal dashboard' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.myDashboard(user);
  }

  @Get('team')
  @RequirePermissions(PERMISSIONS.VIEW_TEAM_TASKS)
  @ApiOperation({ summary: 'Team dashboard for managers and supervisors' })
  team(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.teamDashboard(user);
  }

  @Get('organization')
  @RequirePermissions(PERMISSIONS.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Organisation-wide executive dashboard' })
  organization(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.organizationDashboard(user);
  }

  @Get('departments')
  @RequirePermissions(PERMISSIONS.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Per-department performance comparison' })
  departments() {
    return this.dashboard.departmentPerformance();
  }

  @Get('departments/:id')
  @RequirePermissions(PERMISSIONS.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Drill into one department' })
  department(@Param('id') id: string) {
    return this.dashboard.departmentDrilldown(id);
  }

  @Get('trend')
  @RequirePermissions(PERMISSIONS.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Created vs completed tasks per week' })
  async trend(@CurrentUser() user: AuthenticatedUser, @Query('weeks') weeks = '8') {
    return this.dashboard.completionTrend({}, Math.min(Number(weeks) || 8, 26));
  }
}
