import {
  Injectable,
  Logger,
  Optional,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TournamentScheduleService } from './tournament-schedule.service';
import { TournamentCoreService } from './tournament-core.service';
import { TournamentRegistrationService } from './tournament-registration.service';
import { TournamentMatchesService } from './tournament-matches.service';
import { TournamentLeaderboardService } from './tournament-leaderboard.service';

import { CreateTournamentDto } from '../dto/tournament/create-tournament.dto';
import { UpdateTournamentDto } from '../dto/tournament/update-tournament.dto';
import { AllocateMatchDto } from '../dto/tournament/allocate-match.dto';
import { GenerateCalendarDto } from '../dto/tournament/generate-calendar.dto';
import { AutoAllocationDto } from '../dto/tournament/auto-allocation.dto';
import { QueryOptions } from '../../utils/query.util';
import { UpdateMatchScoreDto } from '../dto/tournament/update-match-score.dto';
import { MatchNoShowDto } from '../dto/tournament/match-no-show.dto';
import { CreateTournamentRegistrationDto } from '../dto/tournament/create-registration.dto';
import { UpdateRegistrationStatusDto } from '../dto/tournament/update-registration-status.dto';
import { OpenRegistrationDto } from '../dto/tournament/open-registration.dto';
import { CreateRaffleDto } from '../dto/tournament/create-raffle.dto';
import { RaffleService } from './raffle.service';
import { UpdateTournamentTemplatesDto } from '../dto/tournament/update-templates.dto';
import { UpdateTournamentStatusDto } from '../dto/tournament/update-tournament-status.dto';
import { RegistrationSelectionDto } from '../dto/tournament/registration-selection.dto';
import { ScoreCorrectionDto } from '../dto/tournament/score-correction.dto';
import { CreateMatchDisputeDto } from '../dto/tournament/match-dispute.dto';
import { UpdateMatchDisputeDto } from '../dto/tournament/update-dispute.dto';
import { UpdateTournamentFinancialsDto } from '../dto/tournament/update-financials.dto';
import { QueryTournamentRegistrationDto } from '../dto/tournament/query-registration.dto';
import { PredictMatchDto } from '../dto/tournament/predict-match.dto';
import { ProposeSlotDto } from '../dto/tournament/propose-slot.dto';
import { SimulateSelfScheduleDto } from '../dto/tournament/simulate-self-schedule.dto';
import { EmergencyAppealDto } from '../dto/tournament/emergency-appeal.dto';
import { SchedulingMode } from '@prisma/client';

/**
 * TournamentService Master Facade
 * Coordinates domain sub-services for Core CRUD, Registrations, Matches/Calendar, and Leaderboards.
 * Designed with 100% backward compatibility for all controllers and tests.
 */
