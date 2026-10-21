import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateSeriesPublicationDto } from '../dto/update-publication.dto';

@Injectable()
export class SeriesPublicationService {
  private readonly logger = new Logger(SeriesPublicationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetches publication display settings
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

  /**
   * Saves display toggles, custom public URL slug, embed preferences, and publish status
   */
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

    const existingPub = await this.prisma.seriesPublication.findUnique({
      where: { seriesId },
    });

    const slugToUse =
      dto.publicSlug ||
      existingPub?.publicSlug ||
      series.code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const enabledToUse =
      dto.enabled !== undefined ? dto.enabled : (existingPub?.enabled ?? false);

    const existingSlug = await this.prisma.seriesPublication.findFirst({
      where: {
        publicSlug: slugToUse,
        seriesId: { not: seriesId },
      },
    });
    if (existingSlug) {
      throw new ConflictException(
        `Public slug '${slugToUse}' is already claimed by another series.`,
      );
    }

    const { enabled: _e, publicSlug: _ps, status = 'PUBLISHED', ...settings } = dto;

    const publication = await this.prisma.seriesPublication.upsert({
      where: { seriesId },
      create: {
        seriesId,
        enabled: enabledToUse,
        publicSlug: slugToUse,
        status: status as any,
        settings: settings as any,
        publishedAt: enabledToUse ? new Date() : null,
      },
      update: {
        enabled: enabledToUse,
        publicSlug: slugToUse,
        status: status as any,
        settings: settings as any,
        ...(enabledToUse && { publishedAt: new Date() }),
      },
    });

    await this.prisma.series.update({
      where: { id: seriesId },
      data: { published: enabledToUse },
    });

    return {
      publicSlug: publication.publicSlug,
      publicUrl: `https://tape-esports.com/series/${publication.publicSlug}`,
      embedUrl: `https://tape-esports.com/embed/series/${publication.publicSlug}`,
      status: publication.status,
      updatedAt: publication.updatedAt,
    };
  }

  /**
   * Fan-facing public portal page for series standings and schedule
   */
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

    if (!pub || !pub.enabled || pub.status !== 'PUBLISHED') {
      throw new NotFoundException(`Public series portal '${slug}' is not published or active`);
    }

    const series = pub.series;
    const settings = (pub.settings as any) || {};

    const limit = settings.leaderboardLimit || 0;
    const filteredParticipants =
      limit > 0 ? series.participants.slice(0, limit) : series.participants;

    const tournaments = settings.showTournamentList
      ? series.tournaments.map((l) => ({
          name: l.tournament.name,
          status: l.tournament.status,
          startDate: l.tournament.startDate,
          sequenceOrder: l.sequenceOrder,
        }))
      : [];

    const leaderboard = settings.showLeaderboard
      ? filteredParticipants.map((p, idx) => ({
          rank: p.currentRank || idx + 1,
          gamertag:
            p.player.gamerTag ||
            `${p.player.firstName} ${p.player.lastName}`.trim(),
          totalPoints: p.totalPoints,
          movement: settings.showRankMovement ? p.movement : undefined,
          wins: p.wins,
        }))
      : [];

    return {
      title: series.name,
      slug: pub.publicSlug,
      description: settings.showSeriesDescription ? series.description : undefined,
      dates: settings.showSeriesDates
        ? {
            startDate: series.startDate,
            endDate: series.endDate,
          }
        : undefined,
      logoUrl: settings.showSeriesLogo ? series.logoUrl : undefined,
      coverUrl: settings.showCoverImage ? series.imageUrl : undefined,
      scoringModel: series.scoringMethod,
      tournaments,
      leaderboard,
      embedTheme: settings.embedTheme || 'dark',
      embedCompact: settings.embedCompact || false,
      lastUpdatedAt: pub.updatedAt,
    };
  }
}
