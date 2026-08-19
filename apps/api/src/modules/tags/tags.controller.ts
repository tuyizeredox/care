import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTagDto, TagsService, UpdateTagDto } from './tags.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('Tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List tags' })
  findAll(@Query('search') search?: string) {
    return this.tags.findAll(search);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TASK)
  @ApiOperation({ summary: 'Create a tag' })
  create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Rename or recolour a tag' })
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_SETTINGS)
  @ApiOperation({ summary: 'Archive a tag' })
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
