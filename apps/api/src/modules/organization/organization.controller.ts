import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Headline organisation counters' })
  overview() {
    return this.organizationService.overview();
  }

  @Get('chart')
  @ApiOperation({ summary: 'Interactive organisation chart (people tree)' })
  chart(@Query('rootUserId') rootUserId?: string) {
    return this.organizationService.chart(rootUserId);
  }

  @Get('units')
  @ApiOperation({ summary: 'Structural unit tree' })
  units() {
    return this.organizationService.units();
  }

  @Post('units')
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  createUnit(@Body() dto: CreateUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createUnit(dto, user);
  }

  @Patch('units/:id')
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  updateUnit(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.updateUnit(id, dto, user);
  }

  @Delete('units/:id')
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  removeUnit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.removeUnit(id, user);
  }
}
