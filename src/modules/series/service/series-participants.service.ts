import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateSeriesParticipantDto } from '../dto/update-participant.dto';
import { CreateSeriesAdjustmentDto } from '../dto/create-adjustment.dto';
import { QuerySeriesParticipantDto } from '../dto/query-participant.dto';
import { Prisma } from '@prisma/client';
import { getPreSignedUrl } from '../../utils/s3.util';

@Injectable()
export class SeriesParticipantsService {
  private readonly logger = new Logger(SeriesParticipantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists participants enrolled or qualified in this series with breakdown data
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

    const linkedTournaments = await this.prisma.seriesTournament.findMany({
      where: { seriesId },
      orderBy: { sequenceOrder: 'asc' },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            status: true,
            schedule: true,
          },
        },
      },
    });

    const playerIds = participants.map((p) => p.playerId);
    const tournamentIds = linkedTournaments.map((lt) => lt.tournamentId);

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId: { in: tournamentIds },
        playerId: { in: playerIds },
      },
      select: {
        tournamentId: true,
        playerId: true,
        playerPhotoUrl: true,
      },
    });

    const regMap = new Set(
      registrations.map((r) => `${r.playerId}_${r.tournamentId}`),
    );
    const photoMap = new Map(
      registrations
        .filter((r) => r.playerPhotoUrl)
        .map((r) => [r.playerId, r.playerPhotoUrl]),
    );

    const scoringConfig = (series.scoringConfig as any) || {};
    const placementPointsMap: Record<string, number> =
      scoringConfig.placementPoints || {
        '1': 100,
        '2': 80,
        '3': 65,
        '4': 50,
        '5': 35,
        '6': 30,
        '7': 25,
        '8': 20,
      };
    const participationPoints = scoringConfig.participationPoints || 0;
    const championBonus = scoringConfig.bonusRules?.championBonus || 0;

    const items = await Promise.all(
      participants.map(async (p) => {
        const playerName =
          `${p.player.firstName} ${p.player.lastName}`.trim() ||
          p.player.gamerTag ||
          'Player';

        let playerAvatar: string | null = null;
        if (photoMap.has(p.playerId)) {
          const rawPhoto = photoMap.get(p.playerId)!;
          playerAvatar = rawPhoto.startsWith('http')
            ? rawPhoto
            : await getPreSignedUrl(rawPhoto).catch(() => rawPhoto);
        }

        const tournamentResults = linkedTournaments.map((lt) => {
          const t = lt.tournament;
          const isRegistered = regMap.has(`${p.playerId}_${t.tournamentId}`);
          let finishPosition: number | null = null;
          let pointsAwarded = 0;

          if (isRegistered) {
            if (t.status === 'COMPLETED' && t.schedule) {
              const schedule = t.schedule as any;
              const matches = schedule.matches || [];
              const finalMatch = matches.find(
                (m: any) =>
                  m.round === 'Final' ||
                  m.round === 'Grand Final' ||
                  m.nextMatchWinnerTargetId === null,
              );
              if (finalMatch) {
                if (finalMatch.winnerRef?.value === p.playerId) {
                  finishPosition = 1;
                } else if (finalMatch.loserRef?.value === p.playerId) {
                  finishPosition = 2;
                }
              }

              let pts =
                (finishPosition &&
                  placementPointsMap[String(finishPosition)]) ||
                0;
              pts += participationPoints;
              if (finishPosition === 1) pts += championBonus;
              pointsAwarded = Math.round(pts * (lt.weightMultiplier || 1.0));
            }

            return {
              tournamentId: t.tournamentId,
              tournamentName: t.name,
              participated: true,
              finishPosition,
              pointsAwarded,
            };
          } else {
            return {
              tournamentId: t.tournamentId,
              tournamentName: t.name,
              participated: false,
              finishPosition: null,
              pointsAwarded: 0,
            };
          }
        });

        return {
          id: p.id,
          seriesId: p.seriesId,
          playerId: p.playerId,
          playerName,
          playerGamerTag: p.player.gamerTag || playerName,
          playerAvatar,
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
          tournamentResults,
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
   * Update participant qualification, approval, or status
   */
  async updateSeriesParticipant(
    seriesId: string,
    participantId: string,
    dto: UpdateSeriesParticipantDto,
  ) {
    const participant = await this.prisma.seriesParticipant.findFirst({
      where: {
        seriesId,
        OR: [{ id: participantId }, { playerId: participantId }],
      },
    });

    if (!participant) {
      throw new NotFoundException(
        `Participant '${participantId}' not found in Series '${seriesId}'`,
      );
    }

    const updated = await this.prisma.seriesParticipant.update({
      where: { id: participant.id },
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
   * Applies a manual point adjustment (+/- points) with an administrative reason
   */
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
      throw new BadRequestException(
        'Either participantId or playerId is required',
      );
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

  /**
   * Lists audit log of all manual point adjustments
   */
  async getPointAdjustments(
    seriesId: string,
    query?: { page?: number | string; limit?: number | string },
  ) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series || series.isDeleted) {
      throw new NotFoundException(`Series with ID '${seriesId}' not found`);
    }

    const total = await this.prisma.seriesPointAdjustment.count({
      where: { seriesId },
    });

    const isPaginated = query?.page !== undefined || query?.limit !== undefined;
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 20);
    const skip = (page - 1) * limit;

    const adjustments = await this.prisma.seriesPointAdjustment.findMany({
      where: { seriesId },
      orderBy: { createdAt: 'desc' },
      ...(isPaginated ? { skip, take: limit } : {}),
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

    const pagination = isPaginated
      ? {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        }
      : undefined;

    return {
      adjustments: adjustments.map((a) => ({
        id: a.id,
        seriesId: a.seriesId,
        participantId: a.participantId,
        playerName:
          `${a.participant.player.firstName} ${a.participant.player.lastName}`.trim(),
        gamerTag: a.participant.player.gamerTag,
        points: a.points,
        reason: a.reason,
        createdBy: a.createdBy,
        createdAt: a.createdAt,
      })),
      pagination,
      meta: pagination,
    };
  }
}
