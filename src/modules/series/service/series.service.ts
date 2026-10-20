import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSeriesDto } from '../dto/create-series.dto';
import { UpdateSeriesDto } from '../dto/update-series.dto';
import { UpdateSeriesStatusDto } from '../dto/update-series-status.dto';
import { LinkTournamentsDto } from '../dto/link-tournaments.dto';
import { ReorderTournamentsDto } from '../dto/reorder-tournaments.dto';
import { UpdateSeriesParticipantDto } from '../dto/update-participant.dto';
import { CreateSeriesAdjustmentDto } from '../dto/create-adjustment.dto';
import { UpdateSeriesScoringConfigDto } from '../dto/update-scoring-config.dto';
import { UpdateSeriesPublicationDto } from '../dto/update-publication.dto';
import { QuerySeriesDto } from '../dto/query-series.dto';
import { QuerySeriesParticipantDto } from '../dto/query-participant.dto';
import { SeriesStatus, Prisma } from '@prisma/client';
import { getPreSignedUrl } from '../../utils/s3.util';

@Injectable()
export class SeriesService {
  private readonly logger = new Logger(SeriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to presign URLs if stored on S3
   */
  private async presignSeriesMedia<T extends Record<string, any>>(
    series: T,
  ): Promise<T> {
    if (!series) return series;
    const formatted: Record<string, any> = { ...series };
    if (formatted.logoUrl && !String(formatted.logoUrl).startsWith('http')) {
      formatted.logoUrl = await getPreSignedUrl(String(formatted.logoUrl));
    }
    if (formatted.imageUrl && !String(formatted.imageUrl).startsWith('http')) {
      formatted.imageUrl = await getPreSignedUrl(String(formatted.imageUrl));
    }
    return formatted as T;
  }

  /**
   * 3.1 Series CRUD & Lifecycle
   */
  async createSeries(dto: CreateSeriesDto) {
    const { tournamentIds = [], scoringConfig, ...rest } = dto;

    const existing = await this.prisma.series.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `Series with code '${dto.code}' already exists. Please choose a unique code.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.create({
        data: {
          ...rest,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          scoringConfig: (scoringConfig || {
            name: 'Standard Grand Prix Scoring',
            placementPoints: { '1': 100, '2': 75, '3': 50 },
            participationPoints: 5,
          }) as any,
          status: dto.status || SeriesStatus.DRAFT,
          published: dto.published ?? false,
          version: 1,
        },
      });

      if (tournamentIds.length > 0) {
        const linkData = tournamentIds.map((tournId, index) => ({
          seriesId: series.id,
          tournamentId: tournId,
          sequenceOrder: index + 1,
          weightMultiplier:
            scoringConfig?.weighting?.[tournId] !== undefined
              ? Number(scoringConfig.weighting[tournId])
              : 1.0,
        }));
        await tx.seriesTournament.createMany({
          data: linkData,
          skipDuplicates: true,
        });
      }

      this.logger.log(`Created Series: ${series.name} (${series.id})`);
      const presigned = await this.presignSeriesMedia(series);
      return {
        ...presigned,
        tournamentIds,
        tournamentsCount: tournamentIds.length,
        participantsCount: 0,
      };
    });
  }

  async getAllSeries(query: QuerySeriesDto) {
    const { status, search, page = 1, limit = 25 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SeriesWhereInput = {
      isDeleted: false,
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [totalItems, seriesList] = await Promise.all([
      this.prisma.series.count({ where }),
      this.prisma.series.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tournaments: {
            include: {
              tournament: {
                select: {
                  tournamentId: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
          participants: {
            where: { status: 'ACTIVE' },
            orderBy: [{ currentRank: 'asc' }, { totalPoints: 'desc' }],
            take: 1,
            include: {
              player: {
                select: {
                  playerId: true,
                  gamerTag: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          _count: {
            select: {
              tournaments: true,
              participants: true,
            },
          },
        },
      }),
    ]);

    const items = await Promise.all(
      seriesList.map(async (s) => {
        const presigned = await this.presignSeriesMedia(s);
        const completedTournamentsCount = s.tournaments.filter(
          (t) => t.tournament?.status === 'COMPLETED',
        ).length;

        const leaderParticipant = s.participants[0];
        const currentLeader = leaderParticipant
          ? {
              playerId: leaderParticipant.playerId,
              gamertag:
                leaderParticipant.player.gamerTag ||
                `${leaderParticipant.player.firstName} ${leaderParticipant.player.lastName}`.trim(),
              totalPoints: leaderParticipant.totalPoints,
            }
          : null;

        return {
          id: presigned.id,
          name: presigned.name,
          code: presigned.code,
          description: presigned.description,
          logoUrl: presigned.logoUrl,
          imageUrl: presigned.imageUrl,
          status: presigned.status,
          startDate: presigned.startDate,
          endDate: presigned.endDate,
          participantType: presigned.participantType,
          participationMode: presigned.participationMode,
          minimumEventsRequired: presigned.minimumEventsRequired,
          scoringMethod: presigned.scoringMethod,
          bestNResults: presigned.bestNResults,
          tournamentsCount: s._count.tournaments,
          completedTournamentsCount,
          participantsCount: s._count.participants,
          published: presigned.published,
          currentLeader,
          version: presigned.version,
          createdAt: presigned.createdAt,
          updatedAt: presigned.updatedAt,
        };
      }),
    );

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      pagination: {
        totalItems,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getSeriesById(id: string) {
    const series = await this.prisma.series.findUnique({
      where: { id },
      include: {
        tournaments: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            tournament: {
              select: {
                tournamentId: true,
                name: true,
                status: true,
                startDate: true,
                numberOfTeams: true,
                schedule: true,
              },
            },
          },
        },
        _count: {
          select: {
            tournaments: true,
            participants: true,
          },
        },
      },
    });

    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${id}' not found`);
    }

