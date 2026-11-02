import {
  Injectable,
  Logger,
  Optional,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

  async getActiveUpcomingTournaments(query: QueryOptions = {}) {
    return this.core.getActiveUpcomingTournaments(query);
  }

  async getTournamentById(id: string, include?: string) {
    return this.core.getTournamentById(id, include);
  }

  async getTournamentStaffAssignments(tournamentId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { tournamentId, isDeleted: false },
      select: { tournamentId: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    return this.prisma.tournamentStaffAssignment.findMany({
      where: { tournamentId },
      include: {
        employee: {
          select: {
            employeeId: true,
            showEmployeeId: true,
            name: true,
            email: true,
            role: true,
            state: true,
            profileImage: true,
          },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }

  async assignTournamentMatchStaff(
    tournamentId: string,
    matchId: string,
    employeeId: string,
  ) {
    if (!employeeId?.trim()) throw new BadRequestException('Employee is required');
    const tournament = await this.prisma.tournament.findFirst({
      where: { tournamentId, isDeleted: false },
      select: { tournamentId: true, schedule: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const matches = this.getAssignableScheduleMatches(tournament.schedule);
    if (!matches.some((match) => String(match.id) === matchId)) {
      throw new NotFoundException('Match does not belong to this tournament schedule');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        employeeId,
        state: 'ACTIVE',
        isDeleted: false,
      },
      select: { employeeId: true },
    });
    if (!employee) {
      throw new BadRequestException('Select an active employee account');
    }

    return this.prisma.tournamentStaffAssignment.upsert({
      where: { tournamentId_matchId: { tournamentId, matchId } },
      create: { tournamentId, matchId, employeeId: employee.employeeId },
      update: { employeeId: employee.employeeId },
      include: {
        employee: {
          select: {
            employeeId: true,
            showEmployeeId: true,
            name: true,
            email: true,
            role: true,
            state: true,
            profileImage: true,
          },
        },
      },
    });
  }

  async unassignTournamentMatchStaff(tournamentId: string, matchId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { tournamentId, isDeleted: false },
      select: { tournamentId: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    await this.prisma.tournamentStaffAssignment.deleteMany({
      where: { tournamentId, matchId },
    });
    return { tournamentId, matchId, assigned: false };
  }

  async autoAssignTournamentStaff(tournamentId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { tournamentId, isDeleted: false },
      select: { tournamentId: true, schedule: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const matches = this.getAssignableScheduleMatches(tournament.schedule);
    if (matches.length === 0) {
      throw new BadRequestException('Generate and publish tournament matches before assigning staff');
    }
    const employees = await this.prisma.employee.findMany({
      where: { state: 'ACTIVE', isDeleted: false },
      select: { employeeId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (employees.length === 0) {
      throw new BadRequestException('There are no active employees available to assign');
    }

    const existing = await this.prisma.tournamentStaffAssignment.findMany({
      where: { tournamentId },
      select: { matchId: true },
    });
    const assignedIds = new Set(existing.map((assignment) => assignment.matchId));
    const unassigned = matches.filter((match) => !assignedIds.has(String(match.id)));

    const creates = unassigned.map((match: any, index: number) =>
      this.prisma.tournamentStaffAssignment.create({
        data: {
          tournamentId,
          matchId: String(match.id),
          employeeId: employees[index % employees.length].employeeId,
        },
      }),
    );
    if (creates.length > 0) await this.prisma.$transaction(creates);

    return {
      assignedCount: unassigned.length,
      assignments: await this.getTournamentStaffAssignments(tournamentId),
    };
  }

  private getAssignableScheduleMatches(scheduleValue: unknown): any[] {
    const schedule = scheduleValue as any;
    if (Array.isArray(schedule)) {
      return schedule.flatMap((venue: any) =>
        (venue?.screens || []).flatMap((screen: any) =>
          (screen?.days || []).flatMap((day: any) =>
            (day?.timeslots || [])
              .map((slot: any) => slot?.game)
              .filter((match: any) => match?.id),
          ),
        ),
      );
    }
    const canonical = schedule?.structure?.matches || schedule?.matches;
    if (Array.isArray(canonical)) return canonical.filter((match: any) => match?.id);
    return [];
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
    return {
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      isLive,
      fixtures: isLive ? this.toPredictionFixtures(tournament) : [],
    };
  }

  async getAllLivePredictionFixtures() {
    const tournaments = await this.prisma.tournament.findMany({
      where: { status: 'IN_PROGRESS', isDeleted: false },
      orderBy: { startDate: 'asc' },
    });

    return tournaments.flatMap((tournament) => this.toPredictionFixtures(tournament));
  }

  private toPredictionFixtures(tournament: any) {
    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];

    const activeFixtures = matches
      .filter(
        (m: any) =>
          m.id &&
          m.player1Id &&
          m.player2Id &&
          m.status !== 'COMPLETED' &&
          m.status !== 'CANCELLED' &&
          m.status !== 'NO_SHOW' &&
          m.score1 == null &&
          m.score2 == null,
      )
      .map((m: any) => ({
        matchId: m.id,
        tournamentId: tournament.tournamentId,
        tournamentName: tournament.name,
        time: m.startTime || m.time || '',
        date: m.scheduledDate || m.date || '',
        round: m.round || m.stage || '',
        player1: {
          id: m.player1Id,
          gamertag: m.player1Name || m.participant1Ref?.name || 'TBD',
        },
        player2: {
          id: m.player2Id,
          gamertag: m.player2Name || m.participant2Ref?.name || 'TBD',
        },
        odds: 2,
        status: 'OPEN',
      }));

    return activeFixtures;
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

    if (tournament.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Predictions are only open while the tournament is live.',
      );
    }

    // Match verification
    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];
    const match = matches.find((m: any) => m.id === dto.matchId);

    if (!match || !match.player1Id || !match.player2Id) {
      throw new NotFoundException('Prediction fixture not found or missing competitors');
    }
    if (match.status === 'COMPLETED' || match.status === 'CANCELLED' || match.score1 != null || match.score2 != null) {
      throw new BadRequestException('Match is already completed. Predictions are closed for this fixture.');
    }
    if (![match.player1Id, match.player2Id, 'DRAW'].includes(dto.predictedWinnerId)) {
      throw new BadRequestException('Select one of the competitors or DRAW.');
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

    if (!Number.isInteger(dto.wagerCoins) || dto.wagerCoins < 20 || dto.wagerCoins > 500) {
      throw new BadRequestException('Coin stake must be a whole number between 20 and 500.');
    }

    const odds = 2;
    const potentialPayout = dto.wagerCoins * odds;
    let prediction: { saved: any; remainingCoins: number };
    try {
      prediction = await this.prisma.$transaction(async (tx) => {
      const debit = await tx.fan.updateMany({
        where: { fanId: fan.fanId, coins: { gte: dto.wagerCoins } },
        data: { coins: { decrement: dto.wagerCoins } },
      });
      if (debit.count !== 1) {
        throw new BadRequestException('Insufficient coins for this prediction.');
      }

      const updatedFan = await tx.fan.findUniqueOrThrow({ where: { fanId: fan.fanId } });
      const saved = await tx.fanPrediction.create({
        data: {
          fanId: fan.fanId,
          tournamentId: tournament.tournamentId,
          matchId: match.id,
          matchTitle: `${match.player1Name || match.participant1Ref?.name || match.player1Id} vs ${match.player2Name || match.participant2Ref?.name || match.player2Id}`,
          predictedWinnerId: dto.predictedWinnerId,
          predictedWinnerName: dto.predictedWinnerId === 'DRAW'
            ? 'Draw'
            : dto.predictedWinnerId === match.player1Id
              ? match.player1Name || match.participant1Ref?.name || match.player1Id
              : match.player2Name || match.participant2Ref?.name || match.player2Id,
          stakeCoins: dto.wagerCoins,
          odds,
          potentialPayout,
        },
      });
      await tx.fanCoinTransaction.create({
        data: {
          fanId: fan.fanId,
          predictionId: saved.id,
          type: 'PREDICTION_STAKE',
          amount: -dto.wagerCoins,
          balanceAfter: updatedFan.coins,
          description: `Prediction stake: ${tournament.name}`,
        },
      });
        return { saved, remainingCoins: updatedFan.coins };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('You already placed a prediction on this match.');
      }
      throw error;
    }

    return {
      message: 'Prediction successfully locked in!',
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      matchId: dto.matchId,
      predictedWinnerId: dto.predictedWinnerId,
      wagerCoins: dto.wagerCoins,
      predictedWinnerName: prediction.saved.predictedWinnerName,
      odds,
      potentialPayout,
      remainingCoins: Math.max(0, prediction.remainingCoins || 0),
      status: prediction.saved.status,
      timestamp: prediction.saved.createdAt.toISOString(),
      predictionId: prediction.saved.id,
    };
  }

  async getFanPredictionHistory(fanId: string) {
    if (!fanId) throw new BadRequestException('Fan authentication is required.');
    const fan = await this.prisma.fan.findUnique({
      where: { fanId },
      select: { fanId: true, coins: true },
    });
    if (!fan) throw new NotFoundException('Fan account not found.');
    const [predictions, coinTransactions] = await Promise.all([
      this.prisma.fanPrediction.findMany({
        where: { fanId },
        include: { tournament: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fanCoinTransaction.findMany({
        where: { fanId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { coins: fan.coins, predictions, coinTransactions };
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
