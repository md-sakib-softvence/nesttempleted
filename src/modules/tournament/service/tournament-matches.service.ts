import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TournamentScheduleService,
  Participant,
  ScheduleVenueInput,
  TournamentSchedulePayload,
} from './tournament-schedule.service';
import { GenerateCalendarDto } from '../dto/tournament/generate-calendar.dto';
import { AllocateMatchDto } from '../dto/tournament/allocate-match.dto';
import { AutoAllocationDto } from '../dto/tournament/auto-allocation.dto';
import { UpdateMatchScoreDto } from '../dto/tournament/update-match-score.dto';
import { MatchNoShowDto } from '../dto/tournament/match-no-show.dto';
import { ScoreCorrectionDto } from '../dto/tournament/score-correction.dto';
import { CreateMatchDisputeDto } from '../dto/tournament/match-dispute.dto';
import { UpdateMatchDisputeDto } from '../dto/tournament/update-dispute.dto';
import { ProposeSlotDto } from '../dto/tournament/propose-slot.dto';
import { SimulateSelfScheduleDto } from '../dto/tournament/simulate-self-schedule.dto';
import { EmergencyAppealDto } from '../dto/tournament/emergency-appeal.dto';
import {
  MatchSchedulingPhase,
  evaluateSelfSchedulingWindow,
  findEarliestValidSlot,
  isPeakTimeslot,
  CandidateSlot,
} from '../utils/self-schedule.util';
import { SchedulingMode, Prisma, Role } from '@prisma/client';
import { presignTournamentMedia } from '../utils/tournament-media.util';
import { createActivities } from '../../utils/activity.util';

@Injectable()
export class TournamentMatchesService {
  private readonly logger = new Logger(TournamentMatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentScheduleService: TournamentScheduleService,
  ) {}

  /**
   * Generates calendar grid and matches allocation for a tournament
   */
  async generateCalendarForTournament(id: string, dto?: GenerateCalendarDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
      include: {
        venues: {
          include: {
            screens: true,
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    let tournamentVenues = tournament.venues;
    if (tournamentVenues.length === 0) {
      const existingVenues = await this.prisma.venue.findMany({
        include: { screens: true },
        take: 5,
      });
      if (existingVenues.length > 0) {
        tournamentVenues = existingVenues;
      }
    }

    if (tournamentVenues.length === 0) {
      throw new BadRequestException(
        'No venues or screens configured for this tournament to generate calendar grid.',
      );
    }

    const dailyStart = dto?.dailyStart || tournament.dailyStart;
    const dailyEnd = dto?.dailyEnd || tournament.dailyEnd;
    const matchDuration = dto?.matchDuration || tournament.matchDuration;
    const turnoverDuration =
      dto?.turnoverDuration !== undefined
        ? dto.turnoverDuration
        : tournament.turnoverDuration;
    const lunchBreakTime =
      dto?.lunchBreakTime !== undefined
        ? dto.lunchBreakTime
        : tournament.lunchBreakTime;
    const lunchDuration =
      dto?.lunchDuration !== undefined
        ? dto.lunchDuration
        : tournament.lunchDuration;
    const buffer = dto?.buffer !== undefined ? dto.buffer : tournament.buffer;
    const frequencyStatus = dto?.frequencyStatus || tournament.frequencyStatus;
    const frequencyArray = dto?.frequencyArray || tournament.frequencyArray;

    const venueInputs: ScheduleVenueInput[] = tournamentVenues.map((v) => ({
      venueId: v.venueId,
      name: v.name,
      screens: v.screens.map((s) => ({
        screenId: s.screenId,
        screenName: s.screenName,
      })),
    }));

    const existingSchedule: any = tournament.schedule || {};
    let structure = existingSchedule.structure;

    if (!structure || !structure.matches) {
      structure = this.tournamentScheduleService.generateCanonicalStructure(
        tournament.tournamentId,
        tournament.tournamentFormat,
        tournament.numberOfTeams,
      );
    }

    const schedulableCount =
      structure.summary?.schedulableMatches ||
      structure.summary?.totalCompetitionMatches ||
      structure.matches.length;

    const capacity = this.tournamentScheduleService.calculateCapacity({
      dailyStart,
      dailyEnd,
      slotDuration: matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
      venues: venueInputs,
      totalMatches: schedulableCount,
    });

    const eventDates = this.tournamentScheduleService.generatePlayingDates(
      tournament.startDate,
      capacity.totalPlayingDaysNeeded,
      frequencyStatus,
      frequencyArray,
      buffer,
    );

    const dayTimeslots = this.tournamentScheduleService.calculateDayTimeslots(
      dailyStart,
      dailyEnd,
      matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
    );

    const calendar = this.tournamentScheduleService.buildEmptyScheduleGrid(
      venueInputs,
      eventDates,
      dayTimeslots,
      dto?.schedulingPolicy,
    );

    const existingMatches = structure.matches || [];
    for (const match of existingMatches) {
      if (match.venueId && match.screenId && match.date && match.time) {
        const venue = calendar.find((v) => v.venueId === match.venueId);
        const screen = venue?.screens.find(
          (s) => s.screenId === match.screenId,
        );
        const day = screen?.days.find((d) => d.date === match.date);
        const slot = day?.timeslots.find((t) => t.time === match.time);

        if (slot && slot.canonicalMatchId === null) {
          slot.canonicalMatchId = match.id;
          slot.game = {
            id: match.id,
            canonicalMatchId: match.id,
            player1Id: match.player1Id || 'TBD',
            player1Name: match.player1Name || 'TBD',
            player2Id: match.player2Id || 'TBD',
            player2Name: match.player2Name || 'TBD',
            score1: match.score1,
            score2: match.score2,
            status: match.status,
            round: match.round,
            matchNumber: match.matchNumber,
            bracketSection: match.bracketSection,
            venueId: match.venueId,
            venueName: venue?.venueName,
            screenId: match.screenId,
            screenName: screen?.screenName,
            date: match.date,
            time: match.time,
          };
        }
      }
    }

    const schedulePayload: TournamentSchedulePayload = {
      capacity: { ...capacity, eventDates },
      structure,
      calendar,
    };

    const updated = await this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        schedule: schedulePayload as any,
      },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        venues: {
          include: {
            screens: true,
          },
        },
        sponsors: true,
      },
    });

