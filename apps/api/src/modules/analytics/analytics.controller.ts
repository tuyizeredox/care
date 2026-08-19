import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyticsFilters, AnalyticsService } from './analytics.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@RequirePermissions(PERMISSIONS.VIEW_ANALYTICS)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Full bottleneck analysis in one call' })
  overview(@Query() filters: AnalyticsFilters) {
    return this.analytics.overview(filters);
  }

  @Get('bottlenecks/people')
  @ApiOperation({ summary: 'Average hold time per person' })
  byPerson(@Query() filters: AnalyticsFilters) {
    return this.analytics.bottlenecksByPerson(filters);
  }

  @Get('bottlenecks/departments')
  @ApiOperation({ summary: 'Average hold time per department' })
  byDepartment(@Query() filters: AnalyticsFilters) {
    return this.analytics.bottlenecksByDepartment(filters);
  }

  @Get('bottlenecks/stages')
  @ApiOperation({ summary: 'Average hold time per workflow stage, with SLA breaches' })
  byStage(@Query() filters: AnalyticsFilters) {
    return this.analytics.bottlenecksByStage(filters);
  }

  @Get('aging')
  @ApiOperation({ summary: 'How long open work has been outstanding' })
  aging(@Query() filters: AnalyticsFilters) {
    return this.analytics.taskAging(filters);
  }

  @Get('workflows')
  @ApiOperation({ summary: 'Cycle time and handover counts per workflow' })
  workflows(@Query() filters: AnalyticsFilters) {
    return this.analytics.workflowPerformance(filters);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Stage-by-stage time breakdown for one task' })
  task(@Param('taskId') taskId: string) {
    return this.analytics.taskBreakdown(taskId);
  }
}
