import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSeriesDto } from '../dto/create-series.dto';
import { UpdateSeriesDto } from '../dto/update-series.dto';
import { UpdateSeriesStatusDto } from '../dto/update-series-status.dto';
import { QuerySeriesDto } from '../dto/query-series.dto';
import { SeriesStatus, Prisma } from '@prisma/client';
import { getPreSignedUrl } from '../../utils/s3.util';

@Injectable()
export class SeriesCoreService {
  private readonly logger = new Logger(SeriesCoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to presign URLs if stored on S3
   */
  async presignSeriesMedia<T extends Record<string, any>>(series: T): Promise<T> {
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
   * Create a new Series with transactional tournament linking
   */
  async createSeries(dto: CreateSeriesDto) {
    const rawTournamentIds =
      dto.tournamentIds && dto.tournamentIds.length > 0
        ? dto.tournamentIds
        : Array.isArray(dto.tournaments)
          ? dto.tournaments
              .map((t: any) => (typeof t === 'object' && t ? t.id || t.tournamentId : t))
              .filter(Boolean)
          : [];
    const tournamentIds = rawTournamentIds;
    const {
      tournamentIds: _tIds,
      tournaments: _tournaments,
      scoringConfig,
      logo: _logo,
      image: _image,
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      isDeleted: _isDeleted,
      currentLeader: _currentLeader,
      tournamentsCount: _tournamentsCount,
      participantsCount: _participantsCount,
      completedTournamentsCount: _completedTournamentsCount,
      participants: _participants,
      publication: _publication,
      pointAdjustments: _pointAdjustments,
      ...rest
    } = dto as any;

    const resolvedLogoUrl =
      dto.logoUrl || (typeof (dto as any).logo === 'string' ? (dto as any).logo : undefined);
    const resolvedImageUrl =
      dto.imageUrl || (typeof (dto as any).image === 'string' ? (dto as any).image : undefined);

    const existing = await this.prisma.series.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `Series with code '${dto.code}' already exists. Please choose a unique code.`,
      );
    }

    const dataToCreate: Prisma.SeriesCreateInput = {
      name: rest.name,
      code: rest.code,
      ...(rest.description !== undefined && { description: rest.description }),
      ...(rest.status !== undefined && { status: rest.status }),
      ...(rest.participantType !== undefined && { participantType: rest.participantType }),
      ...(rest.participationMode !== undefined && { participationMode: rest.participationMode }),
      ...(rest.minimumEventsRequired !== undefined && {
        minimumEventsRequired: rest.minimumEventsRequired,
      }),
      ...(rest.scoringMethod !== undefined && { scoringMethod: rest.scoringMethod }),
      ...(rest.bestNResults !== undefined && { bestNResults: rest.bestNResults }),
      ...(rest.published !== undefined && { published: rest.published }),
      ...(resolvedLogoUrl !== undefined && { logoUrl: resolvedLogoUrl }),
      ...(resolvedImageUrl !== undefined && { imageUrl: resolvedImageUrl }),
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
    };

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.create({
        data: dataToCreate,
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

  /**
   * Retrieve paginated series list with leader summaries
   */
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

  /**
   * Get single series details with tournaments, participants, and publication data
   */
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
              },
            },
          },
        },
        participants: {
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
        },
        publication: true,
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
    const tournamentIds = (series.tournaments || []).map((t) => t.tournamentId);
    const completedTournamentsCount = (series.tournaments || []).filter(
      (t) => t.tournament?.status === 'COMPLETED',
    ).length;

    const formattedParticipants = (series.participants || []).map((p) => {
      const playerName =
        `${p.player?.firstName || ''} ${p.player?.lastName || ''}`.trim() ||
        p.player?.gamerTag ||
        'Player';
      return {
        id: p.id,
        seriesId: p.seriesId,
        playerId: p.playerId,
        playerName,
        playerGamerTag: p.player?.gamerTag || playerName,
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

    const leader = formattedParticipants[0];
    const currentLeader = leader
      ? {
          playerId: leader.playerId,
          gamertag: leader.playerGamerTag,
          totalPoints: leader.totalPoints,
          wins: leader.wins,
        }
      : null;

    const publication = series.publication
      ? {
          seriesId: series.id,
          enabled: series.publication.enabled,
          publicSlug: series.publication.publicSlug,
          status: series.publication.status,
          publishedAt: series.publication.publishedAt,
          lastUpdatedAt: series.publication.updatedAt,
          ...((series.publication.settings as any) || {}),
        }
      : {
          seriesId: series.id,
          enabled: false,
          publicSlug: series.code.toLowerCase(),
          status: 'NOT_PUBLISHED',
          publishedAt: null,
          lastUpdatedAt: series.updatedAt,
        };

    return {
      ...presigned,
      tournamentIds,
      tournamentsCount: series._count?.tournaments ?? tournamentIds.length,
      completedTournamentsCount,
      participantsCount:
        series._count?.participants ?? formattedParticipants.length,
      currentLeader,
      participants: formattedParticipants,
      publication,
    };
  }

  /**
   * Update editable properties of a series with optimistic locking
   */
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

    let resolvedTournaments = dto.tournamentIds;
    if (resolvedTournaments === undefined && (dto as any).tournaments !== undefined) {
      resolvedTournaments = Array.isArray((dto as any).tournaments)
        ? (dto as any).tournaments
            .map((t: any) => (typeof t === 'object' && t ? t.id || t.tournamentId : t))
            .filter(Boolean)
        : [];
    }
    const tournamentIds = resolvedTournaments;
    const {
      expectedVersion,
      tournamentIds: _tIds,
      tournaments: _tournaments,
      scoringConfig,
      logo: _logo,
      image: _image,
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      isDeleted: _isDeleted,
      currentLeader: _currentLeader,
      tournamentsCount: _tournamentsCount,
      participantsCount: _participantsCount,
      completedTournamentsCount: _completedTournamentsCount,
      participants: _participants,
      publication: _publication,
      pointAdjustments: _pointAdjustments,
      ...rest
    } = dto as any;

    const resolvedLogoUrl =
      dto.logoUrl || (typeof (dto as any).logo === 'string' ? (dto as any).logo : undefined);
    const resolvedImageUrl =
      dto.imageUrl || (typeof (dto as any).image === 'string' ? (dto as any).image : undefined);

    const dataToUpdate: Prisma.SeriesUpdateInput = {
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.code !== undefined && { code: rest.code }),
      ...(rest.description !== undefined && { description: rest.description }),
      ...(rest.status !== undefined && { status: rest.status }),
      ...(rest.participantType !== undefined && { participantType: rest.participantType }),
      ...(rest.participationMode !== undefined && { participationMode: rest.participationMode }),
      ...(rest.minimumEventsRequired !== undefined && {
        minimumEventsRequired: rest.minimumEventsRequired,
      }),
      ...(rest.scoringMethod !== undefined && { scoringMethod: rest.scoringMethod }),
      ...(rest.bestNResults !== undefined && { bestNResults: rest.bestNResults }),
      ...(rest.published !== undefined && { published: rest.published }),
      ...(resolvedLogoUrl !== undefined && { logoUrl: resolvedLogoUrl }),
      ...(resolvedImageUrl !== undefined && { imageUrl: resolvedImageUrl }),
      ...(dto.startDate && { startDate: new Date(dto.startDate) }),
      ...(dto.endDate !== undefined && {
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      }),
      ...(scoringConfig && { scoringConfig: scoringConfig as any }),
      version: { increment: 1 },
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.series.update({
        where: { id },
        data: dataToUpdate,
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

  /**
   * Update series lifecycle status with state machine validation
   */
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

    const validTransitions: Record<SeriesStatus, SeriesStatus[]> = {
      [SeriesStatus.DRAFT]: [SeriesStatus.UPCOMING, SeriesStatus.ACTIVE],
      [SeriesStatus.UPCOMING]: [SeriesStatus.ACTIVE, SeriesStatus.ARCHIVED],
      [SeriesStatus.ACTIVE]: [SeriesStatus.COMPLETED, SeriesStatus.ARCHIVED],
      [SeriesStatus.COMPLETED]: [SeriesStatus.ARCHIVED],
      [SeriesStatus.ARCHIVED]: [],
    };

    const allowed = validTransitions[series.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from '${series.status}' to '${dto.status}'. Allowed transitions: [${allowed.join(', ')}]`,
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
      `Status updated for Series ${id}: ${series.status} -> ${updated.status}`,
    );
    return this.presignSeriesMedia(updated);
  }
}
