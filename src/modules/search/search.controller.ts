import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { sendResponse } from '../utils/response.util';
import { GlobalSearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.PLAYER,
  Role.FAN,
  Role.SECURITY_GUARD,
  Role.EMPLOYEE,
  Role.MANAGER,
  Role.AMBASSADOR,
  'admin',
  'super_admin',
  'player',
  'fan',
  'security_guard',
  'security',
  'employee',
  'manager',
  'ambassador',
)
export class GlobalSearchController {
  constructor(private readonly searchService: GlobalSearchService) {}

  @Get('global')
  @ApiOperation({
    summary: 'Search players, staff, and tournaments from live database data',
  })
  @ApiQuery({
    name: 'query',
    required: true,
    type: String,
    description: 'Name, gamer tag, email, role, game title, or tournament name',
  })
  async search(@Query('query') query?: string) {
    const data = await this.searchService.search(query || '');
    return sendResponse({
      message: 'Global search results retrieved successfully',
      data,
    });
  }
}
