import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LinkTournamentsDto } from '../dto/link-tournaments.dto';
import { ReorderTournamentsDto } from '../dto/reorder-tournaments.dto';

@Injectable()
export class SeriesTournamentsService {
  private readonly logger = new Logger(SeriesTournamentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all tournaments linked to this series in sequence order
   */
  async getSeriesTournaments(
    seriesId: string,
    query?: { page?: number | string; limit?: number | string },
  ) {
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

    const total = tournaments.length;
    let paginatedTournaments = tournaments;
    let pagination: any = undefined;

    if (query?.page !== undefined || query?.limit !== undefined) {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Number(query.limit) || 10);
      const skip = (page - 1) * limit;
      paginatedTournaments = tournaments.slice(skip, skip + limit);
      pagination = {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return {
      tournaments: paginatedTournaments,
      pagination,
      meta: pagination,
    };
  }

  /**
   * Links tournaments to the series
   */
  async linkTournaments(seriesId: string, dto: LinkTournamentsDto) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

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

  /**
   * Reorder the sequence of tournaments within the series
   */
  async reorderTournaments(seriesId: string, dto: ReorderTournamentsDto) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const rawTournaments = (dto as any)?.tournaments;
    const rawOrderedIds = dto?.orderedTournamentIds || (dto as any)?.tournamentIds;
    const incoming: Array<{ tournamentId: string; stageOrder: number }> =
      Array.isArray(rawTournaments)
        ? rawTournaments
        : Array.isArray(rawOrderedIds)
          ? rawOrderedIds.map((tId: string, i: number) => ({
              tournamentId: tId,
              stageOrder: i + 1,
            }))
          : [];

    await this.prisma.$transaction(
      incoming.map(({ tournamentId, stageOrder }, idx) =>
        this.prisma.seriesTournament.updateMany({
          where: {
            seriesId,
            tournamentId,
          },
          data: {
            sequenceOrder: stageOrder !== undefined ? stageOrder : idx + 1,
          },
        }),
      ),
    );

    return this.getSeriesTournaments(seriesId);
  }

  /**
   * Unlinks a tournament from the series
   */
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

    return {
      unlinkedTournamentId: tournamentId,
      seriesId,
    };
  }
}
