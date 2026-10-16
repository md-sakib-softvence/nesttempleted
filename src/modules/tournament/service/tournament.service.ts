import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTournamentDto } from '../dto/tournament/create-tournament.dto';
import { UpdateTournamentDto } from '../dto/tournament/update-tournament.dto';
import { AllocateMatchDto } from '../dto/tournament/allocate-match.dto';
import { GenerateCalendarDto } from '../dto/tournament/generate-calendar.dto';
import { AutoAllocationDto } from '../dto/tournament/auto-allocation.dto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { getPreSignedUrl } from '../../utils/s3.util';
import {
  TournamentScheduleService,
  Participant,
  ScheduleVenueInput,
  TournamentSchedulePayload,
} from './tournament-schedule.service';
import { SchedulingMode } from '@prisma/client';

@Injectable()
export class TournamentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentScheduleService: TournamentScheduleService,
  ) {}

  private async presignTournamentMedia<T extends Record<string, any>>(
    tournament: T,
  ): Promise<T> {
    const formatted: Record<string, any> = { ...tournament };

    if (formatted.canvasImage) {
      formatted.canvasImage = await getPreSignedUrl(
        String(formatted.canvasImage),
      );
    }

    if (formatted.tournamentLogoUrl) {
      formatted.tournamentLogoUrl = await getPreSignedUrl(
        String(formatted.tournamentLogoUrl),
      );
    }

    if (formatted.playerOrgUrl) {
      if (
        !String(formatted.playerOrgUrl).includes('http://') &&
        !String(formatted.playerOrgUrl).includes('https://')
      ) {
        formatted.playerOrgUrl = await getPreSignedUrl(
          String(formatted.playerOrgUrl),
        );
      }
    }

    if (formatted.prOrgUrl) {
      if (
        !String(formatted.prOrgUrl).includes('http://') &&
        !String(formatted.prOrgUrl).includes('https://')
      ) {
        formatted.prOrgUrl = await getPreSignedUrl(String(formatted.prOrgUrl));
      }
    }

    if (formatted.rules && Array.isArray(formatted.rules)) {
      formatted.rules = await Promise.all(
        formatted.rules.map(async (rule: string) => {
          if (rule.includes('http://') || rule.includes('https://')) {
            return rule;
          }
          return getPreSignedUrl(rule);
        }),
      );
    }

    if (formatted.tsAndTc && Array.isArray(formatted.tsAndTc)) {
      formatted.tsAndTc = await Promise.all(
        formatted.tsAndTc.map(async (doc: string) => {
          if (doc.includes('http://') || doc.includes('https://')) {
            return doc;
          }
          return getPreSignedUrl(doc);
        }),
      );
    }

    return formatted as T;
  }

  /**
   * Structure Generation (POST /tournaments):
   * Calculate match count and produce canonical match entities.
   * Generates capacity metrics, calendar grid, and places matches according to schedulingMode.
   */
  async createTournament(createTournamentDto: CreateTournamentDto) {
    const {
      startDate,
      deadline,
      venues: inputVenues,
      playerIds: inputPlayerIds,
      groupsCount,
      thirdPlacePlayoffEnabled = true,
      ...rest
    } = createTournamentDto;

    const schedulingMode = rest.schedulingMode || SchedulingMode.MANUAL;

    const tournament = await this.prisma.tournament.create({
      data: {
        ...rest,
        schedulingMode,
        startDate: new Date(startDate),
        deadline: new Date(deadline),
        ...(inputVenues &&
          Array.isArray(inputVenues) &&
          inputVenues.length > 0 && {
            venues: {
              create: inputVenues.map((v: any) => ({
                name: v.name || 'Venue',
                address: v.address || '',
                ...(v.screens &&
                  Array.isArray(v.screens) &&
                  v.screens.length > 0 && {
                    screens: {
                      create: v.screens.map((s: any) => ({
                        screenName:
                          typeof s === 'string'
                            ? s
                            : s.screenName || 'Screen',
                      })),
                    },
                  }),
              })),
            },
          }),
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

    let tournamentVenues = tournament.venues;

    // Fallback: If no venues were created inline, check existing venues in DB
    if (tournamentVenues.length === 0) {
      const existingVenues = await this.prisma.venue.findMany({
        include: { screens: true },
        take: 5,
      });
      if (existingVenues.length > 0) {
        tournamentVenues = existingVenues as any;
      }
    }

    // Resolve participating players
    let participants: Participant[] = [];
    if (
      inputPlayerIds &&
      Array.isArray(inputPlayerIds) &&
      inputPlayerIds.length > 0
    ) {
      const players = await this.prisma.player.findMany({
        where: {
          playerId: { in: inputPlayerIds },
        },
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

    // Generate schedule (capacity, canonical structure, calendar grid)
    const schedulePayload =
      await this.tournamentScheduleService.generateSchedule({
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
        groupsCount,
        thirdPlacePlayoffEnabled,
      });

    // Update tournament with generated schedule in database
    await this.prisma.tournament.update({
      where: { tournamentId: tournament.tournamentId },
      data: { schedule: schedulePayload as any },
    });

    const result = {
      ...tournament,
      schedule: schedulePayload,
    };

    return this.presignTournamentMedia(result);
  }

  async getAllTournaments(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'gameTitle'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        skip,
        take,
        orderBy,
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
      }),
      this.prisma.tournament.count({ where }),
    ]);

    const formattedData = await Promise.all(
      data.map((item) => this.presignTournamentMedia(item)),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: formattedData, meta };
  }

  async getTournamentById(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
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

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    return this.presignTournamentMedia(tournament);
  }

  async updateTournament(id: string, updateTournamentDto: UpdateTournamentDto) {
    const existing = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const { startDate, deadline, ...rest } = updateTournamentDto;

    const updateData: Record<string, any> = { ...rest };
    if (startDate) {
      updateData.startDate = new Date(startDate);
    }
    if (deadline) {
      updateData.deadline = new Date(deadline);
    }

    const updated = await this.prisma.tournament.update({
      where: { tournamentId: id },
      data: updateData,
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

    return this.presignTournamentMedia(updated);
  }

  async deleteTournament(id: string) {
    const existing = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Tournament not found or already deleted');
    }

    return this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        isDeleted: true,
      },
    });
  }

  /**
   * Calendar Generation (POST /tournaments/{id}/calendar):
   * Generate the grid of dates, screens, and empty timeslots based on venue screens and hours.
   * Retains existing canonical match entities and their scores.
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
        tournamentVenues = existingVenues as any;
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

    // Retrieve existing schedule or initialize structure
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

    // Calculate capacity metrics based on Part 2 formulas
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

    // Build empty calendar grid
    const calendar = this.tournamentScheduleService.buildEmptyScheduleGrid(
      venueInputs,
      eventDates,
      dayTimeslots,
      dto?.schedulingPolicy,
    );

    // Retain existing allocations and scores if valid in new calendar grid
    const existingMatches = structure.matches || [];
    for (const match of existingMatches) {
      if (match.venueId && match.screenId && match.date && match.time) {
        const venue = calendar.find((v) => v.venueId === match.venueId);
        const screen = venue?.screens.find((s) => s.screenId === match.screenId);
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

    return this.presignTournamentMedia(updated);
  }

  /**
   * Physical Allocations (POST /tournaments/{id}/matches/{id}/allocate):
   * Link a canonical match ID to a physical slot (venueId, screenId, date, time).
   * INVARIANT: Never overwrite scores when moving a schedule slot.
   */
  async allocateTournamentMatch(
    tournamentId: string,
    matchId: string,
    dto: AllocateMatchDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const currentSchedule = tournament.schedule as any as TournamentSchedulePayload;
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
      where: { tournamentId },
      data: { schedule: updatedSchedule as any },
    });

    return {
      allocation,
      match,
    };
  }

  /**
   * Clears physical allocation for a canonical match, preserving scores.
   */
  async unallocateTournamentMatch(tournamentId: string, matchId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const currentSchedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule has not been generated yet.',
      );
    }

    const { updatedSchedule, match } =
      this.tournamentScheduleService.unallocateMatch(currentSchedule, matchId);

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: updatedSchedule as any },
    });

    return {
      match,
    };
  }

  /**
   * Auto allocation for all unallocated matches (POST /tournaments/{id}/auto-allocation).
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

    const currentSchedule = tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule has not been generated yet.',
      );
    }

    const mode = dto?.mode || tournament.schedulingMode || SchedulingMode.AUTO_HOME_VENUE;

    // Gather participants from slots or DB
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
   * Returns canonical matches for tournament (GET /tournaments/{id}/matches).
   */
  async getTournamentMatches(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    const matches = schedule?.structure?.matches || [];
    const summary = schedule?.structure?.summary || {};

    return {
      tournamentId: id,
      summary,
      matches,
    };
  }

  /**
   * Returns calendar grid for tournament (GET /tournaments/{id}/calendar or GET /tournaments/{id}/schedule).
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
   * Returns capacity calculation breakdown (GET /tournaments/{id}/capacity).
   */
  async getTournamentCapacity(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    return schedule?.capacity || {};
  }

  /**
   * Regenerates full match schedule and canonical structure for a Tournament.
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
        tournamentVenues = existingVenues as any;
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

    return this.presignTournamentMedia(updated);
  }
}
