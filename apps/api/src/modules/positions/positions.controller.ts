import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { CreatePositionDto, UpdatePositionDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Positions')
@ApiBearerAuth()
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @ApiOperation({ summary: 'List positions' })
  findAll(@Query('departmentId') departmentId?: string) {
    return this.positionsService.findAll(departmentId);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Structural organigram built from reporting lines' })
  tree() {
    return this.positionsService.tree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Position detail' })
  findOne(@Param('id') id: string) {
    return this.positionsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  create(@Body() dto: CreatePositionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.positionsService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.positionsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ORGANIZATION)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.positionsService.remove(id, user);
  }
}
