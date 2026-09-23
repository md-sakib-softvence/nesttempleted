import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTournamentDto } from '../dto/tournament/create-tournament.dto';
import { UpdateTournamentDto } from '../dto/tournament/update-tournament.dto';
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

  async createTournament(createTournamentDto: CreateTournamentDto) {
    const {
      startDate,
      deadline,
      venues: inputVenues,
      playerIds: inputPlayerIds,
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

    // Handle Match Schedule Generation based on Scheduling Mode
    let schedule: any = tournament.schedule;

    if (
      schedulingMode === SchedulingMode.AUTO_HOME_VENUE ||
      schedulingMode === SchedulingMode.AUTO_RANDOM ||
      schedulingMode === SchedulingMode.MANUAL
    ) {
      let tournamentVenues = tournament.venues;

      // Fallback: If no venues were created inline with tournament, check if existing venues are in DB
      if (tournamentVenues.length === 0) {
        const existingVenues = await this.prisma.venue.findMany({
          include: { screens: true },
          take: 5,
        });
        if (existingVenues.length > 0) {
          tournamentVenues = existingVenues as any;
        }
      }

      if (tournamentVenues.length > 0) {
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
              tournamentVenues[idx % tournamentVenues.length].venueId,
          }));
        } else {
          // Fetch active players from DB up to numberOfTeams
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
              tournamentVenues[idx % tournamentVenues.length].venueId,
          }));
        }

        const venueInputs: ScheduleVenueInput[] = tournamentVenues.map(
          (v) => ({
            venueId: v.venueId,
            name: v.name,
            screens: v.screens.map((s) => ({
              screenId: s.screenId,
              screenName: s.screenName,
            })),
          }),
        );

        schedule = await this.tournamentScheduleService.generateSchedule({
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

        // Update tournament with generated schedule in database
        await this.prisma.tournament.update({
          where: { tournamentId: tournament.tournamentId },
          data: { schedule: schedule as any },
        });
      }
    }

    const result = {
      ...tournament,
      schedule,
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

    if (tournamentVenues.length === 0) {
      throw new NotFoundException(
        'No venues or screens found for this tournament to generate schedule',
      );
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
          tournamentVenues[idx % tournamentVenues.length].venueId,
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
          tournamentVenues[idx % tournamentVenues.length].venueId,
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

