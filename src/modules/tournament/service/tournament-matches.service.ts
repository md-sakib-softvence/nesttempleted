import { randomUUID } from 'node:crypto';
import {
  capacitySummary,
  ensureCapacity,
  reconcileQualification,
  refreshParticipants,
  resolveReference,
  applyQualificationDraw,
  reconcileCalendarSettings,
  allocatePending,
} from '../utils/competition-runtime.util';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
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
  getEligibleSlotsForMatch,
  isPeakTimeslot,
} from '../utils/self-schedule.util';
import { SchedulingMode, Prisma, Role } from '@prisma/client';
import { presignTournamentMedia } from '../utils/tournament-media.util';
import { createActivities } from '../../utils/activity.util';
import { MatchIncidentService } from './match-incident.service';

@Injectable()
export class TournamentMatchesService {
  private readonly logger = new Logger(TournamentMatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentScheduleService: TournamentScheduleService,
    @Optional() private readonly incidents?: MatchIncidentService,
  ) {}

  /**
   * Generates calendar grid and matches allocation for a tournament
   */
  async generateCalendarForTournament(
    id: string,
    dto?: GenerateCalendarDto,
    modeOverride?: SchedulingMode,
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

    const tournamentVenues = tournament.venues || [];

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
    const structure = existingSchedule.structure;

    if (!structure?.matches)
      throw new BadRequestException(
        'Create a canonical competition before generating its calendar',
      );
    const schedulePayload = JSON.parse(
      JSON.stringify(existingSchedule),
    ) as TournamentSchedulePayload;
    const config = {
      ...tournament,
      ...(modeOverride ? { schedulingMode: modeOverride } : {}),
      dailyStart,
      dailyEnd,
      matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
      buffer,
      frequencyStatus,
      frequencyArray,
    };
    reconcileCalendarSettings(schedulePayload, config);
    const saved = await this.prisma.tournament.updateMany({
      where: { tournamentId: id, version: tournament.version },
      data: {
        dailyStart,
        dailyEnd,
        matchDuration,
        turnoverDuration,
        lunchBreakTime,
        lunchDuration,
        buffer,
        frequencyStatus,
        frequencyArray,
        ...(modeOverride ? { schedulingMode: modeOverride } : {}),
        schedule: schedulePayload as any,
        version: { increment: 1 },
      },
    });
    if (saved.count !== 1)
      throw new ConflictException('Schedule changed while generating calendar');
    const updated = {
      ...tournament,
      ...config,
      schedule: schedulePayload,
      version: tournament.version + 1,
    };

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

    if (
      dto.expectedScheduleVersion !== undefined &&
      dto.expectedScheduleVersion !== tournament.version
    )
      throw new ConflictException('VERSION_CONFLICT');
    const target = currentSchedule.structure.matches.find(
      (m) => m.id === matchId,
    );
    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== (target?.version || 1)
    )
      throw new ConflictException('MATCH_VERSION_CONFLICT');
    Object.assign(currentSchedule.capacity, {
      matchDuration: tournament.matchDuration,
    });
    refreshParticipants(currentSchedule);
    const { updatedSchedule, match, allocation } =
      this.tournamentScheduleService.allocateMatch(
        currentSchedule,
        matchId,
        dto.venueId,
        dto.screenId,
        dto.date,
        dto.time,
      );

    const saved = await this.prisma.tournament.updateMany({
      where: {
        tournamentId: tournament.tournamentId,
        version: tournament.version,
      },
      data: { schedule: updatedSchedule as any, version: { increment: 1 } },
    });
    if (saved.count !== 1)
      throw new ConflictException(
        'The slot or match changed during allocation',
      );

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

    const current = currentSchedule.structure.matches.find(
      (m) => m.id === matchId,
    );
    if (
      current &&
      ['IN_PROGRESS', 'COMPLETED', 'UNDER_REVIEW'].includes(current.status)
    )
      throw new ConflictException(
        'Live or completed allocations cannot be removed',
      );
    const { updatedSchedule, match } =
      this.tournamentScheduleService.unallocateMatch(currentSchedule, matchId);

    const saved = await this.prisma.tournament.updateMany({
      where: {
        tournamentId: tournament.tournamentId,
        version: tournament.version,
      },
      data: { schedule: updatedSchedule as any, version: { increment: 1 } },
    });
    if (saved.count !== 1)
      throw new ConflictException('Schedule changed during allocation removal');

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

    if (
      dto.expectedScheduleVersion !== undefined &&
      dto.expectedScheduleVersion !== tournament.version
    )
      throw new ConflictException('VERSION_CONFLICT');
    const isPlayer =
      currentUser.role === Role.PLAYER ||
      currentUser.role === 'PLAYER' ||
      currentUser.role === 'player';

