import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { TournamentService } from '../../service/tournament.service';
import { CreateTournamentDto } from '../../dto/tournament/create-tournament.dto';
import { UpdateTournamentDto } from '../../dto/tournament/update-tournament.dto';
import { GenerateCalendarDto } from '../../dto/tournament/generate-calendar.dto';
import { AutoAllocationDto } from '../../dto/tournament/auto-allocation.dto';
import { CreateTournamentRegistrationDto } from '../../dto/tournament/create-registration.dto';
import { UpdateRegistrationStatusDto } from '../../dto/tournament/update-registration-status.dto';
import { PredictMatchDto } from '../../dto/tournament/predict-match.dto';
import { sendResponse } from '../../../utils/response.util';
import { QueryOptions } from '../../../utils/query.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { UpdateTournamentStatusDto } from '../../dto/tournament/update-tournament-status.dto';
import { RegistrationSelectionDto } from '../../dto/tournament/registration-selection.dto';
import { QueryTournamentRegistrationDto } from '../../dto/tournament/query-registration.dto';
import { UpdateTournamentFinancialsDto } from '../../dto/tournament/update-financials.dto';
import { AllocateMatchDto } from '../../dto/tournament/allocate-match.dto';
import { CreateVenueDto } from '../../dto/venue/create-venue.dto';
import { SimulateSelfScheduleDto } from '../../dto/tournament/simulate-self-schedule.dto';
import { ProposeSlotDto } from '../../dto/tournament/propose-slot.dto';
import { EmergencyAppealDto } from '../../dto/tournament/emergency-appeal.dto';
import { Role, SchedulingMode } from '@prisma/client';
import {
  uploadTournamentFiles,
  rollbackTournamentFiles,
  normalizeStringArray,
} from '../../utils/file-upload.util';

