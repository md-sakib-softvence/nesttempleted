import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
import { AllocateMatchDto } from '../../dto/tournament/allocate-match.dto';
import { GenerateCalendarDto } from '../../dto/tournament/generate-calendar.dto';
import { AutoAllocationDto } from '../../dto/tournament/auto-allocation.dto';
import { UpdateMatchScoreDto } from '../../dto/tournament/update-match-score.dto';
import { MatchNoShowDto } from '../../dto/tournament/match-no-show.dto';
import { CreateTournamentRegistrationDto } from '../../dto/tournament/create-registration.dto';
import { UpdateRegistrationStatusDto } from '../../dto/tournament/update-registration-status.dto';
import { OpenRegistrationDto } from '../../dto/tournament/open-registration.dto';
import { CreateRaffleDto } from '../../dto/tournament/create-raffle.dto';
import { UpdateTournamentTemplatesDto } from '../../dto/tournament/update-templates.dto';
import { sendResponse } from '../../../utils/response.util';
import { QueryOptions } from '../../../utils/query.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { UpdateTournamentStatusDto } from '../../dto/tournament/update-tournament-status.dto';
import { RegistrationSelectionDto } from '../../dto/tournament/registration-selection.dto';
import { QueryTournamentRegistrationDto } from '../../dto/tournament/query-registration.dto';
import { UpdateTournamentFinancialsDto } from '../../dto/tournament/update-financials.dto';
import { CreateVenueDto } from '../../dto/venue/create-venue.dto';
import { Role, SchedulingMode } from '@prisma/client';
import {
  uploadTournamentFiles,
  rollbackTournamentFiles,
  normalizeStringArray,
} from '../../utils/file-upload.util';