    // 1. If requester is a player, enforce PLAYER_SELF scheduling rules
    if (isPlayer) {
      if (tournament.schedulingMode !== SchedulingMode.PLAYER_SELF) {
        throw new BadRequestException(
          'Player Schedule is not enabled for this tournament.',
        );
      }

      const isWindowOpen =
        (tournament as any).schedulingWindowOpen ??
        !tournament.schedulingPaused;

      if (!isWindowOpen) {
        throw new BadRequestException(
          'Player Schedule is currently paused for this tournament.',
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
      targetMatch.status === 'CANCELLED' ||
      targetMatch.status === 'UNDER_REVIEW' ||
      targetMatch.isSchedulable === false ||
      targetMatch.isAutoAdvance ||
      (targetMatch.conditional && targetMatch.isSchedulable !== true)
    ) {
      throw new BadRequestException(
        `Cannot reschedule a match that is ${targetMatch.status.toLowerCase()}.`,
      );
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== (targetMatch.version || 1)
    )
      throw new ConflictException('MATCH_VERSION_CONFLICT');
    Object.assign(currentSchedule.capacity, {
      matchDuration: tournament.matchDuration,
    });
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

      // 2a. Ensure both competitors are resolved
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

      // 2b. Check self-scheduling window open
      if (!targetMatch.selfSchedulingOpenedAt) {
        throw new BadRequestException(
          'Player Schedule has not opened for this match yet.',
        );
      }

      // 2c. Players may choose a slot only during the first 24 hours.
      const windowState = evaluateSelfSchedulingWindow(
        targetMatch.selfSchedulingOpenedAt,
      );
      if (windowState.phase === 3) {
        throw new ForbiddenException(
          'The 24-hour player scheduling window has expired. This match is closed for player booking and queued for system auto-assignment.',
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
            'Player Schedule is closed for this matchday.',
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
      match.bookedBy = currentUser.userId;
      match.bookedAt = new Date().toISOString();
    }

    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.tournament.updateMany({
        where: {
          tournamentId: tournament.tournamentId,
          version: tournament.version,
        },
        data: {
          schedule: updatedSchedule as any,
          version: { increment: 1 },
        },
      });
      if (saved.count !== 1) {
        throw new ConflictException(
          'The tournament schedule changed while you were booking. Refresh the available slots and try again.',
        );
      }

      // ActivityLog.role is a Role enum (PLAYER, ADMIN, etc.), not a free-form
      // category. Passing "TOURNAMENT" made Prisma throw after the booking had
      // already been saved, so the client saw a 400 even though the match was
      // allocated. Keep the booking and its audit record atomic and use the
      // authenticated actor's valid role.
      await createActivities(
        tx as any,
        'Match Fixture Booked',
        `Match #${matchId} booked by ${currentUser.role || Role.PLAYER} #${currentUser.userId} on ${dto.date} at ${dto.time}`,
        currentUser.role || Role.PLAYER,
      );
    });

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
        registrations: {
          where: { status: 'CONFIRMED' },
          select: { playerId: true, homeVenueId: true },
        },
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
      .map((s) => ({
        playerId: s.participantId!,
        name: s.participantName || `Player ${s.slotNumber}`,
        homeVenueId:
          tournament.registrations?.find(
            (registration) => registration.playerId === s.participantId,
          )?.homeVenueId ?? undefined,
      }));

    if (!['AUTO_RANDOM', 'AUTO_HOME_VENUE'].includes(mode))
      throw new BadRequestException('Select an automatic allocation mode');
    if (
      dto?.expectedVersion !== undefined &&
      dto.expectedVersion !== tournament.version
    )
      throw new ConflictException('VERSION_CONFLICT');
    refreshParticipants(currentSchedule);
    const outcome = allocatePending(currentSchedule, mode, participants);
    const saved = await this.prisma.tournament.updateMany({
      where: { tournamentId, version: tournament.version },
      data: {
        schedule: outcome.schedule as any,
        schedulingMode: mode,
        version: { increment: 1 },
      },
    });
    if (saved.count !== 1)
      throw new ConflictException(
        'Schedule changed during automatic allocation',
      );
    return {
      mode,
      matches: outcome.schedule.structure.matches,
      calendar: outcome.schedule.calendar,
      allocated: outcome.allocated,
      pending: outcome.pending,
      version: tournament.version + 1,
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
      page?: number | string;
      limit?: number | string;
    },
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    let matches: any[] =
      schedule?.structure?.matches || schedule?.matches || [];
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
          const hasAlloc = Boolean(
            m.physicalAllocation ||
            m.allocatedSlot ||
            (m.venueId && m.screenId && m.date && m.time),
          );
          return wantAllocated ? hasAlloc : !hasAlloc;
        });
      }
    }

    const totalMatches = matches.length;
    let paginatedMatches = matches;
    let meta: any = undefined;

    if (filter?.page !== undefined || filter?.limit !== undefined) {
      const page = Math.max(1, Number(filter?.page) || 1);
      const limit = Math.max(1, Number(filter?.limit) || 50);
      const skip = (page - 1) * limit;
      paginatedMatches = matches.slice(skip, skip + limit);
      meta = {
        total: totalMatches,
        page,
        limit,
        totalPages: Math.ceil(totalMatches / limit),
      };
    }

    return {
      tournamentId: id,
      summary,
      qualificationResolution:
        schedule?.structure?.qualificationResolution ?? null,
      version: tournament.version,
      matches: paginatedMatches.map((m) => ({ ...m, version: m.version || 1 })),
      pagination: meta,
      meta,
    };
  }

  async verifyTournamentMatchCheckIn(
    tournamentId: string,
    matchId: string,
    qrToken: string,
    expectedPlayerId: string | undefined,
    actor: { userId: string; role: string },
  ) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { tournamentId, isDeleted: false },
      select: { tournamentId: true, schedule: true, entryFee: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const matches: any[] =
      (tournament.schedule as any)?.structure?.matches ||
      (tournament.schedule as any)?.matches ||
      [];
    const match = matches.find(
      (item) => item.id === matchId || item.canonicalMatchId === matchId,
    );
    if (!match)
      throw new NotFoundException('Match not found in this tournament');
    await this.assertMatchOperator(tournamentId, matchId, actor);

    const registration = await this.resolveRegisteredPlayerFromQr(
      tournamentId,
      qrToken,
      tournament.entryFee <= 0,
    );
    const playerId = registration.playerId;
    if (playerId !== match.player1Id && playerId !== match.player2Id) {
      throw new BadRequestException(
        'This player is not a participant in the selected match',
      );
    }
    if (expectedPlayerId && playerId !== expectedPlayerId) {
      throw new BadRequestException(
        'Scanned pass does not match the selected player',
      );
    }
    if (
      ['COMPLETED', 'CANCELLED', 'UNDER_REVIEW', 'NO_SHOW'].includes(
        match.status,
      )
    ) {
      throw new ConflictException(
        `This match cannot accept check-ins while ${String(match.status).replaceAll('_', ' ').toLowerCase()}`,
      );
    }

    const checkIns: any[] = Array.isArray(match.checkIns) ? match.checkIns : [];
    const existingCheckIn = checkIns.find((item) => item.playerId === playerId);
    return {
      tournamentId,
      matchId: match.id,
      player: {
        playerId,
        name:
          `${registration.player.firstName} ${registration.player.lastName}`.trim() ||
          registration.player.gamerTag ||
          registration.player.username ||
          'Player',
        gamerTag:
          registration.player.gamerTag || registration.player.username || null,
      },
      matchStatus: match.status || 'SCHEDULED',
      alreadyCheckedIn: Boolean(existingCheckIn),
      checkedInAt: existingCheckIn?.checkedInAt || null,
      confirmedParticipant: true,
    };
  }

  async checkInTournamentMatch(
    tournamentId: string,
    matchId: string,
    qrToken: string,
    expectedPlayerId: string | undefined,
    actor: { userId: string; role: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findFirst({
        where: { tournamentId, isDeleted: false },
        select: {
          tournamentId: true,
          schedule: true,
          version: true,
          entryFee: true,
        },
      });
      if (!tournament) throw new NotFoundException('Tournament not found');

      const schedule: any = tournament.schedule || {};
      const matches: any[] =
        schedule.structure?.matches || schedule.matches || [];
      const matchIndex = matches.findIndex(
        (item) => item.id === matchId || item.canonicalMatchId === matchId,
      );
      if (matchIndex < 0)
        throw new NotFoundException('Match not found in this tournament');
      await this.assertMatchOperator(tournamentId, matchId, actor, tx);

      const registration = await this.resolveRegisteredPlayerFromQr(
        tournamentId,
        qrToken,
        tournament.entryFee <= 0,
        tx,
      );
      const match = matches[matchIndex];
      const playerId = registration.playerId;
      if (playerId !== match.player1Id && playerId !== match.player2Id) {
        throw new BadRequestException(
          'This player is not a participant in the selected match',
        );
      }
      if (expectedPlayerId && playerId !== expectedPlayerId) {
        throw new BadRequestException(
          'Scanned pass does not match the selected player',
        );
      }
      if (
        ['COMPLETED', 'CANCELLED', 'UNDER_REVIEW', 'NO_SHOW'].includes(
          match.status,
        )
      ) {
        throw new ConflictException(
          `This match cannot accept check-ins while ${String(match.status).replaceAll('_', ' ').toLowerCase()}`,
        );
      }

      const checkIns: any[] = Array.isArray(match.checkIns)
        ? match.checkIns
        : [];
      const alreadyCheckedIn = checkIns.some(
        (item) => item.playerId === playerId,
      );
      const checkedInAt = alreadyCheckedIn
        ? checkIns.find((item) => item.playerId === playerId).checkedInAt
        : new Date().toISOString();
      if (!alreadyCheckedIn) {
        checkIns.push({ playerId, checkedInAt, checkedInByRole: actor.role });
      }

      const player1CheckedIn = checkIns.some(
        (item) => item.playerId === match.player1Id,
      );
      const player2CheckedIn = checkIns.some(
        (item) => item.playerId === match.player2Id,
      );
      match.checkIns = checkIns;
      if (player1CheckedIn && player2CheckedIn) {
        match.status = match.resumeRequired ? 'PLAYERS_READY' : 'IN_PROGRESS';
      }
      matches[matchIndex] = match;
      if (schedule.structure) schedule.structure.matches = matches;
      if (Array.isArray(schedule.matches) || !schedule.structure)
        schedule.matches = matches;
      this.syncMatchIntoCalendar(schedule, match);

      const persisted = await tx.tournament.updateMany({
        where: { tournamentId, version: tournament.version },
        data: { schedule, version: { increment: 1 } },
      });
      if (persisted.count !== 1) {
        throw new ConflictException(
          'The tournament schedule changed while checking in. Refresh and scan the pass again.',
        );
      }

      const checkedInCount =
        Number(player1CheckedIn) + Number(player2CheckedIn);
      return {
        tournamentId,
        matchId: match.id,
        player: {
          playerId,
          name:
            `${registration.player.firstName} ${registration.player.lastName}`.trim() ||
            registration.player.gamerTag ||
            registration.player.username ||
            'Player',
          gamerTag:
            registration.player.gamerTag ||
            registration.player.username ||
            null,
        },
        alreadyCheckedIn,
        checkedInAt,
        checkedInCount,
        playersRequired: 2,
        allPlayersCheckedIn: checkedInCount === 2,
        matchStarted: match.status === 'IN_PROGRESS',
        matchStatus: match.status || 'SCHEDULED',
      };
    });
  }

  async submitAssignedMatchScore(
    tournamentId: string,
    matchId: string,
    dto: UpdateMatchScoreDto,
    actor: { userId: string; role: string },
  ) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { tournamentId, isDeleted: false },
      select: { tournamentId: true, schedule: true, tournamentFormat: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const matches: any[] =
      (tournament.schedule as any)?.structure?.matches ||
      (tournament.schedule as any)?.matches ||
      [];
    const match = matches.find(
      (item) => item.id === matchId || item.canonicalMatchId === matchId,
    );
    if (!match)
      throw new NotFoundException('Match not found in this tournament');
    await this.assertMatchOperator(tournamentId, matchId, actor);
    if (match.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        'A match can only receive a final score after it has started',
      );
    }
    const checkIns: any[] = Array.isArray(match.checkIns) ? match.checkIns : [];
    const bothCheckedIn = [match.player1Id, match.player2Id].every((playerId) =>
      checkIns.some((item) => item.playerId === playerId),
    );
    if (!bothCheckedIn)
      throw new ConflictException(
        'Both participants must be checked in before submitting a score',
      );
    if (
      ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'].includes(
        tournament.tournamentFormat,
      ) &&
      dto.score1 === dto.score2
    ) {
      throw new BadRequestException(
        'A knockout match must have a decisive result',
      );
    }

    return this.updateMatchScore(tournamentId, matchId, {
      ...dto,
      status: 'COMPLETED',
    });
  }

  private async assertMatchOperator(
    tournamentId: string,
    matchId: string,
    actor: { userId: string; role: string },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const role = String(actor.role || '').toUpperCase();
    if (role !== 'EMPLOYEE') return;
    const assignment = await db.tournamentStaffAssignment.findUnique({
      where: { tournamentId_matchId: { tournamentId, matchId } },
      select: { employeeId: true },
    });
    if (!assignment || assignment.employeeId !== actor.userId) {
      throw new ForbiddenException(
        'You can only operate matches assigned to your employee account',
      );
    }
  }

  private async resolveRegisteredPlayerFromQr(
    tournamentId: string,
    qrToken: string,
    freeEntry = false,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const token = String(qrToken || '').trim();
    if (!token) throw new BadRequestException('Player QR token is required');
    const canonical = /^PLAYER:([^:]+):([^:]+)$/.exec(token);
    let registration: any = null;
    if (canonical) {
      if (canonical[1] !== tournamentId) {
        throw new BadRequestException(
          'This QR pass belongs to a different tournament',
        );
      }
      registration = await db.tournamentRegistration.findFirst({
        where: { tournamentId, playerId: canonical[2] },
        include: {
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
              username: true,
            },
          },
        },
      });
      if (registration?.qrCodeString && registration.qrCodeString !== token) {
        throw new BadRequestException(
          'The player QR pass is invalid or expired',
        );
      }
    } else {
      registration = await db.tournamentRegistration.findFirst({
        where: { tournamentId, qrCodeString: token },
        include: {
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
              username: true,
            },
          },
        },
      });
    }
    if (!registration || !registration.player) {
      throw new BadRequestException(
        'No registered player was found for this QR pass',
      );
    }
    const registrationConfirmed =
      registration.status === 'CONFIRMED' ||
      (freeEntry && registration.status === 'REGISTERED');
    const paymentConfirmed =
      ['PAID', 'CONFIRMED'].includes(
        String(registration.paymentStatus).toUpperCase(),
      ) ||
      (freeEntry &&
        String(registration.paymentStatus).toUpperCase() === 'PENDING');
    if (!registrationConfirmed || !paymentConfirmed) {
      throw new ForbiddenException(
        'Only confirmed, paid tournament participants can check in',
      );
    }
    return registration;
  }

  private syncMatchIntoCalendar(schedule: any, match: any) {
    const venueList =
      (Array.isArray(schedule.calendar)
        ? schedule.calendar
        : schedule.calendar?.venues) ||
      schedule.venueSchedules ||
      [];
    if (!Array.isArray(venueList)) return;
    for (const venue of venueList) {
      for (const screen of venue.screens || []) {
        for (const day of screen.days || []) {
          for (const slot of day.timeslots || []) {
            if (
              slot.game &&
              (slot.game.id === match.id ||
                slot.game.canonicalMatchId === match.id)
            ) {
              slot.game.status = match.status;
              slot.game.checkIns = match.checkIns;
            }
          }
        }
      }
    }
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
    if (!schedule?.structure?.matches || !schedule?.capacity)
      return {
        status: 'INVALID_CONFIGURATION',
        reason: 'Generate a valid competition calendar first',
      };
    return { ...schedule.capacity, ...capacitySummary(schedule) };
  }

  /**
   * Regenerates full match schedule and canonical structure for a Tournament
   */
  async generateScheduleForTournament(
    id: string,
    schedulingMode?: SchedulingMode,
    playerIds?: string[],
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (!(tournament.schedule as any)?.structure)
      throw new BadRequestException(
        'Canonical competition is missing; create a tournament first',
      );
    if (
      schedulingMode &&
      !Object.values(SchedulingMode).includes(schedulingMode)
    )
      throw new BadRequestException('Unsupported scheduling mode');
    if (playerIds?.length) {
      const assigned = (tournament.schedule as any).structure.slots
        .filter((slot: any) => slot.participantId)
        .map((slot: any) => slot.participantId);
      if (
        playerIds.length !== assigned.length ||
        new Set(playerIds).size !== playerIds.length ||
        playerIds.some((id) => !assigned.includes(id))
      )
        throw new BadRequestException(
          'Assign confirmed registrations to stable slots before generating the calendar',
        );
    }
    return this.generateCalendarForTournament(id, undefined, schedulingMode);
  }

  /**
   * Updates score and status for a canonical match, advancing winners in brackets if applicable
   */
  async updateMatchScore(
    tournamentId: string,
    matchId: string,
    dto: UpdateMatchScoreDto,
    correction?: {
      tournamentVersion: number;
      matchVersion: number;
      reason: string;
      auditEventId: string;
      actorId?: string;
    },
  ) {
    const tournament = tournamentId
      ? await this.prisma.tournament.findUnique({
          where: { tournamentId },
        })
      : await this.resolveTournamentForMatch(undefined, matchId);

    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = JSON.parse(JSON.stringify(tournament.schedule || {}));
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];

    const matchIndex = matches.findIndex(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );

    if (matchIndex === -1) {
      throw new NotFoundException(
        `Match #${matchId} not found in tournament schedule`,
      );
    }

    const match = matches[matchIndex];
    if (match.status === 'UNDER_REVIEW' || match.resumeRequired) {
      throw new ConflictException(
        'Resolve the incident and restart the match before submitting its score',
      );
    }
    if (![dto.score1, dto.score2].every((n) => Number.isInteger(n) && n >= 0))
      throw new BadRequestException('Scores must be nonnegative integers');
    refreshParticipants(schedule);
    if (
      correction &&
      (tournament.version !== correction.tournamentVersion ||
        (match.version || 1) !== correction.matchVersion)
    )
      throw new ConflictException('SCORE_REVISION_CONFLICT');
    if (!correction && match.status === 'COMPLETED')
      throw new ConflictException(
        'Use acknowledged score correction for completed results',
      );
    if (
      match.isAutoAdvance ||
      match.isSchedulable === false ||
      !match.player1Id ||
      !match.player2Id ||
      match.player1Id === match.player2Id
    )
      throw new BadRequestException(
        'Two distinct resolved competitors are required',
      );
    if (
      match.bracketSection !== 'GROUP' &&
      !match.tieId &&
      dto.score1 === dto.score2
    )
      throw new BadRequestException('A knockout match requires a winner');
    const confirmed = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId: tournament.tournamentId,
        playerId: { in: [match.player1Id, match.player2Id] },
        status: 'CONFIRMED',
      },
    });
    if (new Set(confirmed.map((r) => r.playerId)).size !== 2)
      throw new BadRequestException(
        'Both competitors must have confirmed registrations',
      );
    const previousScore1 = match.score1,
      previousScore2 = match.score2;
    match.score1 = dto.score1;
    match.score2 = dto.score2;
    match.status = dto.status || 'COMPLETED';

    match.version = (match.version || 1) + 1;
    if (correction) {
      schedule.resultCorrections = [
        ...(schedule.resultCorrections || []),
        {
          id: correction.auditEventId,
          actorId: correction.actorId,
          matchId,
          reason: correction.reason,
          previousScore1,
          previousScore2,
          previousVersion: correction.matchVersion,
          score1: dto.score1,
          score2: dto.score2,
          correctedAt: new Date().toISOString(),
        },
      ];
    }
    reconcileQualification(
      schedule,
      tournament.tournamentFormat === 'LEAGUE_AND_KNOCKOUT_DOUBLE',
    );
    for (const node of matches) {
      if (
        node.conditionType === 'GRAND_FINAL_RESET' &&
        node.conditionMatchId === match.id
      ) {
        node.isSchedulable =
          match.status === 'COMPLETED' && match.score2 > match.score1;
      }
    }
    refreshParticipants(schedule);
    for (const node of matches) {
      if (
        tournament.schedulingMode === SchedulingMode.PLAYER_SELF &&
        node.player1Id &&
        node.player2Id &&
        node.isSchedulable !== false &&
        !node.isAutoAdvance &&
        !['COMPLETED', 'CANCELLED'].includes(node.status)
      )
        node.selfSchedulingOpenedAt ||= new Date().toISOString();
    }
    // Prepare any required reserve extension before the atomic result write.
    const config = await this.prisma.tournament.findUnique({
      where: { tournamentId: tournament.tournamentId },
      include: { venues: { include: { screens: true } } },
    });
    const extension = ensureCapacity(schedule, config);
    if (!extension.success)
      throw new BadRequestException('Cannot reserve capacity for the result');

    const venueList =
      (Array.isArray(schedule.calendar)
        ? schedule.calendar
        : schedule.calendar?.venues) ||
      schedule.venueSchedules ||
      [];
    if (Array.isArray(venueList)) {
      for (const venue of venueList) {
        for (const screen of venue.screens || []) {
          for (const day of screen.days || []) {
            for (const slot of day.timeslots || []) {
              if (
                slot.game &&
                (slot.game.id === matchId ||
                  slot.game.canonicalMatchId === matchId)
              ) {
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
    }
    if (Array.isArray(schedule.matches) || !schedule.structure) {
      schedule.matches = matches;
    }

    const saved = await this.prisma.tournament.updateMany({
      where: {
        tournamentId: tournament.tournamentId,
        version: tournament.version,
      },
      data: { schedule, version: { increment: 1 } },
    });
    if (saved.count !== 1)
      throw new ConflictException(
        'The match changed while submitting its score. Refresh and try again.',
      );

    if (
      match.status === 'COMPLETED' &&
      match.score1 !== null &&
      match.score2 !== null
    ) {
      await this.settleFanPredictions(tournament.tournamentId, match);
    } else if (match.status === 'CANCELLED') {
      await this.voidFanPredictions(tournament.tournamentId, match.id);
    }

    try {
      await this.incidents?.publishMatchUpdate(
        tournament.tournamentId,
        match.id,
        match.status,
      );
    } catch (error: any) {
      this.logger.warn(
        `Score saved; live match update could not be delivered: ${error?.message || error}`,
      );
    }

    return match;
  }

  private async settleFanPredictions(tournamentId: string, match: any) {
    const resolvedWinnerId =
      match.score1 === match.score2
        ? 'DRAW'
        : match.score1 > match.score2
          ? match.player1Id
          : match.player2Id;
    const pending = await this.prisma.fanPrediction.findMany({
      where: { tournamentId, matchId: match.id, status: 'PENDING' },
    });
    if (!pending.length) return;

    await this.prisma.$transaction(async (tx) => {
      for (const prediction of pending) {
        const won = prediction.predictedWinnerId === resolvedWinnerId;
        const result = await tx.fanPrediction.updateMany({
          where: { id: prediction.id, status: 'PENDING' },
          data: { status: won ? 'WON' : 'LOST', settledAt: new Date() },
        });
        if (result.count !== 1 || !won) continue;

        const fan = await tx.fan.update({
          where: { fanId: prediction.fanId },
          data: { coins: { increment: prediction.potentialPayout } },
          select: { coins: true },
        });
        await tx.fanCoinTransaction.create({
          data: {
            fanId: prediction.fanId,
            predictionId: prediction.id,
            type: 'PREDICTION_PAYOUT',
            amount: prediction.potentialPayout,
            balanceAfter: fan.coins,
            description: `Prediction won: ${match.id}`,
          },
        });
      }
    });
  }

  private async voidFanPredictions(tournamentId: string, matchId: string) {
    const pending = await this.prisma.fanPrediction.findMany({
      where: { tournamentId, matchId, status: 'PENDING' },
    });
    if (!pending.length) return;

    await this.prisma.$transaction(async (tx) => {
      for (const prediction of pending) {
        const updated = await tx.fanPrediction.updateMany({
          where: { id: prediction.id, status: 'PENDING' },
          data: { status: 'VOID', settledAt: new Date() },
        });
        if (updated.count !== 1) continue;
        const fan = await tx.fan.update({
          where: { fanId: prediction.fanId },
          data: { coins: { increment: prediction.stakeCoins } },
          select: { coins: true },
        });
        await tx.fanCoinTransaction.create({
          data: {
            fanId: prediction.fanId,
            predictionId: prediction.id,
            type: 'PREDICTION_REFUND',
            amount: prediction.stakeCoins,
            balanceAfter: fan.coins,
            description: `Prediction refunded: match ${matchId} was cancelled`,
          },
        });
      }
    });
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

    const schedule = JSON.parse(JSON.stringify(tournament.schedule || {}));
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];
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
  async correctMatchScore(
    matchId: string,
    dto: ScoreCorrectionDto,
    actorId?: string,
  ) {
    if (!dto.acknowledgement || dto.expectedVersion === undefined)
      throw new BadRequestException(
        'Score correction requires acknowledgement and expectedVersion',
      );
    const tournament = await this.resolveTournamentForMatch(undefined, matchId);
    if (!tournament) throw new NotFoundException('Match not found');
    const schedule: any = tournament.schedule;
    const match = (schedule.structure?.matches || schedule.matches || []).find(
      (m: any) => m.id === matchId,
    );
    if (!match) throw new NotFoundException('Match not found');
    if ((match.version || 1) !== dto.expectedVersion)
      throw new ConflictException('SCORE_REVISION_CONFLICT');
    if (
      match.bracketSection === 'GROUP' &&
      schedule.structure?.qualificationResolution?.status === 'RESOLVED'
    )
      throw new ConflictException(
        'Qualification is frozen; a downstream correction policy is required',
      );
    const feeds = (ref: any, id: string) =>
      ref &&
      ['MATCH_WINNER', 'MATCH_LOSER'].includes(ref.type) &&
      ref.value === id;
    const descendants = new Set([match.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of schedule.structure?.matches || []) {
        if (descendants.has(m.id)) continue;
        if (
          [...descendants].some(
            (id) =>
              feeds(m.participant1Ref, id) ||
              feeds(m.participant2Ref, id) ||
              (schedule.structure.matches.find(
                (source: any) => source.id === id,
              )?.tieId &&
                [m.participant1Ref, m.participant2Ref].some(
                  (r) =>
                    ['TIE_WINNER', 'TIE_LOSER'].includes(r.type) &&
                    r.value ===
                      schedule.structure.matches.find(
                        (source: any) => source.id === id,
                      ).tieId,
                )),
          )
        ) {
          descendants.add(m.id);
          changed = true;
          if (m.status !== 'SCHEDULED' && m.status !== 'PLAYERS_READY')
            throw new ConflictException(
              'A downstream match has already started; correction policy is required',
            );
        }
      }
    }
    const auditEventId = randomUUID();
    const corrected = await this.updateMatchScore(
      tournament.tournamentId,
      matchId,
      { score1: dto.score1, score2: dto.score2, status: 'COMPLETED' },
      {
        tournamentVersion: tournament.version,
        matchVersion: dto.expectedVersion,
        reason: dto.reason,
        auditEventId,
        actorId,
      },
    );
    return { match: corrected, auditEventId, reason: dto.reason };
  }

  /**
   * File a dispute for a match
   */
  async disputeMatch(
    matchId: string,
    dto: CreateMatchDisputeDto,
    actor: { userId: string; role: string },
  ) {
    if (!this.incidents)
      throw new BadRequestException('Match incident service is unavailable');
    return this.incidents.create(undefined, matchId, dto, actor);
  }

  /**
   * Resolves a match dispute with outcome status
   */
  async resolveMatchDispute(
    disputeId: string,
    dto: UpdateMatchDisputeDto,
    actor: { userId: string; role: string },
  ) {
    if (!this.incidents)
      throw new BadRequestException('Match incident service is unavailable');
    return this.incidents.resolve(disputeId, dto, actor);
  }

  /**
   * Reconcile schedule capacity metrics
   */
  async resolveQualificationDraw(
    tournamentId: string,
    dto: {
      tieGroupId: string;
      participantIds: string[];
      expectedVersion: number;
    },
    actorId: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted)
      throw new NotFoundException('Tournament not found');
    if (dto.expectedVersion !== tournament.version)
      throw new ConflictException('VERSION_CONFLICT');
    const schedule = JSON.parse(
      JSON.stringify(tournament.schedule),
    ) as TournamentSchedulePayload;
    applyQualificationDraw(
      schedule,
      dto.tieGroupId,
      dto.participantIds,
      tournament.tournamentFormat === 'LEAGUE_AND_KNOCKOUT_DOUBLE',
      actorId,
    );
    const saved = await this.prisma.tournament.updateMany({
      where: { tournamentId, version: tournament.version },
      data: { schedule: schedule as any, version: { increment: 1 } },
    });
    if (saved.count !== 1)
      throw new ConflictException(
        'A competing draw or result changed this qualification',
      );
    return {
      qualificationResolution: (schedule.structure as any)
        .qualificationResolution,
      matches: schedule.structure.matches,
      version: tournament.version + 1,
    };
  }

  async reconcileScheduleCapacity(
    tournamentId: string,
    expectedVersion?: number,
  ) {
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

    const config = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: { venues: { include: { screens: true } } },
    });
    const schedule = JSON.parse(
      JSON.stringify(tournament.schedule),
    ) as TournamentSchedulePayload;
    if (!schedule?.structure)
      throw new BadRequestException(
        'Generate a valid canonical structure first',
      );
    const outcome = ensureCapacity(schedule, config);
    if (outcome.slotsAdded) {
      const saved = await this.prisma.tournament.updateMany({
        where: { tournamentId, version: tournament.version },
        data: { schedule: schedule as any, version: { increment: 1 } },
      });
      if (saved.count !== 1)
        throw new ConflictException(
          'Schedule changed while reconciling capacity',
        );
    }
    return { ...outcome, capacitySummary: capacitySummary(schedule) };
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

    const registrations = await this.prisma.tournamentRegistration.findMany({
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

    if (
      tournament.schedulingMode !== SchedulingMode.PLAYER_SELF ||
      tournament.schedulingPaused ||
      (tournament as any).schedulingWindowOpen === false
    ) {
      return {
        tournamentId: tournament.tournamentId,
        tournamentName: tournament.name,
        pendingMatches: [],
      };
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
      const participantsResolved =
        !!m.player1Id &&
        !!m.player2Id &&
        !m.player1Id.startsWith('TBD') &&
        !m.player2Id.startsWith('TBD') &&
        !m.player1Id.startsWith('BYE') &&
        !m.player2Id.startsWith('BYE');
      const isPlayable =
        !m.isAutoAdvance &&
        (!m.conditional || m.isSchedulable === true) &&
        m.isSchedulable !== false &&
        m.status !== 'UNDER_REVIEW' &&
        m.status !== 'COMPLETED' &&
        m.status !== 'CANCELLED';
      return (
        isParticipant &&
        participantsResolved &&
        !!m.selfSchedulingOpenedAt &&
        isUnallocated &&
        isPlayable
      );
    });

    const opponentIds = pending
      .map((m: any) => (m.player1Id === playerId ? m.player2Id : m.player1Id))
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

      const openedAt = m.selfSchedulingOpenedAt;
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
        openedAt: m.selfSchedulingOpenedAt || null,
        phase: windowState.phase,
        phaseStatus:
          m.schedulingPhase === MatchSchedulingPhase.CAPACITY_BLOCKED ||
          m.schedulingPhase === MatchSchedulingPhase.ADMIN_ACTION_REQUIRED ||
          m.schedulingPhase === MatchSchedulingPhase.AUTO_ASSIGNED
            ? m.schedulingPhase
            : windowState.phaseStatus,
        isEscalated: windowState.isEscalated,
        escalationWarning: null,
        timeRemainingMs: windowState.timeRemainingMs,
        timeRemainingFormatted: windowState.timeRemainingFormatted,
        autoAssignmentDueAt: windowState.autoAssignmentDueAt,
        timeUntilAutoAssignmentMs: windowState.timeUntilAutoAssignmentMs,
        timeUntilAutoAssignmentFormatted:
          windowState.timeUntilAutoAssignmentFormatted,
        isAutoAssignmentDue: windowState.isAutoAssignmentDue,
        canPlayerSelectSlot: windowState.canPlayerSelectSlot,
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

    if (
      tournament.schedulingMode !== SchedulingMode.PLAYER_SELF ||
      tournament.schedulingPaused ||
      (tournament as any).schedulingWindowOpen === false
    ) {
      throw new BadRequestException(
        'Player self-scheduling is not currently available for this tournament.',
      );
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

    const participantsResolved =
      !!targetMatch.player1Id &&
      !!targetMatch.player2Id &&
      !targetMatch.player1Id.startsWith('TBD') &&
      !targetMatch.player2Id.startsWith('TBD') &&
      !targetMatch.player1Id.startsWith('BYE') &&
      !targetMatch.player2Id.startsWith('BYE');
    if (
      !participantsResolved ||
      targetMatch.isSchedulable === false ||
      targetMatch.isAutoAdvance ||
      (targetMatch.conditional && targetMatch.isSchedulable !== true) ||
      targetMatch.status === 'UNDER_REVIEW' ||
      targetMatch.status === 'COMPLETED' ||
      targetMatch.status === 'CANCELLED' ||
      (targetMatch.date && targetMatch.time && targetMatch.venueId)
    ) {
      throw new BadRequestException(
        'This match is not eligible for player self-scheduling.',
      );
    }
    if (!targetMatch.selfSchedulingOpenedAt) {
      throw new BadRequestException(
        'Self-scheduling has not yet opened for this match.',
      );
    }

    const playerWindowState = evaluateSelfSchedulingWindow(
      targetMatch.selfSchedulingOpenedAt,
    );
    if (!playerWindowState.canPlayerSelectSlot) {
      throw new ForbiddenException(
        'The player self-scheduling window has closed. The match is queued for system assignment.',
      );
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
      targetMatch.selfSchedulingOpenedAt,
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
            const occupiedBy =
              slot.canonicalMatchId ||
              slot.game?.canonicalMatchId ||
              slot.game?.id ||
              null;
            const isBooked = !!occupiedBy && occupiedBy !== matchId;
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
                        (cs.canonicalMatchId ||
                          cs.game?.canonicalMatchId ||
                          cs.game?.id) &&
                        (cs.canonicalMatchId ||
                          cs.game?.canonicalMatchId ||
                          cs.game?.id) !== matchId,
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
            const policy = d.schedulingPolicy;
            const now = Date.now();
            const isPolicyClosed =
              policy?.isWindowOpen === false ||
              (!!policy?.windowOpenTime &&
                now < new Date(policy.windowOpenTime).getTime()) ||
              (!!policy?.windowCloseTime &&
                now >= new Date(policy.windowCloseTime).getTime());
            let isDisabled = isBooked || isPlayerConflict || isPolicyClosed;

            if (isBooked) {
              badge = 'BOOKED';
            } else if (isPlayerConflict) {
              badge = 'CONFLICT';
            } else if (isPolicyClosed) {
              badge = 'CLOSED';
            } else if (isCastedSlot) {
              badge = 'CASTED';
            } else if (isPeak) {
              badge = 'PEAK';
            }

            // Phase 3 closes player booking; the system or tournament admin handles it.
            if (windowState.phase === 3) {
              isDisabled = true;
            }

            groupedByDate[d.date].venues[v.venueId].screens[
              s.screenId
            ].timeslots.push({
              time: slot.time,
              isBooked,
              isPlayerConflict,
              isPolicyClosed,
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
      isEscalated: windowState.isEscalated,
      timeRemainingFormatted: windowState.timeRemainingFormatted,
      timeUntilAutoAssignmentFormatted:
        windowState.timeUntilAutoAssignmentFormatted,
      timeUntilAutoAssignmentMs: windowState.timeUntilAutoAssignmentMs,
      autoAssignmentDueAt: windowState.autoAssignmentDueAt,
      isAutoAssignmentDue: windowState.isAutoAssignmentDue,
      canPlayerSelectSlot: windowState.canPlayerSelectSlot,
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
    const screen = venue?.screens?.find(
      (s: any) => s.screenId === dto.screenId,
    );

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

    const openedAt = dto.simulatedOpenedAt || match.selfSchedulingOpenedAt;
    const simTime = dto.simulatedCurrentTime
      ? new Date(dto.simulatedCurrentTime)
      : new Date();

    const windowState = evaluateSelfSchedulingWindow(openedAt, simTime);

    const eligibleSlotsList = getEligibleSlotsForMatch(
      schedule.calendar,
      match.id,
      match.player1Id,
      match.player2Id,
    );
    const eligibleSlots = eligibleSlotsList.length;
    const candidateSlot =
      eligibleSlotsList.length > 0 ? eligibleSlotsList[0] : null;

    let predictedAction:
      | 'AUTO_ASSIGN'
      | 'CAPACITY_BLOCKED'
      | 'PLAYER_SELF_BOOKING'
      | 'ALREADY_SCHEDULED'
      | 'NOT_OPEN' = 'PLAYER_SELF_BOOKING';

    const isAllocated = !!(match.date && match.time && match.venueId);

    if (isAllocated) {
      predictedAction = 'ALREADY_SCHEDULED';
    } else if (windowState.phase === 0) {
      predictedAction = 'NOT_OPEN';
    } else if (windowState.phase === 3) {
      predictedAction = candidateSlot ? 'AUTO_ASSIGN' : 'CAPACITY_BLOCKED';
    } else {
      predictedAction = 'PLAYER_SELF_BOOKING';
    }

    return {
      matchId: match.id,
      openedAt: openedAt || null,
      simulatedCurrentTime: simTime.toISOString(),
      elapsedHours: windowState.elapsedHours,
      phase: windowState.phase,
      phaseStatus: windowState.phaseStatus,
      isEscalated: windowState.isEscalated,
      timeRemainingFormatted: windowState.timeRemainingFormatted,
      timeUntilAutoAssignment: windowState.timeUntilAutoAssignmentFormatted,
      timeUntilAutoAssignmentMs: windowState.timeUntilAutoAssignmentMs,
      autoAssignmentDueAt: windowState.autoAssignmentDueAt,
      eligibleSlots,
      isAutoAssignmentDue: windowState.isAutoAssignmentDue,
      canPlayerSelectSlot: windowState.canPlayerSelectSlot,
      predictedAction,
      candidateSlot,
    };
  }

  /**
   * 8. Process due Player Schedule auto-assignments after the 24-hour choice window.
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
      const tournamentResults: any[] = [];
      const activityEvents: Array<{ title: string; description: string }> = [];
      const playerNotifications: Array<{
        userId: string;
        description: string;
      }> = [];

      for (const match of matches) {
        const isAllocated = !!(match.date && match.time && match.venueId);
        const isCompleted =
          match.status === 'COMPLETED' || match.status === 'CANCELLED';
        if (
          isAllocated ||
          isCompleted ||
          match.status === 'UNDER_REVIEW' ||
          match.resumeRequired ||
          match.isAutoAdvance ||
          (match.conditional && match.isSchedulable !== true) ||
          match.isSchedulable === false
        ) {
          continue;
        }

        // Both participants must be resolved before scheduling clock starts or auto-assigning
        if (
          !match.player1Id ||
          !match.player2Id ||
          match.player1Id.startsWith('TBD') ||
          match.player2Id.startsWith('TBD') ||
          match.player1Id.startsWith('BYE') ||
          match.player2Id.startsWith('BYE')
        ) {
          continue;
        }

        // Only process matches that have actually opened for self-scheduling
        if (!match.selfSchedulingOpenedAt) {
          continue;
        }

        const windowState = evaluateSelfSchedulingWindow(
          match.selfSchedulingOpenedAt,
          now,
        );

        if (windowState.phase === 3) {
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
            match.autoAssignedAt = now.toISOString();
            match.schedulingExceptionReason = undefined;
            Object.assign(schedule, updatedSchedule);
            hasUpdates = true;

            tournamentResults.push({
              tournamentId: tournament.tournamentId,
              matchId: match.id,
              action: 'AUTO_ASSIGNED',
              allocation: candidate,
            });

            activityEvents.push({
              title: 'Auto-Assignment Completed',
              description: `Match #${match.id} auto-assigned to ${candidate.venueName} screen ${candidate.screenName} on ${candidate.date} @ ${candidate.time}`,
            });

            for (const pId of [match.player1Id, match.player2Id]) {
              playerNotifications.push({
                userId: pId,
                description: `Your match #${match.id} was automatically scheduled for ${candidate.date} at ${candidate.time} on ${candidate.venueName} - ${candidate.screenName} after the 24-hour Player Schedule window expired.`,
              });
            }
          } else {
            const reason =
              'NO_VALID_CAPACITY: All published physical capacity occupied or conflicting';
            if (
              match.schedulingPhase !== MatchSchedulingPhase.CAPACITY_BLOCKED ||
              match.schedulingExceptionReason !== reason
            ) {
              match.schedulingPhase = MatchSchedulingPhase.CAPACITY_BLOCKED;
              match.schedulingExceptionReason = reason;
              hasUpdates = true;

              tournamentResults.push({
                tournamentId: tournament.tournamentId,
                matchId: match.id,
                action: 'CAPACITY_BLOCKED',
                reason,
              });
              activityEvents.push({
                title: 'Auto-Assignment Capacity Exception',
                description: `Match #${match.id} reached the end of its 24-hour Player Schedule window but has no valid slot. Admin action required.`,
              });
            }
          }
        }
      }

      if (hasUpdates) {
        const saved = await this.prisma.tournament.updateMany({
          where: {
            tournamentId: tournament.tournamentId,
            version: tournament.version,
          },
          data: {
            schedule: schedule as any,
            version: { increment: 1 },
          },
        });

        // A concurrent player/admin booking changed the schedule. Do not emit
        // success events for an auto-assignment that was not persisted.
        if (saved.count === 1) {
          results.push(...tournamentResults);
          for (const event of activityEvents) {
            await createActivities(
              this.prisma,
              event.title,
              event.description,
              'TOURNAMENT',
            );
          }
          for (const notification of playerNotifications) {
            try {
              await this.prisma.notification.create({
                data: {
                  userId: notification.userId,
                  title: 'Match Automatically Scheduled',
                  description: notification.description,
                  status: 'INFORMATION',
                },
              });
            } catch {
              // Ignore notification failure if player cannot be notified.
            }
          }
        }
      }
    }

    return {
      processedAt: now.toISOString(),
      totalProcessed: results.length,
      results,
    };
  }
}
