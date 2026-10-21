import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { UpdateTournamentTemplatesDto } from '../dto/tournament/update-templates.dto';
import { UpdateTournamentStatusDto } from '../dto/tournament/update-tournament-status.dto';
import { RegistrationSelectionDto } from '../dto/tournament/registration-selection.dto';
import { ScoreCorrectionDto } from '../dto/tournament/score-correction.dto';
import { CreateMatchDisputeDto } from '../dto/tournament/match-dispute.dto';
import { UpdateMatchDisputeDto } from '../dto/tournament/update-dispute.dto';
import { UpdateTournamentFinancialsDto } from '../dto/tournament/update-financials.dto';
import { QueryTournamentRegistrationDto } from '../dto/tournament/query-registration.dto';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentScheduleService: TournamentScheduleService,
    @Optional() coreService?: TournamentCoreService,
    @Optional() registrationService?: TournamentRegistrationService,
    @Optional() matchesService?: TournamentMatchesService,
    @Optional() leaderboardService?: TournamentLeaderboardService,
  ) {
    this.core =
      coreService ||
      new TournamentCoreService(
        this.prisma,
        this.tournamentScheduleService,
      );
    this.registration =
      registrationService || new TournamentRegistrationService(this.prisma);
    this.matches =
      matchesService ||
      new TournamentMatchesService(
        this.prisma,
        this.tournamentScheduleService,
      );
    this.leaderboard =
      leaderboardService || new TournamentLeaderboardService(this.prisma);
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

  async getTournamentById(id: string) {
    return this.core.getTournamentById(id);
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
    return this.core.getRaffles(tournamentId);
  }

  async createRaffle(tournamentId: string, dto: CreateRaffleDto) {
    return this.core.createRaffle(tournamentId, dto);
  }

  async drawRaffle(tournamentId: string, raffleId: string) {
    return this.core.drawRaffle(tournamentId, raffleId);
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
    return this.matches.reconcileScheduleCapacity(tournamentId, expectedVersion);
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

  async getTournamentLeaderboard(tournamentId: string) {
    return this.leaderboard.getTournamentLeaderboard(tournamentId);
  }
}