@ApiTags('tournament')
@ApiBearerAuth()
@Controller(['admin/tournaments', 'tournaments', 'tournament'])
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
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'rules', maxCount: 10 },
      { name: 'tsAndTc', maxCount: 10 },
    ]),
  )
  async create(
    @Body() createDto: CreateTournamentDto,
    @UploadedFiles()
    files: {
      canvasImage?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    if (uploadedFiles.canvasImage) {
      createDto.canvasImage = uploadedFiles.canvasImage;
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
      createDto.tsAndTc = uploadedFiles.tsAndTc;
    } else {
      createDto.tsAndTc = normalizeStringArray(createDto.tsAndTc);
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
  @ApiOperation({ summary: 'Get a Tournament by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentById(id);
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
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'rules', maxCount: 10 },
      { name: 'tsAndTc', maxCount: 10 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTournamentDto,
    @UploadedFiles()
    files: {
      canvasImage?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    if (uploadedFiles.canvasImage) {
      updateDto.canvasImage = uploadedFiles.canvasImage;
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
      updateDto.tsAndTc = uploadedFiles.tsAndTc;
    } else if (updateDto.tsAndTc !== undefined) {
      updateDto.tsAndTc = normalizeStringArray(updateDto.tsAndTc);
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

  @Post([':id/calendar', ':id/generate-calendar'])
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

  @Get(':id/calendar')
  @ApiOperation({ summary: 'Get Tournament calendar grid' })
  async getCalendar(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentCalendar(id);
    return sendResponse({
      message: 'Tournament calendar retrieved successfully',
      data,
    });
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get Tournament schedule and joined matches' })
  async getSchedule(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentCalendar(id);
    return sendResponse({
      message: 'Tournament schedule retrieved successfully',
      data,
    });
  }

  @Get(':id/matches')
  @ApiOperation({ summary: 'Get all canonical matches of a Tournament' })
  async getMatches(
    @Param('id') id: string,
    @Query('round') round?: string,
    @Query('status') status?: string,
    @Query('isAllocated') isAllocated?: string,
  ) {
    const data = await this.tournamentService.getTournamentMatches(id, {
      round,
      status,
      isAllocated,
    });
    return sendResponse({
      message: 'Tournament matches retrieved successfully',
      data,
    });
  }

  @Get([':id/schedule/capacity', ':id/capacity'])
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

  @Post([':id/matches/:matchId/allocate', ':id/matches/:matchId/allocation'])
  @ApiOperation({
    summary:
      'Physical Allocations (POST /tournaments/{id}/matches/{id}/allocate): Link a canonical match ID to a physical slot (venueId, screenId, date, time). Never overwrites scores.',
  })
  async allocateMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: AllocateMatchDto,
  ) {
    const data = await this.tournamentService.allocateTournamentMatch(
      id,
      matchId,
      body,
    );
    return sendResponse({
      message: 'Match allocated to physical slot successfully',
      data,
    });
  }

  @Delete([':id/matches/:matchId/allocate', ':id/matches/:matchId/allocation'])
  @ApiOperation({
    summary:
      'Remove physical allocation of a match, freeing the calendar slot while preserving scores',
  })
  async unallocateMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
  ) {
    const data = await this.tournamentService.unallocateTournamentMatch(
      id,
      matchId,
    );
    return sendResponse({
      message: 'Match unallocated successfully',
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

  @Post(':id/matches/:matchId/score')
  @ApiOperation({ summary: 'Update/Enter score for a match (and advance brackets)' })
  async updateMatchScore(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: UpdateMatchScoreDto,
  ) {
    const data = await this.tournamentService.updateMatchScore(id, matchId, body);
    return sendResponse({
      message: 'Match score updated successfully',
      data,
    });
  }

  @Post(':id/matches/:matchId/no-show')
  @ApiOperation({ summary: 'Record No-Show for a player in a match (3-0 loss)' })
  async recordNoShow(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: MatchNoShowDto,
  ) {
    const data = await this.tournamentService.recordNoShow(id, matchId, body);
    return sendResponse({
      message: 'Match marked as No-Show successfully',
      data,
    });
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Get completed and scored match results' })
  async getResults(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentResults(id);
    return sendResponse({
      message: 'Tournament results retrieved successfully',
      data,
    });
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'Get tournament standings/leaderboard' })
  async getLeaderboard(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentLeaderboard(id);
    return sendResponse({
      message: 'Tournament leaderboard retrieved successfully',
      data,
    });
  }

  @Post(':id/registrations')
  @ApiOperation({ summary: 'Register a player for this tournament' })
  async registerPlayer(
    @Param('id') id: string,
    @Body() body: CreateTournamentRegistrationDto,
  ) {
    const data = await this.tournamentService.createRegistration(id, body);
    return sendResponse({
      message: 'Player registered successfully',
      data,
    });
  }

  @Get(':id/registrations')
  @ApiOperation({ summary: 'Get all tournament registrations with counts and tab filtering' })
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
  @ApiOperation({ summary: 'Update player registration status (Confirmed, Selected, Waitlist)' })
  async updateRegistrationStatus(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() body: UpdateRegistrationStatusDto,
  ) {
    const data = await this.tournamentService.updateRegistrationStatus(id, registrationId, body);
    return sendResponse({
      message: 'Registration status updated successfully',
      data,
    });
  }

  @Post(':id/registration/open')
  @ApiOperation({ summary: 'Open tournament registration with mode, capacity, and deadline' })
  async openRegistration(
    @Param('id') id: string,
    @Body() body: OpenRegistrationDto,
  ) {
    const data = await this.tournamentService.openRegistration(id, body);
    return sendResponse({
      message: 'Tournament registration opened successfully',
      data,
    });
  }

  @Post(':id/registration/close')
  @ApiOperation({ summary: 'Close tournament registration' })
  async closeRegistration(@Param('id') id: string) {
    const data = await this.tournamentService.closeRegistration(id);
    return sendResponse({
      message: 'Tournament registration closed successfully',
      data,
    });
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause tournament scheduling' })
  async pauseScheduling(@Param('id') id: string) {
    const data = await this.tournamentService.pauseScheduling(id);
    return sendResponse({
      message: 'Tournament scheduling paused successfully',
      data,
    });
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume tournament scheduling' })
  async resumeScheduling(@Param('id') id: string) {
    const data = await this.tournamentService.resumeScheduling(id);
    return sendResponse({
      message: 'Tournament scheduling resumed successfully',
      data,
    });
  }

  @Get(':id/raffles')
  @ApiOperation({ summary: 'Get all raffles for tournament' })
  async getRaffles(@Param('id') id: string) {
    const data = await this.tournamentService.getRaffles(id);
    return sendResponse({
      message: 'Tournament raffles retrieved successfully',
      data,
    });
  }

  @Post(':id/raffles')
  @ApiOperation({ summary: 'Create a raffle for tournament' })
  async createRaffle(
    @Param('id') id: string,
    @Body() body: CreateRaffleDto,
  ) {
    const data = await this.tournamentService.createRaffle(id, body);
    return sendResponse({
      message: 'Raffle created successfully',
      data,
    });
  }

  @Post(':id/raffles/:raffleId/draw')
  @ApiOperation({ summary: 'Draw winners for a raffle' })
  async drawRaffle(
    @Param('id') id: string,
    @Param('raffleId') raffleId: string,
  ) {
    const data = await this.tournamentService.drawRaffle(id, raffleId);
    return sendResponse({
      message: 'Raffle drawn successfully',
      data,
    });
  }

  @Patch(':id/templates')
  @ApiOperation({ summary: 'Update Player Card and Fan Pass templates' })
  async updateTemplates(
    @Param('id') id: string,
    @Body() body: UpdateTournamentTemplatesDto,
  ) {
    const data = await this.tournamentService.updateTemplates(id, body);
    return sendResponse({
      message: 'Templates updated successfully',
      data,
    });
  }

  @Get(':id/templates')
  @ApiOperation({ summary: 'Get Player Card and Fan Pass templates' })
  async getTemplates(@Param('id') id: string) {
    const data = await this.tournamentService.getTemplates(id);
    return sendResponse({
      message: 'Templates retrieved successfully',
      data,
    });
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Transitions tournament lifecycle with state machine checks' })
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
  @ApiOperation({ summary: 'Deletes a venue from tournament if no matches are allocated' })
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

  @Post([':id/schedule/reconcile-capacity', ':id/reconcile-capacity'])
  @ApiOperation({ summary: 'Extends capacity windows when deficits are detected' })
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

  @Get(':id/standings')
  @ApiOperation({ summary: 'Returns calculated table standings (League & Group formats)' })
  async getStandings(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentLeaderboard(id);
    return sendResponse({
      message: 'Tournament standings retrieved successfully',
      data,
    });
  }

  @Get(':id/financials')
  @ApiOperation({ summary: 'Returns complete financial ledger and cost/prize breakdown' })
  async getFinancials(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentFinancials(id);
    return sendResponse({
      message: 'Tournament financials retrieved successfully',
      data,
    });
  }

  @Patch(':id/financials')
  @Put(':id/financials')
  @ApiOperation({ summary: 'Updates cost items, prize payouts, and rake percentage' })
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