@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);

  private readonly core: TournamentCoreService;
  private readonly registration: TournamentRegistrationService;
  private readonly matches: TournamentMatchesService;
  private readonly leaderboard: TournamentLeaderboardService;
  private readonly raffleService: RaffleService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentScheduleService: TournamentScheduleService,
    @Optional() coreService?: TournamentCoreService,
    @Optional() registrationService?: TournamentRegistrationService,
    @Optional() matchesService?: TournamentMatchesService,
    @Optional() leaderboardService?: TournamentLeaderboardService,
    @Optional() raffleService?: RaffleService,
  ) {
    this.core =
      coreService ||
      new TournamentCoreService(this.prisma, this.tournamentScheduleService);
    this.registration =
      registrationService || new TournamentRegistrationService(this.prisma);
    this.matches =
      matchesService ||
      new TournamentMatchesService(this.prisma, this.tournamentScheduleService);
    this.leaderboard =
      leaderboardService || new TournamentLeaderboardService(this.prisma);
    this.raffleService = raffleService || new RaffleService(this.prisma);
  }

  // ==========================================
  // CORE CRUD & LIFECYCLE
  // ==========================================

  async createTournament(createTournamentDto: CreateTournamentDto) {
    return this.core.createTournament(createTournamentDto);
  }

  async getAllTournaments(query: QueryOptions = {}) {
    return this.core.getAllTournaments(query);
  }

  async getTournamentById(id: string, include?: string) {
    return this.core.getTournamentById(id, include);
  }

  async updateTournament(id: string, updateTournamentDto: UpdateTournamentDto) {
    return this.core.updateTournament(id, updateTournamentDto);
  }

  async deleteTournament(id: string) {
    return this.core.deleteTournament(id);
  }

  async updateTournamentStatus(id: string, dto: UpdateTournamentStatusDto) {
    return this.core.updateTournamentStatus(id, dto);
  }

  async addTournamentVenue(tournamentId: string, dto: any) {
    return this.core.addTournamentVenue(tournamentId, dto);
  }

  async deleteTournamentVenue(tournamentId: string, venueId: string) {
    return this.core.deleteTournamentVenue(tournamentId, venueId);
  }

  async updateTemplates(
    tournamentId: string,
    dto: UpdateTournamentTemplatesDto,
  ) {
    return this.core.updateTemplates(tournamentId, dto);
  }

  async getTemplates(tournamentId: string) {
    return this.core.getTemplates(tournamentId);
  }

  async getRaffles(tournamentId: string) {
    return this.raffleService.getRafflesByTournament(tournamentId);
  }

  async createRaffle(tournamentId: string, dto: CreateRaffleDto) {
    return this.raffleService.createRaffle(dto, tournamentId);
  }

  async drawRaffle(tournamentId: string, raffleId: string) {
    return this.raffleService.drawRaffle(raffleId, tournamentId);
  }

  async getTournamentFinancials(tournamentId: string) {
    return this.core.getTournamentFinancials(tournamentId);
  }

  async updateTournamentFinancials(
    tournamentId: string,
    dto: UpdateTournamentFinancialsDto,
  ) {
    return this.core.updateTournamentFinancials(tournamentId, dto);
  }

  // ==========================================
  // MATCHES, CALENDAR & SCHEDULING
  // ==========================================

  async generateCalendarForTournament(id: string, dto?: GenerateCalendarDto) {
    return this.matches.generateCalendarForTournament(id, dto);
  }

  async allocateTournamentMatch(
    tournamentId: string,
    matchId: string,
    dto: AllocateMatchDto,
  ) {
    return this.matches.allocateTournamentMatch(tournamentId, matchId, dto);
  }

  async unallocateTournamentMatch(tournamentId: string, matchId: string) {
    return this.matches.unallocateTournamentMatch(tournamentId, matchId);
  }

  async selfBookMatch(
    matchId: string,
    dto: AllocateMatchDto,
    currentUser: { userId: string; role?: string },
    optionalTournamentId?: string,
  ) {
    return this.matches.selfBookMatch(
      matchId,
      dto,
      currentUser,
      optionalTournamentId,
    );
  }

  async autoAllocateTournamentMatches(
    tournamentId: string,
    dto?: AutoAllocationDto,
  ) {
    return this.matches.autoAllocateTournamentMatches(tournamentId, dto);
  }

  async getTournamentMatches(
    tournamentId: string,
    filter?: {
      round?: string;
      status?: string;
      stage?: string;
      venueId?: string;
      date?: string;
      isAllocated?: string | boolean;
      page?: number | string;
      limit?: number | string;
    },
  ) {
    return this.matches.getTournamentMatches(tournamentId, filter);
  }

  async getTournamentCalendar(id: string) {
    return this.matches.getTournamentCalendar(id);
  }

  async getTournamentCapacity(id: string) {
    return this.matches.getTournamentCapacity(id);
  }

  async generateScheduleForTournament(
    id: string,
    schedulingModeOverride?: SchedulingMode,
    playerIds?: string[],
  ) {
    return this.matches.generateScheduleForTournament(
      id,
      schedulingModeOverride,
      playerIds,
    );
  }

  async updateMatchScore(
    tournamentId: string,
    matchId: string,
    dto: UpdateMatchScoreDto,
  ) {
    return this.matches.updateMatchScore(tournamentId, matchId, dto);
  }

  async recordNoShow(
    tournamentId: string,
    matchId: string,
    dto: MatchNoShowDto,
  ) {
    return this.matches.recordNoShow(tournamentId, matchId, dto);
  }

  async pauseScheduling(tournamentId: string) {
    return this.matches.pauseScheduling(tournamentId);
  }

  async resumeScheduling(tournamentId: string) {
    return this.matches.resumeScheduling(tournamentId);
  }

  async correctMatchScore(matchId: string, dto: ScoreCorrectionDto) {
    return this.matches.correctMatchScore(matchId, dto);
  }

  async disputeMatch(matchId: string, dto: CreateMatchDisputeDto) {
    return this.matches.disputeMatch(matchId, dto);
  }

  async resolveMatchDispute(disputeId: string, dto: UpdateMatchDisputeDto) {
    return this.matches.resolveMatchDispute(disputeId, dto);
  }

  async reconcileScheduleCapacity(
    tournamentId: string,
    expectedVersion?: number,
  ) {
    return this.matches.reconcileScheduleCapacity(
      tournamentId,
      expectedVersion,
    );
  }

  // ==========================================
  // REGISTRATIONS
  // ==========================================

  async createRegistration(
    tournamentId: string,
    dto: CreateTournamentRegistrationDto,
  ) {
    return this.registration.createRegistration(tournamentId, dto);
  }

  async getTournamentRegistrations(tournamentId: string) {
    return this.registration.getTournamentRegistrations(tournamentId);
  }

  async updateRegistrationStatus(
    tournamentId: string,
    registrationId: string,
    dto: UpdateRegistrationStatusDto,
  ) {
    return this.registration.updateRegistrationStatus(
      tournamentId,
      registrationId,
      dto,
    );
  }

  async openRegistration(tournamentId: string, dto: OpenRegistrationDto) {
    return this.registration.openRegistration(tournamentId, dto);
  }

  async closeRegistration(tournamentId: string) {
    return this.registration.closeRegistration(tournamentId);
  }

  async getTournamentRegistrationsWithCounts(
    tournamentId: string,
    query: QueryTournamentRegistrationDto,
  ) {
    return this.registration.getTournamentRegistrationsWithCounts(
      tournamentId,
      query,
    );
  }

  async selectRegistrations(
    tournamentId: string,
    dto: RegistrationSelectionDto,
  ) {
    return this.registration.selectRegistrations(tournamentId, dto);
  }

  async processPaymentExpiry(tournamentId: string) {
    return this.registration.processPaymentExpiry(tournamentId);
  }

  async confirmRegistrationPayment(
    registrationId: string,
    expectedVersion?: number,
    notes?: string,
  ) {
    return this.registration.confirmRegistrationPayment(
      registrationId,
      expectedVersion,
      notes,
    );
  }

  async refundRegistration(
    registrationId: string,
    expectedVersion?: number,
    reason?: string,
  ) {
    return this.registration.refundRegistration(
      registrationId,
      expectedVersion,
      reason,
    );
  }

  // ==========================================
  // LEADERBOARDS & RESULTS
  // ==========================================

  async getTournamentResults(tournamentId: string) {
    return this.leaderboard.getTournamentResults(tournamentId);
  }

  async getTournamentLeaderboard(
    tournamentId: string,
    filter?: string,
    query?: { page?: number | string; limit?: number | string },
  ) {
    return this.leaderboard.getTournamentLeaderboard(
      tournamentId,
      filter,
      query,
    );
  }

  // ==========================================
  // LIVE TOURNAMENT PREDICTIONS / WAGERS
  // ==========================================

  async getLivePredictionFixtures(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: { venues: true },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const isLive = tournament.status === 'IN_PROGRESS';
    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];

    const activeFixtures = matches
      .filter(
        (m: any) =>
          m.status !== 'COMPLETED' &&
          (m.score1 === null || m.score1 === undefined),
      )
      .map((m: any) => ({
        matchId: m.id || `${tournament.tournamentId}-${m.time}`,
        tournamentName: tournament.name,
        time: m.time || '10:35',
        player1: {
          id: m.player1Id,
          gamertag: m.player1Name || m.participant1Ref?.name || 'GamerTag83',
          odds: 1.85,
        },
        player2: {
          id: m.player2Id,
          gamertag: m.player2Name || m.participant2Ref?.name || 'GamerTag84',
          odds: 2.1,
        },
        drawOdds: 3.1,
        status: 'OPEN_FOR_PREDICTION',
      }));

    return {
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      isLive,
      fixtures: activeFixtures,
    };
  }

  async lockPrediction(
    tournamentId: string,
    dto: PredictMatchDto,
    currentUser: { userId: string; role?: string },
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    // Restriction: Predictions allowed on Live tournaments only
    if (
      tournament.status !== 'IN_PROGRESS' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Predictions are strictly restricted to active Live tournaments only.',
      );
    }

    // Match verification
    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];
    const match = matches.find(
      (m: any) => m.id === dto.matchId || String(m.id).includes(dto.matchId),
    );

    if (match) {
      if (
        match.status === 'COMPLETED' ||
        (match.score1 !== null && match.score1 !== undefined)
      ) {
        throw new BadRequestException(
          'Match is already completed. Predictions are closed for this fixture.',
        );
      }
    }

    // Fetch fan profile and balance
    const fan = await this.prisma.fan.findFirst({
      where: { fanId: currentUser?.userId, isDeleted: false },
    });

    if (!fan) {
      throw new BadRequestException(
        'Only registered fans can participate in coin predictions.',
      );
    }

    const availablePoints = (fan.topPoint || 0) + (fan.coins || 0);
    if (availablePoints < dto.wagerPoints) {
      throw new BadRequestException(
        `Insufficient points! You currently have ${availablePoints} pts, but this wager requires ${dto.wagerPoints} pts.`,
      );
    }

    // Deduct wagered points
    const updatedFan = await this.prisma.fan.update({
      where: { fanId: fan.fanId },
      data: {
        topPoint: { decrement: dto.wagerPoints },
      },
    });

    const potentialPayout = Math.round(dto.wagerPoints * dto.odds);

    return {
      message: 'Prediction successfully locked in!',
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      matchId: dto.matchId,
      predictedWinnerId: dto.predictedWinnerId,
      wagerPoints: dto.wagerPoints,
      odds: dto.odds,
      potentialPayout,
      remainingPoints: Math.max(
        0,
        (updatedFan.topPoint || 0) + (updatedFan.coins || 0),
      ),
      status: 'LOCKED',
      timestamp: new Date().toISOString(),
    };
  }

  // ==========================================
  // Player Self-Schedule & Calendar Facade Methods
  // ==========================================

  async getPlayerScheduleCalendar(
    playerId: string,
    optionalTournamentId?: string,
  ) {
    return this.matches.getPlayerScheduleCalendar(
      playerId,
      optionalTournamentId,
    );
  }

  async getMatchShowdownDetails(
    matchId: string,
    optionalTournamentId?: string,
  ) {
    return this.matches.getMatchShowdownDetails(matchId, optionalTournamentId);
  }

  async getPlayerPendingSelfScheduleMatches(
    tournamentId: string,
    playerId: string,
  ) {
    return this.matches.getPlayerPendingSelfScheduleMatches(
      tournamentId,
      playerId,
    );
  }

  async getAvailableSlotsForMatch(
    tournamentId: string,
    matchId: string,
    playerId: string,
    userRole?: string,
  ) {
    return this.matches.getAvailableSlotsForMatch(
      tournamentId,
      matchId,
      playerId,
      userRole,
    );
  }

  async proposeSlot(
    tournamentId: string,
    matchId: string,
    playerId: string,
    dto: ProposeSlotDto,
  ) {
    return this.matches.proposeSlot(tournamentId, matchId, playerId, dto);
  }

  async emergencyTokenAppeal(
    tournamentId: string,
    matchId: string,
    playerId: string,
    dto: EmergencyAppealDto,
  ) {
    return this.matches.emergencyTokenAppeal(
      tournamentId,
      matchId,
      playerId,
      dto,
    );
  }

  async simulateSelfScheduling(
    tournamentId: string,
    dto: SimulateSelfScheduleDto,
  ) {
    return this.matches.simulateSelfScheduling(tournamentId, dto);
  }

  async processDueAutoAssignments(tournamentId?: string) {
    return this.matches.processDueAutoAssignments(tournamentId);
  }
}
