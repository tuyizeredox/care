import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService, UpsertSettingDto } from './settings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List system settings' })
  findAll(@Query('category') category?: string) {
    return this.settings.findAll(category);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Read one setting' })
  get(@Param('key') key: string) {
    return this.settings.get(key).then((value) => ({ key, value }));
  }

  @Put(':key')
  @RequirePermissions(PERMISSIONS.MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Create or update a setting' })
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
  ) {
    return this.settings.upsert(user, key, dto);
  }
}
