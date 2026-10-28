import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FollowerService } from '../service/follower.service';
import { FollowDto, UnfollowDto } from '../dto/follow.dto';
import { sendResponse } from '../../utils/response.util';
import { QueryOptions } from '../../utils/query.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('fan')
@ApiBearerAuth()
@Controller('fan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN, 'fan', Role.FAN, Role.PLAYER, 'player')
export class FanFollowController {
  constructor(private readonly followerService: FollowerService) {}

  @Get('search-gamertags')
  @ApiOperation({ summary: 'Search Players and Fans by gamerTag' })
  @ApiQuery({
    name: 'query',
    required: false,
    type: String,
    description: 'GamerTag search term',
  })
  @ApiQuery({
    name: 'searchTerm',
    required: false,
    type: String,
    description: 'Alternative search term',
  })
  async searchGamertags(
    @Query('query') query?: string,
    @Query('searchTerm') searchTerm?: string,
    @Req() req?: any,
  ) {
    const term = query || searchTerm || '';
    const currentUserId = req?.user?.userId;
    const data = await this.followerService.searchGamertags(
      term,
      currentUserId,
    );
    return sendResponse({
      message: 'Gamertags retrieved successfully',
      data,
    });
  }

  @Post('follow')
  @ApiOperation({ summary: 'Follow a player or fan by target ID' })
  async follow(
    @Body() dto: FollowDto,
    @Req() req: Request & { user?: { userId: string; role: string } },
  ) {
    const data = await this.followerService.follow(dto, req.user);
    return sendResponse({
      message: 'Follow status updated successfully',
      data,
    });
  }

  @Post('unfollow')
  @ApiOperation({ summary: 'Unfollow a player or fan by target ID' })
  async unfollow(
    @Body() dto: UnfollowDto,
    @Req() req: Request & { user?: { userId: string; role: string } },
  ) {
    const data = await this.followerService.unfollow(dto, req.user);
    return sendResponse({
      message: 'Unfollowed successfully',
      data,
    });
  }

  @Get('users')
  @ApiOperation({
    summary:
      'Get all users (Players and Fans) with searching, filtering, and pagination',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'searchTerm',
    required: false,
    type: String,
    description: 'Search by name, gamerTag, or username',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['PLAYER', 'FAN'],
    description: 'Filter by user type (PLAYER or FAN)',
  })
  async getAllUsers(@Query() query: QueryOptions) {
    const { data, meta } = await this.followerService.getAllUsers(query);
    return sendResponse({
      message: 'Users retrieved successfully',
      data,
      meta,
    });
  }

  @Get('following')
  @ApiOperation({
    summary: 'Get all followed accounts for the authenticated user',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getMyFollowing(
    @Req() req: Request & { user: { userId: string } },
    @Query() query: QueryOptions,
  ) {
    const { data, meta } = await this.followerService.getFollowing(
      req.user.userId,
      query,
    );
    return sendResponse({
      message: 'Following list retrieved successfully',
      data,
      meta,
    });
  }

  @Get('followed-matches')
  @ApiOperation({
    summary:
      'Get upcoming scheduled matches of followed pro players (Upcoming Followed Matches feed)',
  })
  async getFollowedMatches(@Req() req: Request & { user: { userId: string } }) {
    const data = await this.followerService.getFollowedUpcomingMatches(
      req.user.userId,
    );
    return sendResponse({
      message: 'Upcoming followed matches retrieved successfully',
      data,
    });
  }

  @Get(':id/following')
  @ApiOperation({ summary: 'Get followed accounts for a specific user ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getUserFollowing(
    @Param('id') id: string,
    @Query() query: QueryOptions,
  ) {
    const { data, meta } = await this.followerService.getFollowing(id, query);
    return sendResponse({
      message: 'Following list retrieved successfully',
      data,
      meta,
    });
  }

  @Get(':id/followers')
  @ApiOperation({ summary: 'Get followers for a specific user ID or gamerTag' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getUserFollowers(
    @Param('id') id: string,
    @Query() query: QueryOptions,
  ) {
    const { data, meta } = await this.followerService.getFollowers(id, query);
    return sendResponse({
      message: 'Followers retrieved successfully',
      data,
      meta,
    });
  }
}