@ApiTags('tournament')
@ApiBearerAuth()
@Controller('tournaments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new Tournament' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'canvasImage', maxCount: 1 },
      { name: 'fanPassArtUrl', maxCount: 1 },
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'organizerLogo', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'secondaryOrganizerLogo', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'logo', maxCount: 1 },
      { name: 'rules', maxCount: 10 },
      { name: 'termsAndConditions', maxCount: 10 },
      { name: 'tsAndTc', maxCount: 10 },
    ]),
  )
  async create(
    @Body() createDto: CreateTournamentDto,
    @UploadedFiles()
    files: {
      canvasImage?: Express.Multer.File[];
      fanPassArtUrl?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      organizerLogo?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      secondaryOrganizerLogo?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      logo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      termsAndConditions?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    if (uploadedFiles.canvasImage) {
      createDto.canvasImage = uploadedFiles.canvasImage;
      createDto.fanPassArtUrl = uploadedFiles.canvasImage;
    }

    if (uploadedFiles.playerOrgUrl) {
      createDto.playerOrgUrl = uploadedFiles.playerOrgUrl;
    }

    if (uploadedFiles.prOrgUrl) {
      createDto.prOrgUrl = uploadedFiles.prOrgUrl;
    }

    if (uploadedFiles.tournamentLogoUrl) {
      createDto.tournamentLogoUrl = uploadedFiles.tournamentLogoUrl;
    }
    delete (createDto as any).tournamentLogo;

    if (uploadedFiles.rules.length > 0) {
      createDto.rules = uploadedFiles.rules;
    } else {
      createDto.rules = normalizeStringArray(createDto.rules);
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      createDto.termsAndConditions = uploadedFiles.tsAndTc;
      createDto.tsAndTc = uploadedFiles.tsAndTc;
    } else {
      createDto.termsAndConditions = normalizeStringArray(
        createDto.termsAndConditions || createDto.tsAndTc,
      );
      createDto.tsAndTc = createDto.termsAndConditions;
    }

    try {
      const data = await this.tournamentService.createTournament(createDto);
      return sendResponse({
        message:
          'Tournament created successfully with canonical structure and schedule',
        data,
      });
    } catch (error) {
      await rollbackTournamentFiles(uploadedFiles);
      throw error;
    }
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all Tournaments with pagination and search' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(@Query() query: QueryOptions) {
    const { data, meta } =
      await this.tournamentService.getAllTournaments(query);
    return sendResponse({
      message: 'Tournaments retrieved successfully',
      data,
      meta,
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a Tournament by ID' })
  @ApiQuery({
    name: 'include',
    required: false,
    description:
      'Comma-separated list of heavy sub-resources to include (e.g. slots, seeds, matches, groups, or all)',
    type: String,
    example: 'slots,seeds',
  })
  async findOne(@Param('id') id: string, @Query('include') include?: string) {
    const data = await this.tournamentService.getTournamentById(id, include);
    return sendResponse({
      message: 'Tournament retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Tournament with optional files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'canvasImage', maxCount: 1 },
      { name: 'fanPassArtUrl', maxCount: 1 },
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'organizerLogo', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'secondaryOrganizerLogo', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'logo', maxCount: 1 },
      { name: 'rules', maxCount: 10 },
      { name: 'termsAndConditions', maxCount: 10 },
      { name: 'tsAndTc', maxCount: 10 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTournamentDto,
    @UploadedFiles()
    files: {
      canvasImage?: Express.Multer.File[];
      fanPassArtUrl?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      organizerLogo?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      secondaryOrganizerLogo?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      logo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      termsAndConditions?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    if (uploadedFiles.canvasImage) {
      updateDto.canvasImage = uploadedFiles.canvasImage;
      updateDto.fanPassArtUrl = uploadedFiles.canvasImage;
    }

    if (uploadedFiles.playerOrgUrl) {
      updateDto.playerOrgUrl = uploadedFiles.playerOrgUrl;
    }

    if (uploadedFiles.prOrgUrl) {
      updateDto.prOrgUrl = uploadedFiles.prOrgUrl;
    }

    if (uploadedFiles.tournamentLogoUrl) {
      updateDto.tournamentLogoUrl = uploadedFiles.tournamentLogoUrl;
    }
    delete (updateDto as any).tournamentLogo;

    if (uploadedFiles.rules.length > 0) {
      updateDto.rules = uploadedFiles.rules;
    } else if (updateDto.rules !== undefined) {
      updateDto.rules = normalizeStringArray(updateDto.rules);
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      updateDto.termsAndConditions = uploadedFiles.tsAndTc;
      updateDto.tsAndTc = uploadedFiles.tsAndTc;
    } else if (
      updateDto.termsAndConditions !== undefined ||
      updateDto.tsAndTc !== undefined
    ) {
      updateDto.termsAndConditions = normalizeStringArray(
        updateDto.termsAndConditions || updateDto.tsAndTc,
      );
      updateDto.tsAndTc = updateDto.termsAndConditions;
    }

    try {
      const data = await this.tournamentService.updateTournament(id, updateDto);
      return sendResponse({
        message: 'Tournament updated successfully',
        data,
      });
    } catch (error) {
      await rollbackTournamentFiles(uploadedFiles);
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a Tournament by ID' })
  async remove(@Param('id') id: string) {
    const data = await this.tournamentService.deleteTournament(id);
    return sendResponse({
      message: 'Tournament deleted successfully',
      data,
    });
  }

  @Post(':id/schedule')
  @ApiOperation({
    summary:
      'Generate or regenerate full match schedule for a Tournament (e.g. AUTO_HOME_VENUE)',
  })
  async generateSchedule(
    @Param('id') id: string,
    @Body() body?: { schedulingMode?: SchedulingMode; playerIds?: string[] },
  ) {
    const data = await this.tournamentService.generateScheduleForTournament(
      id,
      body?.schedulingMode,
      body?.playerIds,
    );
    return sendResponse({
      message: 'Tournament schedule generated successfully',
      data,
    });
  }

  @Post(':id/calendar')
  @ApiOperation({
    summary:
      'Calendar Generation (POST /tournaments/{id}/calendar): Generate grid of dates, screens, and empty timeslots based on venue screens and hours',
  })
  async generateCalendar(
    @Param('id') id: string,
    @Body() body?: GenerateCalendarDto,
  ) {
    const data = await this.tournamentService.generateCalendarForTournament(
      id,
      body,
    );
    return sendResponse({
      message: 'Tournament calendar generated successfully',
      data,
    });
  }

  @Public()
  @Get(':id/calendar')
  @ApiOperation({ summary: 'Get Tournament calendar grid' })
  async getCalendar(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentCalendar(id);
    return sendResponse({
      message: 'Tournament calendar retrieved successfully',
      data,
    });
  }

  @Get(':id/matches')
  @Public()
  @ApiOperation({
    summary:
      'Get all canonical matches of a Tournament (with optional pagination & filters)',
  })
  @ApiQuery({ name: 'round', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'isAllocated', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMatches(
    @Param('id') id: string,
    @Query('round') round?: string,
    @Query('status') status?: string,
    @Query('isAllocated') isAllocated?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.tournamentService.getTournamentMatches(id, {
      round,
      status,
      isAllocated,
      page,
      limit,
    });
    return sendResponse({
      message: 'Tournament matches retrieved successfully',
      data,
      meta: data.meta,
    });
  }

  @Post(':id/matches/:matchId/self-book')
  @Roles(
    Role.PLAYER,
    'player',
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin',
    'super_admin',
  )
  @ApiOperation({
    summary: 'Player self-booking match fixture for a tournament',
    description:
      'Allows a competitor to schedule their match fixture in PLAYER_SELF scheduling mode within an open window.',
  })
  async selfBookMatch(
    @Param('id') tournamentId: string,
    @Param('matchId') matchId: string,
    @Body() body: AllocateMatchDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.selfBookMatch(
      matchId,
      body,
      req.user,
      tournamentId,
    );
    return sendResponse({
      message: 'Match fixture scheduled successfully',
      data,
    });
  }

  @Get(':id/self-schedule/pending-matches')
  @Roles(
    Role.PLAYER,
    'player',
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin',
    'super_admin',
  )
  @ApiOperation({
    summary:
      'Get Pending Matches for Player Self-Scheduling (Reservation Scheduler)',
    description:
      'Returns all active, unallocated canonical matches where player is a participant, with derived 3-stage escalation window metadata.',
  })
  async getPendingSelfScheduleMatches(
    @Param('id') tournamentId: string,
    @Req() req: any,
  ) {
    const data =
      await this.tournamentService.getPlayerPendingSelfScheduleMatches(
        tournamentId,
        req.user.userId,
      );
    return sendResponse({
      message: 'Pending self-schedule matches retrieved successfully',
      data,
    });
  }

  @Get(':id/self-schedule/matches/:matchId/available-slots')
  @Roles(
    Role.PLAYER,
    'player',
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin',
    'super_admin',
  )
  @ApiOperation({
    summary: 'Get Available Arena Timeslots Grid for Match',
    description:
      'Returns date-grouped arena screens and timeslots with player collision prevention, peak slot flags, and opponent casted indicators.',
  })
  async getAvailableSlotsForMatch(
    @Param('id') tournamentId: string,
    @Param('matchId') matchId: string,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.getAvailableSlotsForMatch(
      tournamentId,
      matchId,
      req.user.userId,
      req.user.role,
    );
    return sendResponse({
      message: 'Available timeslots retrieved successfully',
      data,
    });
  }

  @Post(':id/self-schedule/simulate')
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin',
    'super_admin',
    Role.PLAYER,
    'player',
  )
  @ApiOperation({
    summary: 'Simulate Escalation Window (Developer Sandbox Bar)',
    description:
      'Read-only sandbox simulation answering: If current time were X, what phase would this match enter and what slot would be assigned?',
  })
  async simulateSelfSchedule(
    @Param('id') tournamentId: string,
    @Body() body: SimulateSelfScheduleDto,
  ) {
    const data = await this.tournamentService.simulateSelfScheduling(
      tournamentId,
      body,
    );
    return sendResponse({
      message: 'Self-scheduling window simulated successfully',
      data,
    });
  }

  @Post(':id/process-auto-assignment')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  @ApiOperation({
    summary: 'Manually trigger Phase 3 automatic assignment evaluation',
    description:
      'Scans for overdue self-scheduling matches (96h+ elapsed) and deterministically assigns the earliest valid physical slot or marks CAPACITY_BLOCKED.',
  })
  async processAutoAssignment(@Param('id') tournamentId: string) {
    const data =
      await this.tournamentService.processDueAutoAssignments(tournamentId);
    return sendResponse({
      message: 'Auto-assignment processing completed',
      data,
    });
  }

  @Get(':id/prediction-fixtures')
  @Public()
  @ApiOperation({
    summary: 'Get active prediction fixtures and odds for a live tournament',
  })
  async getPredictionFixtures(@Param('id') id: string) {
    const data = await this.tournamentService.getLivePredictionFixtures(id);
    return sendResponse({
      message: 'Live tournament prediction fixtures retrieved successfully',
      data,
    });
  }

  @Post(':id/predict')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FAN, 'fan', Role.PLAYER, 'player')
  @ApiOperation({
    summary: 'Lock in coin prediction for a live tournament match',
  })
  async lockPrediction(
    @Param('id') id: string,
    @Body() body: PredictMatchDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.lockPrediction(
      id,
      body,
      req?.user,
    );
    return sendResponse({
      message: 'Prediction locked in successfully',
      data,
    });
  }

  @Get(':id/capacity')
  @ApiOperation({
    summary:
      'Get Tournament capacity calculations (daily slots, capacity, playing days needed)',
  })
  async getCapacity(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentCapacity(id);
    return sendResponse({
      message: 'Tournament capacity calculation retrieved successfully',
      data,
    });
  }

  @Post(':id/auto-allocation')
  @ApiOperation({
    summary:
      'Automatically assign unallocated matches to open slots based on scheduling mode',
  })
  async autoAllocate(
    @Param('id') id: string,
    @Body() body?: AutoAllocationDto,
  ) {
    const data = await this.tournamentService.autoAllocateTournamentMatches(
      id,
      body,
    );
    return sendResponse({
      message: 'Matches auto-allocated successfully',
      data,
    });
  }

  @Get(':id/standings')
  @Public()
  @ApiOperation({
    summary:
      'Get tournament standings/leaderboard with filter (table, goals, metrics) and pagination',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['table', 'goals', 'metrics', 'all'],
    description: 'Filter standings view by table, goals, or metrics',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLeaderboard(
    @Param('id') id: string,
    @Query('filter') filter?: string,
    @Query('tab') tab?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const activeFilter = filter || tab;
    const data = await this.tournamentService.getTournamentLeaderboard(
      id,
      activeFilter,
      { page, limit },
    );
    return sendResponse({
      message: 'Tournament leaderboard retrieved successfully',
      data,
      meta: (data as any)?.meta,
    });
  }

  @Post(':id/registrations')
  @Roles(
    Role.PLAYER,
    'player',
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin',
    'super_admin',
  )
  @ApiOperation({ summary: 'Register a player for this tournament' })
  async registerPlayer(
    @Param('id') id: string,
    @Body() body: CreateTournamentRegistrationDto,
    @Req() req: any,
  ) {
    if (!body.playerId && req.user?.userId) {
      body.playerId = req.user.userId;
    }
    const data = await this.tournamentService.createRegistration(id, body);
    return sendResponse({
      message: 'Player registered successfully',
      data,
    });
  }

  @Get(':id/registrations')
  @Roles(
    Role.PLAYER,
    'player',
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin',
    'super_admin',
  )
  @ApiOperation({
    summary: 'Get all tournament registrations with counts and tab filtering',
  })
  async getRegistrations(
    @Param('id') id: string,
    @Query() query: QueryTournamentRegistrationDto,
  ) {
    const data =
      await this.tournamentService.getTournamentRegistrationsWithCounts(
        id,
        query,
      );
    return sendResponse({
      message: 'Tournament registrations retrieved successfully',
      data: {
        items: data.items,
        counts: data.counts,
        pagination: data.pagination,
      },
    });
  }

  @Patch(':id/registrations/:registrationId/status')
  @ApiOperation({
    summary:
      'Update player registration status (Confirmed, Selected, Waitlist)',
  })
  async updateRegistrationStatus(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() body: UpdateRegistrationStatusDto,
  ) {
    const data = await this.tournamentService.updateRegistrationStatus(
      id,
      registrationId,
      body,
    );
    return sendResponse({
      message: 'Registration status updated successfully',
      data,
    });
  }

  @Post(':id/status')
  @ApiOperation({
    summary: 'Transitions tournament lifecycle with state machine checks',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateTournamentStatusDto,
  ) {
    const data = await this.tournamentService.updateTournamentStatus(id, body);
    return sendResponse({
      message: `Tournament status updated to ${data.status} successfully`,
      data,
    });
  }

  @Post(':id/venues')
  @ApiOperation({ summary: 'Adds a new venue with screens to the tournament' })
  async addVenue(@Param('id') id: string, @Body() body: CreateVenueDto) {
    const data = await this.tournamentService.addTournamentVenue(id, body);
    return sendResponse({
      message: 'Venue added to tournament successfully',
      data,
    });
  }

  @Delete(':id/venues/:venueId')
  @ApiOperation({
    summary: 'Deletes a venue from tournament if no matches are allocated',
  })
  async deleteVenue(
    @Param('id') id: string,
    @Param('venueId') venueId: string,
  ) {
    const data = await this.tournamentService.deleteTournamentVenue(
      id,
      venueId,
    );
    return sendResponse({
      message: 'Venue deleted from tournament successfully',
      data,
    });
  }

  @Post(':id/registration-selection')
  @ApiOperation({
    summary:
      'Selects registered players and gives them a payment window (Selected (Unpaid))',
  })
  async selectRegistrations(
    @Param('id') id: string,
    @Body() body: RegistrationSelectionDto,
  ) {
    const data = await this.tournamentService.selectRegistrations(id, body);
    return sendResponse({
      message: 'Registrations selected and payment window granted successfully',
      data,
    });
  }

  @Post(':id/payment-expiry')
  @ApiOperation({
    summary:
      'Scans and processes expired Selected (Unpaid) registrations, freeing capacity',
  })
  async processPaymentExpiry(@Param('id') id: string) {
    const data = await this.tournamentService.processPaymentExpiry(id);
    return sendResponse({
      message: 'Expired unpaid registrations processed successfully',
      data,
    });
  }

  @Post(':id/reconcile-capacity')
  @ApiOperation({
    summary: 'Extends capacity windows when deficits are detected',
  })
  async reconcileCapacity(
    @Param('id') id: string,
    @Body() body?: { expectedVersion?: number },
  ) {
    const data = await this.tournamentService.reconcileScheduleCapacity(
      id,
      body?.expectedVersion,
    );
    return sendResponse({
      message: 'Tournament schedule capacity reconciled successfully',
      data,
    });
  }

  @Get(':id/financials')
  @ApiOperation({
    summary: 'Returns complete financial ledger and cost/prize breakdown',
  })
  async getFinancials(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentFinancials(id);
    return sendResponse({
      message: 'Tournament financials retrieved successfully',
      data,
    });
  }

  @Patch(':id/financials')
  @ApiOperation({
    summary: 'Updates cost items, prize payouts, and rake percentage',
  })
  async updateFinancials(
    @Param('id') id: string,
    @Body() body: UpdateTournamentFinancialsDto,
  ) {
    const data = await this.tournamentService.updateTournamentFinancials(
      id,
      body,
    );
    return sendResponse({
      message: 'Tournament financials updated successfully',
      data,
    });
  }
}
