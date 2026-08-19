import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global search across tasks, comments, projects and people' })
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q = '',
    @Query('limit') limit = '8',
  ) {
    return this.search.search(user, q, Math.min(Number(limit) || 8, 25));
  }
}
