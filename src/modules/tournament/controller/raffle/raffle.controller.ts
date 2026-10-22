import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RaffleService } from '../../service/raffle.service';
import { CreateRaffleDto } from '../../dto/tournament/create-raffle.dto';
import { sendResponse } from '../../../utils/response.util';
import { QueryOptions } from '../../../utils/query.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { Role, RaffleStatus } from '@prisma/client';

@ApiTags('tournament/raffle')
@ApiBearerAuth()
@Controller('tournament/raffle')
export class RaffleController {
  constructor(private readonly raffleService: RaffleService) {}

  /**
   * Route 1: Get all raffles across tournaments (with pagination, searching, and filtering)
   * Accessible by EVERYONE: Admin, Super Admin, Player, Fan, and Guests.
   */
  @Get()
  @Public()
  @ApiOperation({
    summary:
      'Get all raffles across tournaments (with pagination, searching, and status filter)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'searchTerm',
    required: false,
    type: String,
    description: 'Search by raffle name or prize description',
  })
  @ApiQuery({
    name: 'tournamentId',
    required: false,
    type: String,
    description: 'Filter by tournament ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: RaffleStatus,
    description: 'Filter by status: OPEN, CLOSED, DRAWN, CANCELLED',
  })
  async getAllRaffles(
    @Query() query: QueryOptions,
    @Query('tournamentId') tournamentId?: string,
    @Query('status') status?: RaffleStatus,
  ) {
    const { data, meta } = await this.raffleService.getAllRaffles(
      query,
      tournamentId,
      status,
    );
    return sendResponse({
      message: 'Raffles retrieved successfully',
      data,
      meta,
    });
  }

  /**
   * Route 2: Join a raffle as a Player or as a Fan
   * User ID is automatically retrieved from the JWT Token!
   */
  @Post(':raffleId/join')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Join a raffle by Raffle ID in URL (Your User ID is automatically taken from your JWT token)',
  })
  @ApiParam({
    name: 'raffleId',
    description:
      'The ID of the Raffle Giveaway to join (NOT user ID - User ID comes from your JWT token)',
    type: String,
    example: '65fc2a1b-1234-5678-9abc-def012345678',
  })
  async joinRaffle(
    @Param('raffleId') raffleId: string,
    @Req() req: Request & { user: { userId: string; role?: string } },
  ) {
    const data = await this.raffleService.joinRaffle(raffleId, req.user);
    return sendResponse({
      message: 'Successfully joined the raffle',
      data,
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a single raffle by ID' })
  async getRaffleById(@Param('id') id: string) {
    const data = await this.raffleService.getRaffleById(id);
    return sendResponse({
      message: 'Raffle retrieved successfully',
      data,
    });
  }

  @Get('tournament/:tournamentId')
  @Public()
  @ApiOperation({ summary: 'Get all raffles for a specific tournament' })
  async getRafflesByTournament(@Param('tournamentId') tournamentId: string) {
    const data = await this.raffleService.getRafflesByTournament(tournamentId);
    return sendResponse({
      message: 'Tournament raffles retrieved successfully',
      data,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  @ApiOperation({ summary: 'Create a new raffle (tournamentId in body)' })
  async createRaffle(@Body() body: CreateRaffleDto) {
    const data = await this.raffleService.createRaffle(body);
    return sendResponse({
      message: 'Raffle created successfully',
      data,
    });
  }

  @Post('tournament/:tournamentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  @ApiOperation({ summary: 'Create a raffle for a specific tournament' })
  async createRaffleForTournament(
    @Param('tournamentId') tournamentId: string,
    @Body() body: CreateRaffleDto,
  ) {
    const data = await this.raffleService.createRaffle(body, tournamentId);
    return sendResponse({
      message: 'Raffle created successfully',
      data,
    });
  }

  @Post(':id/draw')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  @ApiOperation({ summary: 'Draw winners for a raffle' })
  async drawRaffle(
    @Param('id') id: string,
    @Query('tournamentId') tournamentId?: string,
  ) {
    const data = await this.raffleService.drawRaffle(id, tournamentId);
    return sendResponse({
      message: 'Raffle drawn successfully',
      data,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  @ApiOperation({ summary: 'Delete a raffle' })
  async deleteRaffle(@Param('id') id: string) {
    const data = await this.raffleService.deleteRaffle(id);
    return sendResponse({
      message: 'Raffle deleted successfully',
      data,
    });
  }
}
