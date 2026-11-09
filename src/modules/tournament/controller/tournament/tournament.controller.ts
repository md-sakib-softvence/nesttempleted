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
import { OpenRegistrationDto } from '../../dto/tournament/open-registration.dto';
import { UpdateRegistrationStatusDto } from '../../dto/tournament/update-registration-status.dto';
import { PredictMatchDto } from '../../dto/tournament/predict-match.dto';
import { sendResponse } from '../../../utils/response.util';
import { QueryOptions } from '../../../utils/query.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { UpdateTournamentStatusDto } from '../../dto/tournament/update-tournament-status.dto';
import { UpdateMatchScoreDto } from '../../dto/tournament/update-match-score.dto';
import { MatchCheckInDto } from '../../dto/tournament/match-check-in.dto';
import { RegistrationSelectionDto } from '../../dto/tournament/registration-selection.dto';
import { QueryTournamentRegistrationDto } from '../../dto/tournament/query-registration.dto';
import { UpdateTournamentFinancialsDto } from '../../dto/tournament/update-financials.dto';
import { AllocateMatchDto } from '../../dto/tournament/allocate-match.dto';
import { CreateVenueDto } from '../../dto/venue/create-venue.dto';
import { SimulateSelfScheduleDto } from '../../dto/tournament/simulate-self-schedule.dto';
import { ProposeSlotDto } from '../../dto/tournament/propose-slot.dto';
import { EmergencyAppealDto } from '../../dto/tournament/emergency-appeal.dto';
import { QueryActiveUpcomingTournamentDto } from '../../dto/tournament/query-active-upcoming-tournament.dto';
import { Role, SchedulingMode, TournamentStatus } from '@prisma/client';
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
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'tournamentBanner', maxCount: 1 },
      { name: 'primaryOrganization', maxCount: 1 },
      { name: 'secondaryOrganization', maxCount: 1 },
      { name: 'fanPassLogo', maxCount: 1 },
      { name: 'fanPassBg', maxCount: 1 },
      { name: 'canvasImage', maxCount: 1 },
      { name: 'bannerUrl', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
      { name: 'fanPassArtUrl', maxCount: 1 },
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'organizerLogo', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'secondaryOrganizerLogo', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
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
      tournamentLogo?: Express.Multer.File[];
      tournamentBanner?: Express.Multer.File[];
      primaryOrganization?: Express.Multer.File[];
      secondaryOrganization?: Express.Multer.File[];
      fanPassLogo?: Express.Multer.File[];
      fanPassBg?: Express.Multer.File[];
      canvasImage?: Express.Multer.File[];
      bannerUrl?: Express.Multer.File[];
      banner?: Express.Multer.File[];
      fanPassArtUrl?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      organizerLogo?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      secondaryOrganizerLogo?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      logo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      termsAndConditions?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    const bannerVal =
      uploadedFiles.tournamentBanner ||
      createDto.tournamentBanner ||
      uploadedFiles.canvasImage ||
      createDto.canvasImage ||
      createDto.bannerUrl ||
      (createDto as any).banner;
    if (bannerVal) {
      createDto.tournamentBanner = bannerVal;
      createDto.canvasImage = bannerVal;
    }

    const logoVal =
      uploadedFiles.tournamentLogo ||
      createDto.tournamentLogo ||
      uploadedFiles.tournamentLogoUrl ||
      createDto.tournamentLogoUrl ||
      createDto.logo;
    if (logoVal) {
      createDto.tournamentLogo = logoVal;
      createDto.tournamentLogoUrl = logoVal;
    }

    const primaryOrgVal =
      uploadedFiles.primaryOrganization ||
      createDto.primaryOrganization ||
      uploadedFiles.playerOrgUrl ||
      createDto.playerOrgUrl ||
      (createDto as any).organizerLogo;
    if (primaryOrgVal) {
      createDto.primaryOrganization = primaryOrgVal;
      createDto.playerOrgUrl = primaryOrgVal;
    }

    const secondaryOrgVal =
      uploadedFiles.secondaryOrganization ||
      createDto.secondaryOrganization ||
      uploadedFiles.prOrgUrl ||
      createDto.prOrgUrl ||
      (createDto as any).secondaryOrganizerLogo;
    if (secondaryOrgVal) {
      createDto.secondaryOrganization = secondaryOrgVal;
      createDto.prOrgUrl = secondaryOrgVal;
    }

    const fanLogoVal =
      uploadedFiles.fanPassLogo ||
      createDto.fanPassLogo;
    if (fanLogoVal) {
      createDto.fanPassLogo = fanLogoVal;
    }

    const fanBgVal =
      uploadedFiles.fanPassBg ||
      createDto.fanPassBg ||
      uploadedFiles.fanPassArtUrl ||
      createDto.fanPassArtUrl;
    if (fanBgVal) {
      createDto.fanPassBg = fanBgVal;
      createDto.fanPassArtUrl = fanBgVal;
    }
    delete (createDto as any).banner;

    if (uploadedFiles.rules.length > 0) {
      createDto.rules = uploadedFiles.rules;
    } else if (createDto.rulesUrl && typeof createDto.rulesUrl === 'string') {
      createDto.rules = [createDto.rulesUrl];
    } else {
      createDto.rules = normalizeStringArray(createDto.rules);
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      createDto.termsAndConditions = uploadedFiles.tsAndTc;
      createDto.tsAndTc = uploadedFiles.tsAndTc;
    } else if (
      createDto.termsAndConditionsUrl &&
      typeof createDto.termsAndConditionsUrl === 'string'
    ) {
      createDto.termsAndConditions = [createDto.termsAndConditionsUrl];
      createDto.tsAndTc = [createDto.termsAndConditionsUrl];
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

  @Get('active-upcoming')
  @Public()
  @ApiOperation({
    summary:
      'Get active and upcoming tournaments for dashboard table with pagination and search',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TournamentStatus,
    description:
      'Optional status filter (e.g. REGISTRATION_OPEN, UPCOMING, ONGOING, IN_PROGRESS). Pass ALL to return all statuses.',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getActiveUpcomingTournaments(
    @Query() query: QueryActiveUpcomingTournamentDto,
  ) {
    const { data, meta } =
      await this.tournamentService.getActiveUpcomingTournaments(query);
    return sendResponse({
      message: 'Active and upcoming tournaments retrieved successfully',
      data,
      meta,
    });
  }

  @Get('prediction-fixtures')
  @Public()
  @ApiOperation({ summary: 'Get real, unresolved prediction fixtures from live tournaments' })
  async getAllPredictionFixtures() {
    const data = await this.tournamentService.getAllLivePredictionFixtures();
    return sendResponse({ message: 'Live prediction fixtures retrieved successfully', data });
  }

  @Get('my-predictions')
  @Roles(Role.FAN, 'fan')
  @ApiOperation({ summary: 'Get the authenticated fan prediction history and current coin balance' })
  async getMyPredictions(@Req() req: any) {
    const data = await this.tournamentService.getFanPredictionHistory(req?.user?.userId);
    return sendResponse({ message: 'Prediction history retrieved successfully', data });
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
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'tournamentBanner', maxCount: 1 },
      { name: 'primaryOrganization', maxCount: 1 },
      { name: 'secondaryOrganization', maxCount: 1 },
      { name: 'fanPassLogo', maxCount: 1 },
      { name: 'fanPassBg', maxCount: 1 },
      { name: 'canvasImage', maxCount: 1 },
      { name: 'bannerUrl', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
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
      tournamentLogo?: Express.Multer.File[];
      tournamentBanner?: Express.Multer.File[];
      primaryOrganization?: Express.Multer.File[];
      secondaryOrganization?: Express.Multer.File[];
      fanPassLogo?: Express.Multer.File[];
      fanPassBg?: Express.Multer.File[];
      canvasImage?: Express.Multer.File[];
      bannerUrl?: Express.Multer.File[];
      banner?: Express.Multer.File[];
      fanPassArtUrl?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      organizerLogo?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      secondaryOrganizerLogo?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      logo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      termsAndConditions?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    const bannerVal =
      uploadedFiles.tournamentBanner ||
      updateDto.tournamentBanner ||
      uploadedFiles.canvasImage ||
      updateDto.canvasImage ||
      updateDto.bannerUrl ||
      (updateDto as any).banner;
    if (bannerVal) {
      updateDto.tournamentBanner = bannerVal;
      updateDto.canvasImage = bannerVal;
    }

    const logoVal =
      uploadedFiles.tournamentLogo ||
      updateDto.tournamentLogo ||
      uploadedFiles.tournamentLogoUrl ||
      updateDto.tournamentLogoUrl ||
      updateDto.logo;
    if (logoVal) {
      updateDto.tournamentLogo = logoVal;
      updateDto.tournamentLogoUrl = logoVal;
    }

    const primaryOrgVal =
      uploadedFiles.primaryOrganization ||
      updateDto.primaryOrganization ||
      uploadedFiles.playerOrgUrl ||
      updateDto.playerOrgUrl ||
      (updateDto as any).organizerLogo;
    if (primaryOrgVal) {
      updateDto.primaryOrganization = primaryOrgVal;
      updateDto.playerOrgUrl = primaryOrgVal;
    }

    const secondaryOrgVal =
      uploadedFiles.secondaryOrganization ||
      updateDto.secondaryOrganization ||
      uploadedFiles.prOrgUrl ||
      updateDto.prOrgUrl ||
      (updateDto as any).secondaryOrganizerLogo;
    if (secondaryOrgVal) {
      updateDto.secondaryOrganization = secondaryOrgVal;
      updateDto.prOrgUrl = secondaryOrgVal;
    }

    const fanLogoVal =
      uploadedFiles.fanPassLogo ||
      updateDto.fanPassLogo;
    if (fanLogoVal) {
      updateDto.fanPassLogo = fanLogoVal;
    }

    const fanBgVal =
      uploadedFiles.fanPassBg ||
      updateDto.fanPassBg ||
      uploadedFiles.fanPassArtUrl ||
      updateDto.fanPassArtUrl;
    if (fanBgVal) {
      updateDto.fanPassBg = fanBgVal;
      updateDto.fanPassArtUrl = fanBgVal;
    }
    delete (updateDto as any).banner;

    if (uploadedFiles.rules.length > 0) {
      updateDto.rules = uploadedFiles.rules;
    } else if (updateDto.rulesUrl && typeof updateDto.rulesUrl === 'string') {
      updateDto.rules = [updateDto.rulesUrl];
    } else if (updateDto.rules !== undefined) {
      updateDto.rules = normalizeStringArray(updateDto.rules);
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      updateDto.termsAndConditions = uploadedFiles.tsAndTc;
      updateDto.tsAndTc = uploadedFiles.tsAndTc;
    } else if (
      updateDto.termsAndConditionsUrl &&
      typeof updateDto.termsAndConditionsUrl === 'string'
    ) {
      updateDto.termsAndConditions = [updateDto.termsAndConditionsUrl];
      updateDto.tsAndTc = [updateDto.termsAndConditionsUrl];
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

  @Post(':id/matches/:matchId/check-in/verify')
  @Roles(Role.EMPLOYEE, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, 'employee', 'manager', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Verify a participant QR pass for an assigned tournament match without checking them in' })
  async verifyMatchCheckIn(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: MatchCheckInDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.verifyTournamentMatchCheckIn(
      id,
      matchId,
      body.qrToken,
      body.expectedPlayerId,
      req.user,
    );
    return sendResponse({ message: 'Player QR verified for this match', data });
  }

  @Post(':id/matches/:matchId/check-in')
  @Roles(Role.EMPLOYEE, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, 'employee', 'manager', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Confirm participant check-in; automatically starts the match after both players check in' })
  async checkInMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: MatchCheckInDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.checkInTournamentMatch(
      id,
      matchId,
      body.qrToken,
      body.expectedPlayerId,
      req.user,
    );
    return sendResponse({
      message: data.matchStarted ? 'Both players checked in; match started' : 'Player checked in; waiting for the other participant',
      data,
    });
  }

  @Post(':id/matches/:matchId/score')
  @Roles(Role.EMPLOYEE, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, 'employee', 'manager', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Submit the final score for a started match assigned to the current employee' })
  async submitMatchScore(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: UpdateMatchScoreDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.submitAssignedMatchScore(
      id,
      matchId,
      body,
      req.user,
    );
    return sendResponse({ message: 'Final score submitted and tournament result updated', data });
  }

  @Get(':id/staff-assignments')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, 'manager', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Get persisted employee assignments for a tournament' })
  async getStaffAssignments(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentStaffAssignments(id);
    return sendResponse({ message: 'Tournament staff assignments retrieved', data });
  }

  @Put(':id/matches/:matchId/staff-assignment')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, 'manager', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Assign an active employee to a tournament match' })
  async assignMatchStaff(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: { employeeId: string },
  ) {
    const data = await this.tournamentService.assignTournamentMatchStaff(
      id,
      matchId,
      body?.employeeId,
    );
    return sendResponse({ message: 'Employee assigned to match', data });
  }

  @Delete(':id/matches/:matchId/staff-assignment')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, 'manager', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Remove employee assignment from a tournament match' })
  async unassignMatchStaff(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
  ) {
    const data = await this.tournamentService.unassignTournamentMatchStaff(id, matchId);
    return sendResponse({ message: 'Employee unassigned from match', data });
  }

  @Post(':id/staff-assignments/auto-assign')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, 'manager', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Round-robin assign active employees to unassigned matches' })
  async autoAssignStaff(@Param('id') id: string) {
    const data = await this.tournamentService.autoAssignTournamentStaff(id);
    return sendResponse({ message: 'Active employees assigned to open matches', data });
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
      'Returns eligible unallocated matches for the participant, including the 24-hour player choice window and automatic-assignment status.',
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
    summary: 'Manually trigger automatic assignment after the player window',
    description:
      'Scans for player-scheduling matches whose 24-hour player window has expired and assigns the earliest valid slot or marks CAPACITY_BLOCKED.',
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
  @Roles(Role.FAN, 'fan')
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

  @Post(':id/open-registration')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  @ApiOperation({
    summary:
      'Open tournament registration with cutoff mode, capacity, and deadline',
  })
  async openRegistration(
    @Param('id') id: string,
    @Body() dto: OpenRegistrationDto,
  ) {
    const data = await this.tournamentService.openRegistration(id, dto);
    return sendResponse({
      message: 'Tournament registration opened successfully',
      data,
    });
  }

  @Post(':id/close-registration')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  @ApiOperation({ summary: 'Close tournament registration' })
  async closeRegistration(@Param('id') id: string) {
    const data = await this.tournamentService.closeRegistration(id);
    return sendResponse({
      message: 'Tournament registration closed successfully',
      data,
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