    const presigned = await this.presignSeriesMedia(series);
    const tournamentIds = series.tournaments.map((t) => t.tournamentId);

    return {
      ...presigned,
      tournamentIds,
      tournamentsCount: series._count.tournaments,
      participantsCount: series._count.participants,
    };
  }

  async updateSeries(id: string, dto: UpdateSeriesDto) {
    const series = await this.prisma.series.findUnique({ where: { id } });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${id}' not found`);
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== series.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${dto.expectedVersion}, but current version is ${series.version}`,
      });
    }

    const { expectedVersion, tournamentIds, scoringConfig, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.series.update({
        where: { id },
        data: {
          ...rest,
          ...(dto.startDate && { startDate: new Date(dto.startDate) }),
          ...(dto.endDate !== undefined && {
            endDate: dto.endDate ? new Date(dto.endDate) : null,
          }),
          ...(scoringConfig && { scoringConfig: scoringConfig as any }),
          version: { increment: 1 },
        },
      });

      if (tournamentIds !== undefined) {
        await tx.seriesTournament.deleteMany({ where: { seriesId: id } });
        if (tournamentIds.length > 0) {
          await tx.seriesTournament.createMany({
            data: tournamentIds.map((tId, idx) => ({
              seriesId: id,
              tournamentId: tId,
              sequenceOrder: idx + 1,
            })),
          });
        }
      }

      this.logger.log(`Updated Series ${id} to version ${updated.version}`);
      const presigned = await this.presignSeriesMedia(updated);
      let resolvedTournamentIds = tournamentIds;
      if (resolvedTournamentIds === undefined) {
        const currentLinks = await tx.seriesTournament.findMany({
          where: { seriesId: id },
          orderBy: { sequenceOrder: 'asc' },
          select: { tournamentId: true },
        });
        resolvedTournamentIds = Array.isArray(currentLinks)
          ? currentLinks.map((l) => l.tournamentId)
          : [];
      }
      return {
        ...presigned,
        tournamentIds: resolvedTournamentIds,
      };
    });
  }

  async updateSeriesStatus(id: string, dto: UpdateSeriesStatusDto) {
    const series = await this.prisma.series.findUnique({ where: { id } });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${id}' not found`);
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== series.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${dto.expectedVersion}, but current version is ${series.version}`,
      });
    }

    // State machine check
    const validTransitions: Record<SeriesStatus, SeriesStatus[]> = {
      [SeriesStatus.DRAFT]: [SeriesStatus.UPCOMING, SeriesStatus.ACTIVE],
      [SeriesStatus.UPCOMING]: [SeriesStatus.ACTIVE, SeriesStatus.ARCHIVED],
      [SeriesStatus.ACTIVE]: [SeriesStatus.COMPLETED, SeriesStatus.ARCHIVED],
      [SeriesStatus.COMPLETED]: [SeriesStatus.ARCHIVED, SeriesStatus.ACTIVE],
      [SeriesStatus.ARCHIVED]: [],
    };

    if (
      series.status !== dto.status &&
      !validTransitions[series.status]?.includes(dto.status)
    ) {
      throw new BadRequestException(
        `Invalid status transition from ${series.status} to ${dto.status}.`,
      );
    }

    const updated = await this.prisma.series.update({
      where: { id },
      data: {
        status: dto.status,
        version: { increment: 1 },
      },
    });

    this.logger.log(
      `Series ${id} status updated to ${dto.status}. Reason: ${dto.reason || 'None'}`,
    );

    return {
      id: updated.id,
      status: updated.status,
      version: updated.version,
    };
  }

  /**
   * 3.2 Series Tournament Association
   */
  async getSeriesTournaments(seriesId: string) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const linked = await this.prisma.seriesTournament.findMany({
      where: { seriesId },
      orderBy: { sequenceOrder: 'asc' },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            status: true,
            startDate: true,
            numberOfTeams: true,
            schedule: true,
          },
        },
      },
    });

    const tournaments = linked.map((l) => {
      const t = l.tournament;
      let winner: { playerId: string; gamertag?: string } | null = null;
      if (t?.status === 'COMPLETED' && t.schedule) {
        const schedule = t.schedule as any;
        const finalMatch = (schedule.matches || []).find(
          (m: any) =>
            m.round === 'Final' ||
            m.round === 'Grand Final' ||
            m.nextMatchWinnerTargetId === null,
        );
        if (finalMatch?.winnerRef?.value) {
          winner = {
            playerId: finalMatch.winnerRef.value,
            gamertag: finalMatch.winnerRef.displayName || 'Champion',
          };
        }
      }

      return {
        id: t.tournamentId,
        name: t.name,
        status: t.status,
        startDate: t.startDate,
        weightMultiplier: l.weightMultiplier,
        participantsCount: t.numberOfTeams,
        sequenceOrder: l.sequenceOrder,
        winner,
      };
    });

    return { tournaments };
  }

  async linkTournaments(seriesId: string, dto: LinkTournamentsDto) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    // Verify all tournament IDs exist
    const tournaments = await this.prisma.tournament.findMany({
      where: { tournamentId: { in: dto.tournamentIds } },
    });
    if (tournaments.length !== dto.tournamentIds.length) {
      throw new BadRequestException('One or more tournament IDs do not exist');
    }

    const currentCount = await this.prisma.seriesTournament.count({
      where: { seriesId },
    });

    const scoringConfig = series.scoringConfig as any;
    const records = dto.tournamentIds.map((tournId, idx) => ({
      seriesId,
      tournamentId: tournId,
      sequenceOrder: currentCount + idx + 1,
      weightMultiplier:
        scoringConfig?.weighting?.[tournId] !== undefined
          ? Number(scoringConfig.weighting[tournId])
          : 1.0,
    }));

    await this.prisma.seriesTournament.createMany({
      data: records,
      skipDuplicates: true,
    });

    return this.getSeriesTournaments(seriesId);
  }

  async reorderTournaments(seriesId: string, dto: ReorderTournamentsDto) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    await this.prisma.$transaction(
      dto.orderedTournamentIds.map((tournamentId, idx) =>
        this.prisma.seriesTournament.update({
          where: {
            seriesId_tournamentId: {
              seriesId,
              tournamentId,
            },
          },
          data: {
            sequenceOrder: idx + 1,
          },
        }),
      ),
    );

    return this.getSeriesTournaments(seriesId);
  }

  async unlinkTournament(seriesId: string, tournamentId: string) {
    const link = await this.prisma.seriesTournament.findUnique({
      where: {
        seriesId_tournamentId: {
          seriesId,
          tournamentId,
        },
      },
    });

    if (!link) {
      throw new NotFoundException(
        `Tournament '${tournamentId}' is not linked to Series '${seriesId}'`,
      );
    }

    await this.prisma.seriesTournament.delete({
      where: {
        seriesId_tournamentId: {
          seriesId,
          tournamentId,
        },
      },
    });

    // Auto recalculate series standings after tournament unlinked
    await this.recalculateSeriesStandings(seriesId, true);

    return {
      unlinkedTournamentId: tournamentId,
      seriesId,
    };
  }

  /**
   * 3.3 Series Participants Management
   */
  async getSeriesParticipants(
    seriesId: string,
    query: QuerySeriesParticipantDto,
  ) {
    const {
      status,
      qualificationStatus,
      approved,
      search,
      page = 1,
      limit = 25,
    } = query;
    const skip = (page - 1) * limit;

    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const where: Prisma.SeriesParticipantWhereInput = {
      seriesId,
      ...(status && { status }),
      ...(qualificationStatus && { qualificationStatus }),
      ...(approved !== undefined && { approved }),
      ...(search && {
        player: {
          OR: [
            { gamerTag: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [totalItems, participants] = await Promise.all([
      this.prisma.seriesParticipant.count({ where }),
      this.prisma.seriesParticipant.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ currentRank: 'asc' }, { totalPoints: 'desc' }],
        include: {
          player: {
            select: {
              playerId: true,
              gamerTag: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    // Build rich details for each participant
    const items = participants.map((p) => {
      const playerName =
        `${p.player.firstName} ${p.player.lastName}`.trim() ||
        p.player.gamerTag ||
        'Player';

      return {
        id: p.id,
        seriesId: p.seriesId,
        playerId: p.playerId,
        playerName,
        playerGamerTag: p.player.gamerTag || playerName,
        playerAvatar: null,
        status: p.status,
        approved: p.approved,
        tournamentsEntered: p.tournamentsEntered,
        tournamentsCompleted: p.tournamentsCompleted,
        eventsMissed: p.eventsMissed,
        qualificationStatus: p.qualificationStatus,
        wins: p.wins,
        podiums: p.podiums,
        goalsFor: p.goalsFor,
        goalsAgainst: p.goalsAgainst,
        goalDifference: p.goalDifference,
        totalPoints: p.totalPoints,
        currentRank: p.currentRank,
        previousRank: p.previousRank,
        movement: p.movement,
        lastTournamentPoints: p.lastTournamentPoints,
      };
    });

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      pagination: {
        totalItems,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async updateSeriesParticipant(
    seriesId: string,
    participantId: string,
    dto: UpdateSeriesParticipantDto,
  ) {
    const participant = await this.prisma.seriesParticipant.findFirst({
      where: {
        id: participantId,
        seriesId,
      },
    });

    if (!participant) {
      throw new NotFoundException(
        `Participant '${participantId}' not found in Series '${seriesId}'`,
      );
    }

    const updated = await this.prisma.seriesParticipant.update({
      where: { id: participantId },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.qualificationStatus && {
          qualificationStatus: dto.qualificationStatus,
        }),
        ...(dto.approved !== undefined && { approved: dto.approved }),
        ...(dto.reason && { disqualificationReason: dto.reason }),
      },
    });

    return {
      id: updated.id,
      seriesId: updated.seriesId,
      playerId: updated.playerId,
      status: updated.status,
      qualificationStatus: updated.qualificationStatus,
      approved: updated.approved,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * 3.4 Series Points Engine, Leaderboard & Adjustments
   */
  async getSeriesLeaderboard(seriesId: string) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const participants = await this.prisma.seriesParticipant.findMany({
      where: { seriesId, status: 'ACTIVE' },
      orderBy: [{ currentRank: 'asc' }, { totalPoints: 'desc' }],
      include: {
        player: {
          select: {
            playerId: true,
            gamerTag: true,
            firstName: true,
            lastName: true,
          },
        },
        adjustments: true,
      },
    });

    const standings = participants.map((p, idx) => {
      const manualAdjustments = p.adjustments.reduce(
        (sum, a) => sum + a.points,
        0,
      );
      const tournamentPoints = Math.max(0, p.totalPoints - manualAdjustments);

      return {
        rank: p.currentRank || idx + 1,
        previousRank: p.previousRank || idx + 1,
        movement: p.movement,
        participantId: p.id,
        playerId: p.playerId,
        gamertag: p.player.gamerTag || `${p.player.firstName} ${p.player.lastName}`.trim(),
        playerName: `${p.player.firstName} ${p.player.lastName}`.trim(),
        avatarUrl: null,
        tournamentsCount: p.tournamentsCompleted,
        pointsBreakdown: {
          tournamentsTotal: tournamentPoints,
          manualAdjustments,
          bonuses: 0,
        },
        totalPoints: p.totalPoints,
        tiebreakerStats: {
          wins: p.wins,
          goalDifference: p.goalDifference,
          goalsFor: p.goalsFor,
        },
      };
    });

    return {
      seriesId: series.id,
      scoringMethod: series.scoringMethod,
      bestNResults: series.bestNResults,
      lastRecalculatedAt: series.updatedAt,
      standings,
    };
  }

  /**
   * Recalculates all series standings based on linked completed tournaments.
   * Handles CUMULATIVE and BEST_N_RESULTS, tiebreakers, rank movement calculation.
   */
  async recalculateSeriesStandings(seriesId: string, forceAll = true) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        tournaments: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            tournament: true,
          },
        },
      },
    });

    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const scoringConfig = series.scoringConfig as any;
    const placementPointsMap: Record<string, number> =
      scoringConfig?.placementPoints || {
        '1': 100,
        '2': 80,
        '3': 65,
        '4': 50,
        '5': 35,
        '6': 30,
        '7': 25,
        '8': 20,
      };

    const participationPoints = scoringConfig?.participationPoints || 0;
    const matchWinPoints = scoringConfig?.matchWinPoints || 3;
    const matchDrawPoints = scoringConfig?.matchDrawPoints || 1;
    const matchLossPoints = scoringConfig?.matchLossPoints || 0;
    const championBonus = scoringConfig?.bonusRules?.championBonus || 0;

    // Filter completed tournaments or forceAll
    const targetTournaments = series.tournaments.filter(
      (st) => forceAll || st.tournament.status === 'COMPLETED',
    );

    // Map: playerId -> { scores: number[], wins: number, goalsFor: number, goalsAgainst: number, enteredCount: number, completedCount: number }
    const playerStatsMap = new Map<
      string,
      {
        tournamentScores: number[];
        wins: number;
        podiums: number;
        goalsFor: number;
        goalsAgainst: number;
        tournamentsEntered: number;
        tournamentsCompleted: number;
        lastTournamentPoints: number;
      }
    >();

    for (const link of targetTournaments) {
      const tourn = link.tournament;
      const weight = link.weightMultiplier || 1.0;
      const schedule = (tourn.schedule as any) || {};
      const matches: any[] = schedule.matches || [];

      // Registrations for this tournament
      const regs = await this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: tourn.tournamentId },
      });

      for (const reg of regs) {
        if (!playerStatsMap.has(reg.playerId)) {
          playerStatsMap.set(reg.playerId, {
            tournamentScores: [],
            wins: 0,
            podiums: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            tournamentsEntered: 0,
            tournamentsCompleted: 0,
            lastTournamentPoints: 0,
          });
        }
        const stats = playerStatsMap.get(reg.playerId)!;
        stats.tournamentsEntered += 1;
        if (tourn.status === 'COMPLETED') {
          stats.tournamentsCompleted += 1;
        }

        let eventScore = 0;
        if (tourn.status === 'COMPLETED') {
          eventScore += participationPoints;
        }

        // Tally match statistics for this player
        for (const m of matches) {
          const isP1 =
            m.participant1Ref?.value === reg.playerId ||
            m.participant1Ref?.displayName?.includes(reg.playerId);
          const isP2 =
            m.participant2Ref?.value === reg.playerId ||
            m.participant2Ref?.displayName?.includes(reg.playerId);

          if (isP1 || isP2) {
            const myScore = isP1 ? m.score1 ?? 0 : m.score2 ?? 0;
            const oppScore = isP1 ? m.score2 ?? 0 : m.score1 ?? 0;
            stats.goalsFor += myScore;
            stats.goalsAgainst += oppScore;

            if (m.status === 'COMPLETED') {
              if (myScore > oppScore) {
                stats.wins += 1;
                eventScore += matchWinPoints;
              } else if (myScore === oppScore) {
                eventScore += matchDrawPoints;
              } else {
                eventScore += matchLossPoints;
              }
            }
          }
        }

        // Final standing placement
        const finalMatch = matches.find(
          (m) =>
            m.round === 'Final' ||
            m.round === 'Grand Final' ||
            m.nextMatchWinnerTargetId === null,
        );
        if (finalMatch && finalMatch.status === 'COMPLETED') {
          const isChamp = finalMatch.winnerRef?.value === reg.playerId;
          const isRunnerUp = finalMatch.loserRef?.value === reg.playerId;

          if (isChamp) {
            eventScore += (placementPointsMap['1'] || 100) + championBonus;
            stats.podiums += 1;
          } else if (isRunnerUp) {
            eventScore += placementPointsMap['2'] || 80;
            stats.podiums += 1;
          }
        }

        const weightedEventScore = Math.round(eventScore * weight);
        stats.tournamentScores.push(weightedEventScore);
        stats.lastTournamentPoints = weightedEventScore;
      }
    }

    // Now reconcile with existing SeriesParticipants
    const existingParticipants =
      await this.prisma.seriesParticipant.findMany({
        where: { seriesId },
        include: { adjustments: true },
      });

    const existingMap = new Map(
      existingParticipants.map((p) => [p.playerId, p]),
    );

    // Auto-enroll participants who played in tournaments if open series
    for (const [playerId] of playerStatsMap) {
      if (!existingMap.has(playerId)) {
        const created = await this.prisma.seriesParticipant.create({
          data: {
            seriesId,
            playerId,
            status: 'ACTIVE',
            approved: true,
          },
          include: { adjustments: true },
        });
        existingMap.set(playerId, created);
      }
    }

    // Calculate final scores for each participant
    const rankedList: Array<{
      participantId: string;
      playerId: string;
      totalPoints: number;
      wins: number;
      podiums: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      tournamentsEntered: number;
      tournamentsCompleted: number;
      lastTournamentPoints: number;
      previousRank: number | null;
    }> = [];

    for (const [playerId, participant] of existingMap) {
      const stats = playerStatsMap.get(playerId) || {
        tournamentScores: [],
        wins: 0,
        podiums: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        tournamentsEntered: 0,
        tournamentsCompleted: 0,
        lastTournamentPoints: 0,
      };

      let basePoints = 0;
      if (
        series.scoringMethod === 'BEST_N_RESULTS' &&
        series.bestNResults > 0
      ) {
        const sortedScores = [...stats.tournamentScores].sort((a, b) => b - a);
        basePoints = sortedScores
          .slice(0, series.bestNResults)
          .reduce((sum, score) => sum + score, 0);
      } else {
        basePoints = stats.tournamentScores.reduce(
          (sum, score) => sum + score,
          0,
        );
      }

      // Add manual adjustments
      const adjustmentTotal = participant.adjustments.reduce(
        (acc, adj) => acc + adj.points,
        0,
      );
      const totalPoints = basePoints + adjustmentTotal;
      const goalDifference = stats.goalsFor - stats.goalsAgainst;

      rankedList.push({
        participantId: participant.id,
        playerId,
        totalPoints,
        wins: stats.wins,
        podiums: stats.podiums,
        goalsFor: stats.goalsFor,
        goalsAgainst: stats.goalsAgainst,
        goalDifference,
        tournamentsEntered: stats.tournamentsEntered,
        tournamentsCompleted: stats.tournamentsCompleted,
        lastTournamentPoints: stats.lastTournamentPoints,
        previousRank: participant.currentRank,
      });
    }

    // Sort: Total Points DESC, Wins DESC, Goal Difference DESC, Goals For DESC
    rankedList.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    let changesDetected = 0;

    // Save rankings & movements
    await this.prisma.$transaction(
      rankedList.map((item, idx) => {
        const currentRank = idx + 1;
        const previousRank = item.previousRank;

        let movement: 'up' | 'down' | 'same' = 'same';
        if (previousRank !== null && previousRank !== undefined) {
          if (currentRank < previousRank) {
            movement = 'up';
            changesDetected += 1;
          } else if (currentRank > previousRank) {
            movement = 'down';
            changesDetected += 1;
          }
        }

        const isQualified =
          item.tournamentsCompleted >= series.minimumEventsRequired;

        return this.prisma.seriesParticipant.update({
          where: { id: item.participantId },
          data: {
            totalPoints: item.totalPoints,
            wins: item.wins,
            podiums: item.podiums,
            goalsFor: item.goalsFor,
            goalsAgainst: item.goalsAgainst,
            goalDifference: item.goalDifference,
            tournamentsEntered: item.tournamentsEntered,
            tournamentsCompleted: item.tournamentsCompleted,
            lastTournamentPoints: item.lastTournamentPoints,
            currentRank,
            previousRank: previousRank ?? currentRank,
            movement,
            qualificationStatus: isQualified ? 'QUALIFIED' : 'PROVISIONAL',
          },
        });
      }),
    );

    // Update series updatedAt timestamp
    await this.prisma.series.update({
      where: { id: seriesId },
      data: { updatedAt: new Date() },
    });

    this.logger.log(
      `Recalculated series ${seriesId}: ${rankedList.length} participants processed, ${changesDetected} rank shifts detected.`,
    );

    return {
      seriesId,
      participantsProcessed: rankedList.length,
      recalculatedAt: new Date(),
      changesDetected,
    };
  }

  async createPointAdjustment(
    seriesId: string,
    dto: CreateSeriesAdjustmentDto,
    createdBy = 'ADMIN',
  ) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const targetId = dto.participantId || dto.playerId;
    if (!targetId) {
      throw new BadRequestException('Either participantId or playerId is required');
    }

    let participant = await this.prisma.seriesParticipant.findFirst({
      where: {
        seriesId,
        OR: [{ id: targetId }, { playerId: targetId }],
      },
    });

    if (!participant) {
      const playerExists = await this.prisma.player.findUnique({
        where: { playerId: targetId },
      });
      if (playerExists) {
        participant = await this.prisma.seriesParticipant.create({
          data: {
            seriesId,
            playerId: targetId,
            status: 'ACTIVE',
            approved: true,
            totalPoints: 0,
          },
        });
      }
    }

    if (!participant) {
      throw new NotFoundException(
        `Participant '${targetId}' not found in Series '${seriesId}'`,
      );
    }

    const adjustment = await this.prisma.seriesPointAdjustment.create({
      data: {
        seriesId,
        participantId: participant.id,
        points: dto.points,
        reason: dto.reason,
        createdBy,
      },
    });

    // Update participant total points
    const updated = await this.prisma.seriesParticipant.update({
      where: { id: participant.id },
      data: {
        totalPoints: { increment: dto.points },
      },
    });

    return {
      adjustmentId: adjustment.id,
      participantId: updated.id,
      points: adjustment.points,
      newTotalPoints: updated.totalPoints,
      createdAt: adjustment.createdAt,
    };
  }

  async getPointAdjustments(seriesId: string) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const adjustments = await this.prisma.seriesPointAdjustment.findMany({
      where: { seriesId },
      orderBy: { createdAt: 'desc' },
      include: {
        participant: {
          include: {
            player: {
              select: {
                playerId: true,
                gamerTag: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return {
      adjustments: adjustments.map((a) => ({
        id: a.id,
        seriesId: a.seriesId,
        participantId: a.participantId,
        playerName: `${a.participant.player.firstName} ${a.participant.player.lastName}`.trim(),
        gamerTag: a.participant.player.gamerTag,
        points: a.points,
        reason: a.reason,
        createdBy: a.createdBy,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * 3.5 Scoring Configuration Management
   */
  async getScoringConfig(seriesId: string) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { id: true, name: true, scoringConfig: true },
    });
    if (!series) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }
    return {
      seriesId: series.id,
      seriesName: series.name,
      scoringConfig: series.scoringConfig,
    };
  }

  async updateScoringConfig(
    seriesId: string,
    dto: UpdateSeriesScoringConfigDto,
  ) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const updated = await this.prisma.series.update({
      where: { id: seriesId },
      data: {
        scoringConfig: dto as any,
        version: { increment: 1 },
      },
    });

    return {
      scoringConfigId: `cfg-${seriesId}`,
      updatedAt: updated.updatedAt,
      version: updated.version,
    };
  }

  /**
   * 3.6 Series Publishing & Public Fan Portal
   */
  async getPublicationSettings(seriesId: string) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      include: { publication: true },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    if (!series.publication) {
      return {
        seriesId: series.id,
        enabled: false,
        publicSlug: series.code.toLowerCase(),
        status: 'NOT_PUBLISHED',
        publishedAt: null,
        lastUpdatedAt: series.updatedAt,
      };
    }

    const pub = series.publication;
    const settings = (pub.settings as any) || {};

    return {
      seriesId: series.id,
      enabled: pub.enabled,
      publicSlug: pub.publicSlug,
      status: pub.status,
      publishedAt: pub.publishedAt,
      lastUpdatedAt: pub.updatedAt,
      ...settings,
    };
  }

  async updatePublicationSettings(
    seriesId: string,
    dto: UpdateSeriesPublicationDto,
  ) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    // Check slug uniqueness
    const existingSlug = await this.prisma.seriesPublication.findFirst({
      where: {
        publicSlug: dto.publicSlug,
        seriesId: { not: seriesId },
      },
    });
    if (existingSlug) {
      throw new ConflictException(
        `Public slug '${dto.publicSlug}' is already claimed by another series.`,
      );
    }

    const { enabled, publicSlug, status = 'PUBLISHED', ...settings } = dto;

    const publication = await this.prisma.seriesPublication.upsert({
      where: { seriesId },
      create: {
        seriesId,
        enabled,
        publicSlug,
        status: status as any,
        settings: settings as any,
        publishedAt: enabled ? new Date() : null,
      },
      update: {
        enabled,
        publicSlug,
        status: status as any,
        settings: settings as any,
        ...(enabled && { publishedAt: new Date() }),
      },
    });

    // Also update published boolean on Series
    await this.prisma.series.update({
      where: { id: seriesId },
      data: { published: enabled },
    });

    return {
      publicSlug: publication.publicSlug,
      publicUrl: `https://tape-esports.com/series/${publication.publicSlug}`,
      embedUrl: `https://tape-esports.com/embed/series/${publication.publicSlug}`,
      status: publication.status,
      updatedAt: publication.updatedAt,
    };
  }

  async getPublicSeriesBySlug(slug: string) {
    const pub = await this.prisma.seriesPublication.findUnique({
      where: { publicSlug: slug },
      include: {
        series: {
          include: {
            tournaments: {
              orderBy: { sequenceOrder: 'asc' },
              include: {
                tournament: {
                  select: {
                    tournamentId: true,
                    name: true,
                    status: true,
                    startDate: true,
                    numberOfTeams: true,
                    schedule: true,
                  },
                },
              },
            },
            participants: {
              where: { status: 'ACTIVE' },
              orderBy: [{ currentRank: 'asc' }, { totalPoints: 'desc' }],
              include: {
                player: {
                  select: {
                    playerId: true,
                    gamerTag: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!pub || !pub.enabled || pub.series.isDeleted) {
      throw new NotFoundException(`Public series '${slug}' not found or is currently private`);
    }

    const series = pub.series;
    const settings = (pub.settings as any) || {};

    const presigned = await this.presignSeriesMedia(series);

    // Apply privacy toggles
    const publicData: Record<string, any> = {
      seriesId: series.id,
      name: series.name,
      code: series.code,
      startDate: series.startDate,
      endDate: series.endDate,
      status: series.status,
      scoringMethod: series.scoringMethod,
      publishedAt: pub.publishedAt,
    };

    if (settings.showSeriesLogo !== false) {
      publicData.logoUrl = presigned.logoUrl;
    }
    if (settings.showCoverImage !== false) {
      publicData.imageUrl = presigned.imageUrl;
    }
    if (settings.showSeriesDescription !== false) {
      publicData.description = series.description;
    }

    if (settings.showTournamentList !== false) {
      publicData.tournaments = series.tournaments.map((t) => ({
        id: t.tournamentId,
        name: t.tournament.name,
        status: t.tournament.status,
        startDate: t.tournament.startDate,
        participantsCount: t.tournament.numberOfTeams,
      }));
    }

    if (settings.showLeaderboard !== false) {
      const limit = settings.leaderboardLimit > 0 ? settings.leaderboardLimit : undefined;
      const list = limit ? series.participants.slice(0, limit) : series.participants;
      publicData.leaderboard = list.map((p, idx) => ({
        rank: p.currentRank || idx + 1,
        movement: settings.showRankMovement !== false ? p.movement : undefined,
        gamertag: p.player.gamerTag || `${p.player.firstName} ${p.player.lastName}`.trim(),
        totalPoints: p.totalPoints,
        wins: p.wins,
        podiums: p.podiums,
        goalDifference: p.goalDifference,
      }));
    }

    return publicData;
  }
}
