import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportExportService } from './report-export.service';
import { ReportsService } from './reports.service';
import { ExportReportDto, ReportQueryDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ReportExportService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'List available reports' })
  list() {
    return this.reports.listAvailable();
  }

  @Get('generate')
  @RequirePermissions(PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Generate a report as JSON' })
  generate(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    return this.reports.generate(user, query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.EXPORT_REPORTS)
  @ApiOperation({ summary: 'Download a report as CSV, Excel or PDF' })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExportReportDto,
    @Res() response: Response,
  ): Promise<void> {
    const report = await this.reports.generate(user, query);
    const file = await this.exporter.export(report, query.format);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.buffer.length);
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="' + file.fileName + '"',
    );
    response.end(file.buffer);
  }
}