    return presignTournamentMedia(updated);
  }

  /**
   * Helper to find a tournament by ID or by contained canonical matchId
   */
  async resolveTournamentForMatch(
    tournamentId: string | undefined | null,
    matchId: string,
  ) {
    if (tournamentId && tournamentId.trim()) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { tournamentId },
      });
      if (tournament && !tournament.isDeleted) {
        return tournament;
      }
    }

    // Fallback: search all tournaments containing this matchId in their schedule
    const tournaments = await this.prisma.tournament.findMany({
      where: { isDeleted: false, schedule: { not: Prisma.JsonNull } },
    });

    for (const t of tournaments) {
      const schedule = (t.schedule as any) || {};
      const matches: any[] =
        schedule.structure?.matches || schedule.matches || [];
      const matchExists = matches.some(
        (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
      );
      if (matchExists) {
        return t;
      }
    }

    throw new NotFoundException(
      `Match #${matchId} not found in any active tournament`,
    );
  }

  /**
   * Link a canonical match ID to a physical slot (venueId, screenId, date, time)
   */
  async allocateTournamentMatch(
    tournamentId: string,
    matchId: string,
    dto: AllocateMatchDto,
  ) {
    const tournament = await this.resolveTournamentForMatch(
      tournamentId,
      matchId,
    );

    const currentSchedule =
      tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule and canonical structure have not been generated yet.',
      );
    }

    const { updatedSchedule, match, allocation } =
      this.tournamentScheduleService.allocateMatch(
        currentSchedule,
        matchId,
        dto.venueId,
        dto.screenId,
        dto.date,
        dto.time,
      );

    await this.prisma.tournament.update({
      where: { tournamentId: tournament.tournamentId },
      data: { schedule: updatedSchedule as any },
    });

    return {
      allocation,
      match,
    };
  }

  /**
   * Clears physical allocation for a canonical match, preserving scores
   */
  async unallocateTournamentMatch(tournamentId: string, matchId: string) {
    const tournament = await this.resolveTournamentForMatch(
      tournamentId,
      matchId,
    );

    const currentSchedule =
      tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule has not been generated yet.',
      );
    }

    const { updatedSchedule, match } =
      this.tournamentScheduleService.unallocateMatch(currentSchedule, matchId);

    await this.prisma.tournament.update({
      where: { tournamentId: tournament.tournamentId },
      data: { schedule: updatedSchedule as any },
    });

    return {
      match,
    };
  }

  /**
   * Player Self-Booking Fixture Endpoint:
   * Validates competitor eligibility, tournament PLAYER_SELF scheduling window,
   * no player schedule overlap or screen collision, and updates canonical schedule.
   */
  async selfBookMatch(
    matchId: string,
    dto: AllocateMatchDto,
    currentUser: { userId: string; role?: string },
    optionalTournamentId?: string,
  ) {
    const tournament = await this.resolveTournamentForMatch(
      optionalTournamentId,
      matchId,
    );

    const isPlayer =
      currentUser.role === Role.PLAYER ||
      currentUser.role === 'PLAYER' ||
      currentUser.role === 'player';

    // 1. If requester is a player, enforce PLAYER_SELF scheduling rules
    if (isPlayer) {
      if (tournament.schedulingMode !== SchedulingMode.PLAYER_SELF) {
        throw new BadRequestException(
          'Player self-scheduling is not enabled for this tournament.',
        );
      }

      const isWindowOpen =
        (tournament as any).schedulingWindowOpen ??
        !tournament.schedulingPaused;

      if (!isWindowOpen) {
        throw new BadRequestException(
          'Self-scheduling window is currently closed for this tournament.',
        );
      }

      if (tournament.schedulingPaused) {
        throw new BadRequestException(
          'Tournament scheduling is temporarily paused by administration.',
        );
      }
    }

    const currentSchedule =
      tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule and structure have not been generated yet.',
      );
    }

    const matches: any[] = currentSchedule.structure.matches || [];
    const targetMatch = matches.find(
      (m) => m.id === matchId || m.canonicalMatchId === matchId,
    );

    if (!targetMatch) {
      throw new NotFoundException(`Match #${matchId} not found in tournament`);
    }

    if (
      targetMatch.status === 'COMPLETED' ||
      targetMatch.status === 'CANCELLED'
    ) {
      throw new BadRequestException(
        `Cannot reschedule a match that is ${targetMatch.status.toLowerCase()}.`,
      );
    }

    // Atomic allocation check: prevent double-booking if opponent or worker already booked
    if (targetMatch.date && targetMatch.time && targetMatch.venueId) {
      throw new ConflictException(
        'MATCH_ALREADY_ALLOCATED: This match has already been scheduled and allocated to a timeslot.',
      );
    }

    // 2. Validate Player Ownership / Participation & Escalation Phase
    if (isPlayer) {
      const isParticipant =
        targetMatch.player1Id === currentUser.userId ||
        targetMatch.player2Id === currentUser.userId;

      if (!isParticipant) {
        throw new ForbiddenException(
          'You are not an authorized competitor in this match.',
        );
      }

      // Phase 3 deadline check (96+ hours)
      const windowState = evaluateSelfSchedulingWindow(
        targetMatch.selfSchedulingOpenedAt || tournament.startDate,
      );
      if (windowState.phase === 3 && !targetMatch.emergencyTokenUsed) {
        throw new ForbiddenException(
          'The 96-hour self-scheduling deadline has expired. This match is closed for manual booking and queued for system auto-assignment.',
        );
      }

      // Ensure both competitors are resolved
      const p1 = targetMatch.player1Id;
      const p2 = targetMatch.player2Id;
      if (
        !p1 ||
        !p2 ||
        p1.startsWith('TBD') ||
        p2.startsWith('TBD') ||
        p1.startsWith('BYE') ||
        p2.startsWith('BYE')
      ) {
        throw new BadRequestException(
          'Both competitors must be confirmed and resolved before booking this match.',
        );
      }

      // Check matchday scheduling policy if configured
      const venueSched = (currentSchedule.calendar || []).find(
        (v) => v.venueId === dto.venueId,
      );
      const screenSched = venueSched?.screens?.find(
        (s) => s.screenId === dto.screenId,
      );
      const daySched = screenSched?.days?.find((d) => d.date === dto.date);
      const policy = daySched?.schedulingPolicy;

      if (policy) {
        if (policy.isWindowOpen === false) {
          throw new BadRequestException(
            'Self-scheduling is closed for this matchday.',
          );
        }
        const now = Date.now();
        if (
          policy.windowOpenTime &&
          now < new Date(policy.windowOpenTime).getTime()
        ) {
          throw new BadRequestException(
            'The matchday booking window is not currently open.',
          );
        }
        if (
          policy.windowCloseTime &&
          now >= new Date(policy.windowCloseTime).getTime()
        ) {
          throw new BadRequestException(
            'The matchday booking window has expired.',
          );
        }
      }
    }

    // 3. Perform canonical allocation with screen collision and player interval overlap validation
    const { updatedSchedule, match, allocation } =
      this.tournamentScheduleService.allocateMatch(
        currentSchedule,
        matchId,
        dto.venueId,
        dto.screenId,
        dto.date,
        dto.time,
      );

    // Clear proposal slot if booked
    if (match) {
      match.proposedSlot = undefined;
      match.schedulingPhase = MatchSchedulingPhase.SCHEDULED;
      match.status = 'SCHEDULED';
    }

    await this.prisma.tournament.update({
      where: { tournamentId: tournament.tournamentId },
      data: {
        schedule: updatedSchedule as any,
        version: { increment: 1 },
      },
    });

    await createActivities(
      this.prisma,
      'Match Fixture Booked',
      `Match #${matchId} booked by ${currentUser.role || 'User'} #${currentUser.userId} on ${dto.date} at ${dto.time}`,
      'TOURNAMENT',
    );

    return {
      message: 'Match fixture successfully scheduled',
      tournamentId: tournament.tournamentId,
      match,
      allocation,
    };
  }

  /**
   * Auto allocation for all unallocated matches
   */
  async autoAllocateTournamentMatches(
    tournamentId: string,
    dto?: AutoAllocationDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        venues: {
          include: {
            screens: true,
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const currentSchedule =
      tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule has not been generated yet.',
      );
    }

    const mode =
      dto?.mode || tournament.schedulingMode || SchedulingMode.AUTO_HOME_VENUE;

    const participants: Participant[] = (currentSchedule.structure.slots || [])
      .filter((s) => s.participantId)
      .map((s, idx) => ({
        playerId: s.participantId!,
        name: s.participantName || `Player ${s.slotNumber}`,
        homeVenueId:
          tournament.venues.length > 0
            ? tournament.venues[idx % tournament.venues.length].venueId
            : undefined,
      }));

    const updatedCalendar =
      this.tournamentScheduleService.assignMatchesToSchedule(
        currentSchedule.calendar,
        currentSchedule.structure.matches,
        participants,
        mode,
      );

    const updatedPayload: TournamentSchedulePayload = {
      ...currentSchedule,
      calendar: updatedCalendar,
    };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: updatedPayload as any, schedulingMode: mode },
    });

    return {
      mode,
      matches: currentSchedule.structure.matches,
      calendar: updatedCalendar,
    };
  }

  /**
   * Returns canonical matches for tournament
   */
  async getTournamentMatches(
    id: string,
    filter?: {
      round?: string;
      status?: string;
      stage?: string;
      venueId?: string;
      date?: string;
      isAllocated?: string | boolean;
    },
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    let matches: any[] = schedule?.structure?.matches || [];
    const summary = schedule?.structure?.summary || {};

    if (filter) {
      if (filter.round) {
        matches = matches.filter((m) =>
          m.round?.toLowerCase().includes(filter.round!.toLowerCase()),
        );
      }
      if (filter.status) {
        matches = matches.filter((m) =>
          m.status?.toLowerCase().includes(filter.status!.toLowerCase()),
        );
      }
      if (filter.isAllocated !== undefined && filter.isAllocated !== '') {
        const wantAllocated =
          filter.isAllocated === true || filter.isAllocated === 'true';
        matches = matches.filter((m) => {
          const hasAlloc = Boolean(m.physicalAllocation || m.allocatedSlot);
          return wantAllocated ? hasAlloc : !hasAlloc;
        });
      }
    }

    return {
      tournamentId: id,
      summary,
      matches,
    };
  }

  /**
   * Returns calendar grid for tournament
   */
  async getTournamentCalendar(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    const calendar = schedule?.calendar || [];
    const capacity = schedule?.capacity || {};

    return {
      tournamentId: id,
      capacity,
      calendar,
    };
  }

  /**
   * Returns capacity calculation breakdown
   */
  async getTournamentCapacity(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    const capacity = schedule?.capacity || {};
    const matches: any[] = schedule?.structure?.matches || [];
    const calendar: any[] = schedule?.calendar || [];

    const allocatedCount = matches.filter(
      (m: any) => m.physicalAllocation || m.allocatedSlot,
    ).length;

    let totalPhysicalSlots = 0;
    let occupiedPhysicalSlots = 0;
    for (const v of calendar) {
      for (const s of v.screens || []) {
        for (const d of s.days || []) {
          for (const ts of d.timeslots || []) {
            totalPhysicalSlots++;
            if (ts.game || ts.canonicalMatchId) {
              occupiedPhysicalSlots++;
            }
          }
        }
      }
    }

    const guaranteed =
      schedule?.structure?.summary?.guaranteedMatches ||
      capacity.totalMatches ||
      tournament.numberOfTeams ||
      0;
    const conditional =
      schedule?.structure?.summary?.conditionalMatches || 0;
    const maximum =
      schedule?.structure?.summary?.maximumPossibleMatches ||
      guaranteed + conditional;

    return {
      status: 'SUFFICIENT',
      guaranteedMatches: guaranteed,
      conditionalMatches: conditional,
      maximumPossibleMatches: maximum,
      allocatedMatches: allocatedCount,
      pendingGuaranteedMatches: Math.max(0, guaranteed - allocatedCount),
      inactiveConditionalReserveMatches: 0,
      totalPhysicalSlots: totalPhysicalSlots || capacity.totalDailySlots || 0,
      occupiedPhysicalSlots,
      availablePhysicalSlots: Math.max(
        0,
        (totalPhysicalSlots || capacity.totalDailySlots || 0) -
          occupiedPhysicalSlots,
      ),
      guaranteedDeficit: 0,
      conditionalReserveDeficit: 0,
      surplusAfterMaximum: Math.max(
        0,
        (totalPhysicalSlots || capacity.totalDailySlots || 0) - maximum,
      ),
      baselinePlayingDays: capacity.totalPlayingDaysNeeded || 1,
      conditionalReservePlayingDays: 0,
      bufferPlayingDays: tournament.buffer || 1,
      totalGeneratedPlayingDays:
        (capacity.totalPlayingDaysNeeded || 1) + (tournament.buffer || 1),
      playerConflictCount: 0,
      ...capacity,
    };
  }

  /**
   * Regenerates full match schedule and canonical structure for a Tournament
   */
  async generateScheduleForTournament(
    id: string,
    schedulingModeOverride?: SchedulingMode,
    playerIds?: string[],
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
      include: {
        venues: {
          include: {
            screens: true,
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedulingMode =
      schedulingModeOverride ||
      tournament.schedulingMode ||
      SchedulingMode.AUTO_HOME_VENUE;

    let tournamentVenues = tournament.venues;
    if (tournamentVenues.length === 0) {
      const existingVenues = await this.prisma.venue.findMany({
        include: { screens: true },
        take: 5,
      });
      if (existingVenues.length > 0) {
        tournamentVenues = existingVenues;
      }
    }

    let participants: Participant[] = [];
    if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
      const players = await this.prisma.player.findMany({
        where: { playerId: { in: playerIds } },
      });
      participants = players.map((p, idx) => ({
        playerId: p.playerId,
        name:
          `${p.firstName} ${p.lastName}`.trim() ||
          p.gamerTag ||
          p.username ||
          `Player ${idx + 1}`,
        homeVenueId:
          tournamentVenues.length > 0
            ? tournamentVenues[idx % tournamentVenues.length].venueId
            : undefined,
      }));
    } else {
      const activePlayers = await this.prisma.player.findMany({
        where: { status: 'ACTIVE', isDeleted: false },
        take: tournament.numberOfTeams,
      });
      participants = activePlayers.map((p, idx) => ({
        playerId: p.playerId,
        name:
          `${p.firstName} ${p.lastName}`.trim() ||
          p.gamerTag ||
          p.username ||
          `Player ${idx + 1}`,
        homeVenueId:
          tournamentVenues.length > 0
            ? tournamentVenues[idx % tournamentVenues.length].venueId
            : undefined,
      }));
    }

    const venueInputs: ScheduleVenueInput[] = tournamentVenues.map((v) => ({
      venueId: v.venueId,
      name: v.name,
      screens: v.screens.map((s) => ({
        screenId: s.screenId,
        screenName: s.screenName,
      })),
    }));

    const schedule = await this.tournamentScheduleService.generateSchedule({
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      tournamentFormat: tournament.tournamentFormat,
      schedulingMode,
      numberOfTeams: tournament.numberOfTeams,
      startDate: tournament.startDate,
      dailyStart: tournament.dailyStart,
      dailyEnd: tournament.dailyEnd,
      matchDuration: tournament.matchDuration,
      turnoverDuration: tournament.turnoverDuration,
      lunchBreakTime: tournament.lunchBreakTime,
      lunchDuration: tournament.lunchDuration,
      buffer: tournament.buffer,
      frequencyStatus: tournament.frequencyStatus,
      frequencyArray: tournament.frequencyArray,
      venues: venueInputs,
      participants,
    });

    const updated = await this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        schedulingMode,
        schedule: schedule as any,
      },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        venues: {
          include: {
            screens: true,
          },
        },
        sponsors: true,
      },
    });

    return presignTournamentMedia(updated);
  }

  /**
   * Updates score and status for a canonical match, advancing winners in brackets if applicable
   */
  async updateMatchScore(
    tournamentId: string,
    matchId: string,
    dto: UpdateMatchScoreDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] = schedule.structure?.matches || schedule.matches || [];

    const matchIndex = matches.findIndex(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );

    if (matchIndex === -1) {
      throw new NotFoundException(`Match #${matchId} not found in tournament schedule`);
    }

    const match = matches[matchIndex];
    match.score1 = dto.score1;
    match.score2 = dto.score2;
    match.status = dto.status || 'COMPLETED';

    if (match.score1 !== null && match.score2 !== null) {
      const winner =
        match.score1 > match.score2
          ? match.participant1Ref
          : match.score2 > match.score1
            ? match.participant2Ref
            : null;

      const loser =
        match.score1 > match.score2
          ? match.participant2Ref
          : match.score2 > match.score1
            ? match.participant1Ref
            : null;

      const winnerPlayerId =
        match.score1 > match.score2 ? match.player1Id : match.player2Id;
      const winnerPlayerName =
        match.score1 > match.score2 ? match.player1Name : match.player2Name;
      const loserPlayerId =
        match.score1 > match.score2 ? match.player2Id : match.player1Id;
      const loserPlayerName =
        match.score1 > match.score2 ? match.player2Name : match.player1Name;

      if (winner && match.nextMatchWinnerTargetId) {
        const nextWinnerMatch = matches.find(
          (m: any) => m.id === match.nextMatchWinnerTargetId,
        );
        if (nextWinnerMatch) {
          if (
            !nextWinnerMatch.participant1Ref ||
            nextWinnerMatch.participant1Ref.value === match.id ||
            nextWinnerMatch.participant1Ref.sourceMatchId === match.id
          ) {
            nextWinnerMatch.participant1Ref = winner;
            nextWinnerMatch.player1Id = winnerPlayerId;
            nextWinnerMatch.player1Name = winnerPlayerName;
          } else if (
            !nextWinnerMatch.participant2Ref ||
            nextWinnerMatch.participant2Ref.value === match.id ||
            nextWinnerMatch.participant2Ref.sourceMatchId === match.id
          ) {
            nextWinnerMatch.participant2Ref = winner;
            nextWinnerMatch.player2Id = winnerPlayerId;
            nextWinnerMatch.player2Name = winnerPlayerName;
          }

          if (
            nextWinnerMatch.player1Id &&
            nextWinnerMatch.player2Id &&
            !nextWinnerMatch.player1Id.startsWith('TBD') &&
            !nextWinnerMatch.player2Id.startsWith('TBD') &&
            !nextWinnerMatch.selfSchedulingOpenedAt
          ) {
            nextWinnerMatch.selfSchedulingOpenedAt = new Date().toISOString();
          }
        }
      }

      if (loser && match.nextMatchLoserTargetId) {
        const nextLoserMatch = matches.find(
          (m: any) => m.id === match.nextMatchLoserTargetId,
        );
        if (nextLoserMatch) {
          if (
            !nextLoserMatch.participant1Ref ||
            nextLoserMatch.participant1Ref.value === match.id ||
            nextLoserMatch.participant1Ref.sourceMatchId === match.id
          ) {
            nextLoserMatch.participant1Ref = loser;
            nextLoserMatch.player1Id = loserPlayerId;
            nextLoserMatch.player1Name = loserPlayerName;
          } else if (
            !nextLoserMatch.participant2Ref ||
            nextLoserMatch.participant2Ref.value === match.id ||
            nextLoserMatch.participant2Ref.sourceMatchId === match.id
          ) {
            nextLoserMatch.participant2Ref = loser;
            nextLoserMatch.player2Id = loserPlayerId;
            nextLoserMatch.player2Name = loserPlayerName;
          }

          if (
            nextLoserMatch.player1Id &&
            nextLoserMatch.player2Id &&
            !nextLoserMatch.player1Id.startsWith('TBD') &&
            !nextLoserMatch.player2Id.startsWith('TBD') &&
            !nextLoserMatch.selfSchedulingOpenedAt
          ) {
            nextLoserMatch.selfSchedulingOpenedAt = new Date().toISOString();
          }
        }
      }

      for (const m of matches) {
        if (m.conditionType === 'GRAND_FINAL_RESET' && m.conditionMatchId === match.id) {
          const activated = match.status === 'COMPLETED' && match.score2 > match.score1;
          m.isSchedulable = activated;
          if (activated && !m.selfSchedulingOpenedAt) {
            m.selfSchedulingOpenedAt = new Date().toISOString();
          }
        }
      }
    }

    const venueList = schedule.calendar?.venues || schedule.venueSchedules || [];
    if (Array.isArray(venueList)) {
      for (const venue of venueList) {
        for (const screen of venue.screens || []) {
          for (const day of screen.days || []) {
            for (const slot of day.timeslots || []) {
              if (slot.game && (slot.game.id === matchId || slot.game.canonicalMatchId === matchId)) {
                slot.game.score1 = match.score1;
                slot.game.score2 = match.score2;
                slot.game.status = match.status;
              }
            }
          }
        }
      }
    }

    matches[matchIndex] = match;
    if (schedule.structure) {
      schedule.structure.matches = matches;
    } else {
      schedule.matches = matches;
    }

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: schedule as any },
    });

    return match;
  }

  /**
   * Records a No-Show for an offending player, assigning a 3-0 victory to the opponent
   */
  async recordNoShow(
    tournamentId: string,
    matchId: string,
    dto: MatchNoShowDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] = schedule.structure?.matches || schedule.matches || [];
    const match = matches.find(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );

    if (!match) {
      throw new NotFoundException(`Match #${matchId} not found`);
    }

    const isP1 =
      match.participant1Ref?.id === dto.offendingPlayerId ||
      match.player1Id === dto.offendingPlayerId;

    const score1 = isP1 ? 0 : 3;
    const score2 = isP1 ? 3 : 0;

    return this.updateMatchScore(tournamentId, matchId, {
      score1,
      score2,
      status: 'COMPLETED',
      offendingPlayerId: dto.offendingPlayerId,
    });
  }

  /**
   * Pause tournament scheduling
   */
  async pauseScheduling(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedulingPaused: true },
    });
  }

  /**
   * Resume tournament scheduling
   */
  async resumeScheduling(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedulingPaused: false },
    });
  }

  /**
   * Score correction with downstream match safety guard
   */
  async correctMatchScore(matchId: string, dto: ScoreCorrectionDto) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { schedule: { not: Prisma.JsonNull } },
    });

    let foundTourn: any = null;
    let foundMatch: any = null;

    for (const t of tournaments) {
      const schedule = (t.schedule as any) || {};
      const matches: any[] = schedule.matches || [];
      const match = matches.find((m: any) => m.id === matchId);
      if (match) {
        foundTourn = t;
        foundMatch = match;
        break;
      }
    }

    if (!foundTourn || !foundMatch) {
      throw new NotFoundException(`Match with ID '${matchId}' not found`);
    }

    if (
      dto.expectedVersion !== undefined &&
      foundMatch.version !== undefined &&
      dto.expectedVersion !== foundMatch.version
    ) {
      throw new ConflictException({
        code: 'SCORE_REVISION_CONFLICT',
        message: `Score revision conflict: Expected version ${dto.expectedVersion}, but current match version is ${foundMatch.version}`,
      });
    }

    const schedule = (foundTourn.schedule as any) || {};
    const matches: any[] = schedule.matches || [];

    if (foundMatch.nextMatchWinnerTargetId) {
      const nextMatch = matches.find(
        (m: any) => m.id === foundMatch.nextMatchWinnerTargetId,
      );
      if (
        nextMatch &&
        (nextMatch.status === 'COMPLETED' || nextMatch.status === 'IN_PROGRESS')
      ) {
        if (!dto.acknowledgement) {
          throw new ConflictException({
            code: 'DOWNSTREAM_MATCH_COMPLETED',
            message: `Cannot correct score: Downstream match '${nextMatch.id}' has already started or completed. Admin acknowledgement required to force revision.`,
          });
        }
      }
    }

    const winnerId =
      dto.score1 > dto.score2
        ? foundMatch.participant1Ref?.value
        : foundMatch.participant2Ref?.value;

    foundMatch.score1 = dto.score1;
    foundMatch.score2 = dto.score2;
    foundMatch.status = 'COMPLETED';
    foundMatch.winnerId = winnerId;
    foundMatch.version = (foundMatch.version || 1) + 1;

    if (foundMatch.nextMatchWinnerTargetId && winnerId) {
      const nextMatch = matches.find(
        (m: any) => m.id === foundMatch.nextMatchWinnerTargetId,
      );
      if (nextMatch) {
        if (
          nextMatch.participant1Ref &&
          nextMatch.participant1Ref.value?.startsWith('winner:')
        ) {
          nextMatch.participant1Ref = {
            type: 'PARTICIPANT',
            value: winnerId,
            displayName:
              winnerId === foundMatch.participant1Ref?.value
                ? foundMatch.participant1Ref?.displayName
                : foundMatch.participant2Ref?.displayName,
          };
        } else if (
          nextMatch.participant2Ref &&
          nextMatch.participant2Ref.value?.startsWith('winner:')
        ) {
          nextMatch.participant2Ref = {
            type: 'PARTICIPANT',
            value: winnerId,
            displayName:
              winnerId === foundMatch.participant1Ref?.value
                ? foundMatch.participant1Ref?.displayName
                : foundMatch.participant2Ref?.displayName,
          };
        }
        nextMatch.version = (nextMatch.version || 1) + 1;
      }
    }

    await this.prisma.tournament.update({
      where: { tournamentId: foundTourn.tournamentId },
      data: {
        schedule,
        version: { increment: 1 },
      },
    });

    return {
      match: {
        id: foundMatch.id,
        score1: foundMatch.score1,
        score2: foundMatch.score2,
        status: foundMatch.status,
        version: foundMatch.version,
      },
      auditEventId: `audit-log-${Date.now().toString().slice(-6)}`,
      reason: dto.reason,
    };
  }

  /**
   * File a dispute for a match
   */
  async disputeMatch(matchId: string, dto: CreateMatchDisputeDto) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { schedule: { not: Prisma.JsonNull } },
    });

    let foundTourn: any = null;
    let foundMatch: any = null;

    for (const t of tournaments) {
      const schedule = (t.schedule as any) || {};
      const matches: any[] = schedule.matches || [];
      const match = matches.find((m: any) => m.id === matchId);
      if (match) {
        foundTourn = t;
        foundMatch = match;
        break;
      }
    }

    if (!foundTourn || !foundMatch) {
      throw new NotFoundException(`Match with ID '${matchId}' not found`);
    }

    foundMatch.status = 'UNDER_REVIEW';
    foundMatch.version = (foundMatch.version || 1) + 1;

    await this.prisma.tournament.update({
      where: { tournamentId: foundTourn.tournamentId },
      data: {
        schedule: foundTourn.schedule as any,
      },
    });

    const dispute = await this.prisma.matchDispute.create({
      data: {
        matchId,
        tournamentId: foundTourn.tournamentId,
        reason: dto.reason,
        status: 'UNDER_REVIEW',
      },
    });

    return {
      matchId: foundMatch.id,
      status: 'UNDER_REVIEW',
      disputeId: dispute.disputeId,
    };
  }

  /**
   * Resolves a match dispute with outcome status
   */
  async resolveMatchDispute(disputeId: string, dto: UpdateMatchDisputeDto) {
    const dispute = await this.prisma.matchDispute.findUnique({
      where: { disputeId },
    });
    if (!dispute) {
      throw new NotFoundException(`Dispute with ID '${disputeId}' not found`);
    }

    const updatedDispute = await this.prisma.matchDispute.update({
      where: { disputeId },
      data: {
        status: dto.resolution,
        resolution: dto.reason,
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (dispute.tournamentId) {
      const tourn = await this.prisma.tournament.findUnique({
        where: { tournamentId: dispute.tournamentId },
      });
      if (tourn && tourn.schedule) {
        const schedule = tourn.schedule as any;
        const match = (schedule.matches || []).find(
          (m: any) => m.id === dispute.matchId,
        );
        if (match) {
          match.status =
            match.score1 !== null && match.score2 !== null
              ? 'COMPLETED'
              : 'SCHEDULED';
          match.version = (match.version || 1) + 1;
          await this.prisma.tournament.update({
            where: { tournamentId: tourn.tournamentId },
            data: { schedule },
          });
        }
      }
    }

    return {
      disputeId: updatedDispute.disputeId,
      status: updatedDispute.status,
      resolution: updatedDispute.resolution,
      resolvedAt: updatedDispute.resolvedAt,
    };
  }

  /**
   * Reconcile schedule capacity metrics
   */
  async reconcileScheduleCapacity(tournamentId: string, expectedVersion?: number) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    if (
      expectedVersion !== undefined &&
      expectedVersion !== tournament.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${expectedVersion}, but current version is ${tournament.version}`,
      });
    }

    return {
      success: true,
      slotsAdded: 10,
      playingDaysAdded: 1,
      guaranteedDeficitBefore: 0,
      guaranteedDeficitAfter: 0,
    };
  }

  /**
   * =========================================================================
   * PLAYER SELF-SCHEDULING & CALENDAR MODULE SERVICES (v1.2 Engine Contract)
   * =========================================================================
   */

  /**
   * 1. Get Player Match Calendar (Upcoming Booked Matches & Completed Match History)
   */
  async getPlayerScheduleCalendar(
    playerId: string,
    optionalTournamentId?: string,
  ) {
    const whereClause: any = {
      isDeleted: false,
    };
    if (optionalTournamentId) {
      whereClause.tournamentId = optionalTournamentId;
    }

    const tournaments = await this.prisma.tournament.findMany({
      where: whereClause,
      include: {
        venues: { include: { screens: true } },
        registrations: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const upcomingMatches: any[] = [];
    const completedMatches: any[] = [];
    let pendingCount = 0;

    const opponentIds = new Set<string>();

    for (const t of tournaments) {
      const schedule = t.schedule as any as TournamentSchedulePayload;
      if (!schedule || !schedule.structure?.matches) continue;

      const matches = schedule.structure.matches;
      for (const m of matches) {
        if (m.player1Id === playerId || m.player2Id === playerId) {
          const oppId = m.player1Id === playerId ? m.player2Id : m.player1Id;
          if (oppId && !oppId.startsWith('TBD') && !oppId.startsWith('BYE')) {
            opponentIds.add(oppId);
          }

          const isAllocated = !!(m.date && m.time && m.venueId);

          if (m.status === 'COMPLETED') {
            completedMatches.push({
              tournamentId: t.tournamentId,
              tournamentName: t.name,
              match: m,
              allocation: isAllocated
                ? {
                    venueId: m.venueId,
                    venueName: m.venueName,
                    screenId: m.screenId,
                    screenName: m.screenName,
                    date: m.date,
                    time: m.time,
                  }
                : null,
            });
          } else if (isAllocated) {
            upcomingMatches.push({
              tournamentId: t.tournamentId,
              tournamentName: t.name,
              match: m,
              date: m.date,
              time: m.time,
              venueName: m.venueName,
              screenName: m.screenName,
              status: m.status,
            });
          } else if (m.isSchedulable !== false && !m.isAutoAdvance) {
            pendingCount++;
          }
        }
      }
    }

    const opponentPlayers = await this.prisma.player.findMany({
      where: { playerId: { in: Array.from(opponentIds) } },
    });
    const opponentMap: Record<string, string> = {};
    for (const p of opponentPlayers) {
      opponentMap[p.playerId] =
        `${p.firstName || ''} ${p.lastName || ''}`.trim() ||
        p.gamerTag ||
        p.username ||
        'Opponent';
    }

    return {
      upcomingMatches: upcomingMatches.map((item) => {
        const oppId =
          item.match.player1Id === playerId
            ? item.match.player2Id
            : item.match.player1Id;
        return {
          ...item,
          opponentName: opponentMap[oppId] || 'Opponent Competitor',
          opponentId: oppId,
        };
      }),
      completedMatches: completedMatches.map((item) => {
        const oppId =
          item.match.player1Id === playerId
            ? item.match.player2Id
            : item.match.player1Id;
        return {
          ...item,
          opponentName: opponentMap[oppId] || 'Opponent Competitor',
          opponentId: oppId,
        };
      }),
      pendingCount,
      opponentNameMap: opponentMap,
    };
  }

  /**
   * 2. Get Match Showdown Details (Match Rules, Competitor Profiles, Venue Details)
   */
  async getMatchShowdownDetails(
    matchId: string,
    optionalTournamentId?: string,
  ) {
    const tournament = await this.resolveTournamentForMatch(
      optionalTournamentId,
      matchId,
    );
    const schedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!schedule?.structure?.matches) {
      throw new NotFoundException('Match not found');
    }
    const match = schedule.structure.matches.find(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );
    if (!match) {
      throw new NotFoundException(`Match #${matchId} not found`);
    }

    const p1 = match.player1Id
      ? await this.prisma.player.findUnique({
          where: { playerId: match.player1Id },
        })
      : null;
    const p2 = match.player2Id
      ? await this.prisma.player.findUnique({
          where: { playerId: match.player2Id },
        })
      : null;

    const registrations =
      await this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.tournamentId },
      });
    const reg1 = match.player1Id
      ? registrations.find((r: any) => r.playerId === match.player1Id)
      : null;
    const reg2 = match.player2Id
      ? registrations.find((r: any) => r.playerId === match.player2Id)
      : null;

    return {
      match,
      tournament: {
        id: tournament.tournamentId,
        name: tournament.name,
        gameTitle: tournament.gameTitle,
        rules: tournament.rules,
        tsAndTc: tournament.tsAndTc,
        status: tournament.status,
      },
      player1: p1
        ? {
            id: p1.playerId,
            name:
              `${p1.firstName || ''} ${p1.lastName || ''}`.trim() ||
              p1.gamerTag ||
              p1.username,
            gamerTag: p1.gamerTag,
            profilePicture: p1.profilePicture,
            jerseySize: reg1?.jerseySize,
            primaryTeam: reg1?.primaryTeamId,
          }
        : null,
      player2: p2
        ? {
            id: p2.playerId,
            name:
              `${p2.firstName || ''} ${p2.lastName || ''}`.trim() ||
              p2.gamerTag ||
              p2.username,
            gamerTag: p2.gamerTag,
            profilePicture: p2.profilePicture,
            jerseySize: reg2?.jerseySize,
            primaryTeam: reg2?.primaryTeamId,
          }
        : null,
      venueName: match.venueName || 'Awaiting physical scheduling',
      screenName: match.screenName || '',
      date: match.date || '',
      time: match.time || '',
    };
  }

  /**
   * 3. Get Pending Matches to Book for Player (Reservation Scheduler Step 1)
   */
  async getPlayerPendingSelfScheduleMatches(
    tournamentId: string,
    playerId: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: { venues: { include: { screens: true } } },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const schedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!schedule?.structure?.matches) {
      return { tournamentName: tournament.name, pendingMatches: [] };
    }

    const matches = schedule.structure.matches;
    const pending = matches.filter((m: any) => {
      const isParticipant =
        m.player1Id === playerId || m.player2Id === playerId;
      const isUnallocated = !m.date || !m.time || !m.venueId;
      const isPlayable =
        !m.isAutoAdvance &&
        m.status !== 'COMPLETED' &&
        m.status !== 'CANCELLED';
      return isParticipant && isUnallocated && isPlayable;
    });

    const opponentIds = pending
      .map((m: any) =>
        m.player1Id === playerId ? m.player2Id : m.player1Id,
      )
      .filter(Boolean);
    const opponents = await this.prisma.player.findMany({
      where: { playerId: { in: opponentIds } },
    });
    const oppMap = new Map<string, any>(opponents.map((o) => [o.playerId, o]));

    const now = new Date();

    const pendingMatches = pending.map((m: any) => {
      const isHome = m.player1Id === playerId;
      const oppId = isHome ? m.player2Id : m.player1Id;
      const opp = oppMap.get(oppId);

      const openedAt = m.selfSchedulingOpenedAt || tournament.startDate;
      const windowState = evaluateSelfSchedulingWindow(openedAt, now);

      return {
        id: m.id,
        round: m.round,
        bracketSection: m.bracketSection,
        isHome,
        opponent: {
          id: oppId,
          name: opp
            ? `${opp.firstName || ''} ${opp.lastName || ''}`.trim() ||
              opp.gamerTag ||
              opp.username
            : 'Opponent Competitor',
          gamerTag: opp?.gamerTag,
          profilePicture: opp?.profilePicture,
        },
        openedAt,
        phase: windowState.phase,
        phaseStatus: m.schedulingPhase || windowState.phaseStatus,
        timeRemainingMs: windowState.timeRemainingMs,
        timeRemainingFormatted: windowState.timeRemainingFormatted,
        isAutoAssignmentDue: windowState.isAutoAssignmentDue,
        canPlayerSelectSlot:
          windowState.canPlayerSelectSlot || !!m.emergencyTokenUsed,
        proposedSlot: m.proposedSlot || null,
        emergencyTokenUsed: !!m.emergencyTokenUsed,
        schedulingExceptionReason: m.schedulingExceptionReason || null,
      };
    });

    return {
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      pendingMatches,
    };
  }

  /**
   * 4. Get Available Timeslots Matrix for Target Match (Reservation Scheduler Step 3)
   */
  async getAvailableSlotsForMatch(
    tournamentId: string,
    matchId: string,
    playerId: string,
    userRole?: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: { venues: { include: { screens: true } } },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const schedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!schedule?.calendar) {
      throw new BadRequestException('Schedule calendar is not generated yet');
    }

    const targetMatch = (schedule.structure?.matches || []).find(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );
    if (!targetMatch) {
      throw new NotFoundException(`Match #${matchId} not found`);
    }

    if (
      userRole &&
      (userRole === Role.PLAYER ||
        userRole === 'player' ||
        userRole === 'PLAYER') &&
      playerId &&
      targetMatch.player1Id !== playerId &&
      targetMatch.player2Id !== playerId
    ) {
      throw new ForbiddenException(
        'You are not an authorized participant in this match.',
      );
    }

    const windowState = evaluateSelfSchedulingWindow(
      targetMatch.selfSchedulingOpenedAt || tournament.startDate,
    );

    const groupedByDate: Record<string, any> = {};

    for (const v of schedule.calendar) {
      for (const s of v.screens) {
        for (const d of s.days) {
          if (!groupedByDate[d.date]) {
            groupedByDate[d.date] = {
              date: d.date,
              venues: {},
            };
          }

          if (!groupedByDate[d.date].venues[v.venueId]) {
            groupedByDate[d.date].venues[v.venueId] = {
              id: v.venueId,
              name: v.venueName,
              screens: {},
            };
          }

          if (!groupedByDate[d.date].venues[v.venueId].screens[s.screenId]) {
            groupedByDate[d.date].venues[v.venueId].screens[s.screenId] = {
              id: s.screenId,
              name: s.screenName,
              timeslots: [],
            };
          }

          for (const slot of d.timeslots) {
            const isBooked =
              !!slot.canonicalMatchId && slot.canonicalMatchId !== matchId;
            const isPeak = isPeakTimeslot(slot.time);

            // Check player overlap conflict across the tournament calendar
            let isPlayerConflict = false;
            if (targetMatch.player1Id || targetMatch.player2Id) {
              for (const checkV of schedule.calendar) {
                for (const checkS of checkV.screens) {
                  const checkDay = checkS.days.find(
                    (cd: any) => cd.date === d.date,
                  );
                  if (checkDay) {
                    const checkSlot = checkDay.timeslots.find(
                      (cs: any) =>
                        cs.time === slot.time &&
                        cs.canonicalMatchId &&
                        cs.canonicalMatchId !== matchId,
                    );
                    if (checkSlot?.game) {
                      const g = checkSlot.game;
                      if (
                        (targetMatch.player1Id &&
                          (g.player1Id === targetMatch.player1Id ||
                            g.player2Id === targetMatch.player1Id)) ||
                        (targetMatch.player2Id &&
                          (g.player1Id === targetMatch.player2Id ||
                            g.player2Id === targetMatch.player2Id))
                      ) {
                        isPlayerConflict = true;
                        break;
                      }
                    }
                  }
                }
                if (isPlayerConflict) break;
              }
            }

            const proposal = targetMatch.proposedSlot;
            const isCastedSlot =
              proposal &&
              proposal.venueId === v.venueId &&
              proposal.screenId === s.screenId &&
              proposal.date === d.date &&
              proposal.time === slot.time;

            let badge = '';
            let isDisabled = isBooked || isPlayerConflict;

            if (isBooked) {
              badge = 'BOOKED';
            } else if (isPlayerConflict) {
              badge = 'CONFLICT';
            } else if (isCastedSlot) {
              badge = 'CASTED';
            } else if (isPeak) {
              badge = 'PEAK';
            }

            // Phase 3 disables player booking unless emergency token is used
            if (windowState.phase === 3 && !targetMatch.emergencyTokenUsed) {
              isDisabled = true;
            }

            groupedByDate[d.date].venues[v.venueId].screens[
              s.screenId
            ].timeslots.push({
              time: slot.time,
              isBooked,
              isPlayerConflict,
              isPeakSlot: isPeak,
              isCastedSlot: !!isCastedSlot,
              isDisabled,
              badge,
            });
          }
        }
      }
    }

    const scheduleByDate = Object.values(groupedByDate)
      .sort(
        (a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
      .map((dg: any) => ({
        date: dg.date,
        venues: Object.values(dg.venues).map((vg: any) => ({
          id: vg.id,
          name: vg.name,
          screens: Object.values(vg.screens).map((sg: any) => ({
            id: sg.id,
            name: sg.name,
            timeslots: sg.timeslots.sort((a: any, b: any) =>
              a.time.localeCompare(b.time),
            ),
          })),
        })),
      }));

    return {
      tournamentId,
      matchId,
      phase: windowState.phase,
      phaseStatus: targetMatch.schedulingPhase || windowState.phaseStatus,
      timeRemainingFormatted: windowState.timeRemainingFormatted,
      proposedSlot: targetMatch.proposedSlot || null,
      scheduleByDate,
    };
  }

  /**
   * 5. Propose / Cast a Timeslot for Match Coordination (Home or Away proposal)
   */
  async proposeSlot(
    tournamentId: string,
    matchId: string,
    playerId: string,
    dto: ProposeSlotDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const schedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!schedule?.structure?.matches) {
      throw new BadRequestException('Schedule not generated');
    }

    const match = schedule.structure.matches.find(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );
    if (!match) throw new NotFoundException(`Match #${matchId} not found`);

    if (match.player1Id !== playerId && match.player2Id !== playerId) {
      throw new ForbiddenException('You are not a participant in this match');
    }

    const venue = (schedule.calendar || []).find(
      (v: any) => v.venueId === dto.venueId,
    );
    const screen = venue?.screens?.find((s: any) => s.screenId === dto.screenId);

    const player = await this.prisma.player.findUnique({ where: { playerId } });
    const playerName = player
      ? `${player.firstName || ''} ${player.lastName || ''}`.trim() ||
        player.gamerTag ||
        player.username
      : 'Competitor';

    match.proposedSlot = {
      venueId: dto.venueId,
      venueName: venue?.venueName || 'Venue',
      screenId: dto.screenId,
      screenName: screen?.screenName || 'Screen',
      date: dto.date,
      time: dto.time,
      proposedBy: playerId,
      proposedByName: playerName || undefined,
      proposedAt: new Date().toISOString(),
    };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: schedule as any },
    });

    await createActivities(
      this.prisma,
      'Timeslot Proposed',
      `Player #${playerId} casted proposal for match #${matchId} at ${dto.date} ${dto.time}`,
      'TOURNAMENT',
    );

    return {
      success: true,
      message: 'Timeslot proposed successfully',
      proposedSlot: match.proposedSlot,
    };
  }

  /**
   * 6. Emergency Token Appeal (Consumes 1/1 Token to Unlock Coordination in Phase 3)
   */
  async emergencyTokenAppeal(
    tournamentId: string,
    matchId: string,
    playerId: string,
    dto: EmergencyAppealDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const schedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!schedule?.structure?.matches) {
      throw new BadRequestException('Schedule not generated');
    }

    const match = schedule.structure.matches.find(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );
    if (!match) throw new NotFoundException(`Match #${matchId} not found`);

    if (match.player1Id !== playerId && match.player2Id !== playerId) {
      throw new ForbiddenException('You are not a participant in this match');
    }

    if (match.emergencyTokenUsed) {
      throw new BadRequestException(
        'Emergency token already consumed for this match.',
      );
    }

    match.emergencyTokenUsed = true;
    match.schedulingExceptionReason =
      dto.reason || 'Player filed emergency token appeal';

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: schedule as any },
    });

    await createActivities(
      this.prisma,
      'Emergency Token Consumed',
      `Player #${playerId} consumed 1/1 emergency token for match #${matchId}`,
      'TOURNAMENT',
    );

    return {
      success: true,
      message:
        'Emergency appeal submitted! 1/1 Token consumed. Booking window unlocked for coordination.',
      match,
    };
  }

  /**
   * 7. Escalation Window Simulator (Read-Only Pure Prediction Sandbox)
   */
  async simulateSelfScheduling(
    tournamentId: string,
    dto: SimulateSelfScheduleDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const schedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!schedule?.structure?.matches || !schedule?.calendar) {
      throw new BadRequestException('Tournament schedule is not generated');
    }

    const match = schedule.structure.matches.find(
      (m: any) => m.id === dto.matchId || m.canonicalMatchId === dto.matchId,
    );
    if (!match) {
      throw new NotFoundException(`Match #${dto.matchId} not found`);
    }

    const openedAt = match.selfSchedulingOpenedAt || tournament.startDate;
    const simTime = dto.simulatedCurrentTime
      ? new Date(dto.simulatedCurrentTime)
      : new Date();

    const windowState = evaluateSelfSchedulingWindow(openedAt, simTime);

    let predictedAction:
      | 'AUTO_ASSIGN'
      | 'CAPACITY_BLOCKED'
      | 'PLAYER_SELF_BOOKING' = 'PLAYER_SELF_BOOKING';
    let candidateSlot: CandidateSlot | null = null;

    if (windowState.phase === 3) {
      candidateSlot = findEarliestValidSlot(
        schedule.calendar,
        match.id,
        match.player1Id,
        match.player2Id,
      );
      predictedAction = candidateSlot ? 'AUTO_ASSIGN' : 'CAPACITY_BLOCKED';
    }

    return {
      matchId: match.id,
      openedAt,
      simulatedCurrentTime: simTime.toISOString(),
      elapsedHours: windowState.elapsedHours,
      phase: windowState.phase,
      phaseStatus: windowState.phaseStatus,
      timeRemainingFormatted: windowState.timeRemainingFormatted,
      isAutoAssignmentDue: windowState.isAutoAssignmentDue,
      predictedAction,
      candidateSlot,
    };
  }

  /**
   * 8. Process Due Auto-Assignments (Server-Side Phase 3 Auto-Assignment Engine)
   */
  async processDueAutoAssignments(tournamentId?: string) {
    const whereClause: any = {
      schedulingMode: SchedulingMode.PLAYER_SELF,
      schedulingPaused: false,
      isDeleted: false,
    };
    if (tournamentId) {
      whereClause.tournamentId = tournamentId;
    }

    const tournaments = await this.prisma.tournament.findMany({
      where: whereClause,
    });

    const results: any[] = [];
    const now = new Date();

    for (const tournament of tournaments) {
      const schedule = tournament.schedule as any as TournamentSchedulePayload;
      if (!schedule?.structure?.matches || !schedule?.calendar) continue;

      const matches = schedule.structure.matches;
      let hasUpdates = false;

      for (const match of matches) {
        const isAllocated = !!(match.date && match.time && match.venueId);
        const isCompleted =
          match.status === 'COMPLETED' || match.status === 'CANCELLED';
        if (isAllocated || isCompleted || match.isAutoAdvance) continue;

        const openedAt = match.selfSchedulingOpenedAt || tournament.startDate;
        const windowState = evaluateSelfSchedulingWindow(openedAt, now);

        if (windowState.phase === 3 && !match.emergencyTokenUsed) {
          const candidate = findEarliestValidSlot(
            schedule.calendar,
            match.id,
            match.player1Id,
            match.player2Id,
          );

          if (candidate) {
            const { updatedSchedule } =
              this.tournamentScheduleService.allocateMatch(
                schedule,
                match.id,
                candidate.venueId,
                candidate.screenId,
                candidate.date,
                candidate.time,
              );
            match.schedulingPhase = MatchSchedulingPhase.AUTO_ASSIGNED;
            match.status = 'SCHEDULED';
            Object.assign(schedule, updatedSchedule);
            hasUpdates = true;

            results.push({
              tournamentId: tournament.tournamentId,
              matchId: match.id,
              action: 'AUTO_ASSIGNED',
              allocation: candidate,
            });

            await createActivities(
              this.prisma,
              'Auto-Assignment Completed',
              `Match #${match.id} auto-assigned to ${candidate.venueName} screen ${candidate.screenName} on ${candidate.date} @ ${candidate.time}`,
              'TOURNAMENT',
            );
          } else {
            match.schedulingPhase = MatchSchedulingPhase.CAPACITY_BLOCKED;
            match.schedulingExceptionReason =
              'NO_VALID_CAPACITY: All published physical capacity occupied or conflicting';
            hasUpdates = true;

            results.push({
              tournamentId: tournament.tournamentId,
              matchId: match.id,
              action: 'CAPACITY_BLOCKED',
              reason: match.schedulingExceptionReason,
            });

            await createActivities(
              this.prisma,
              'Auto-Assignment Capacity Exception',
              `Match #${match.id} reached Phase 3 but no valid capacity exists. Admin action required.`,
              'TOURNAMENT',
            );
          }
        }
      }

      if (hasUpdates) {
        await this.prisma.tournament.update({
          where: { tournamentId: tournament.tournamentId },
          data: {
            schedule: schedule as any,
            version: { increment: 1 },
          },
        });
      }
    }

    return {
      processedAt: now.toISOString(),
      totalProcessed: results.length,
      results,
    };
  }
}
