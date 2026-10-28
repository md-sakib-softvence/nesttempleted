import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateSeriesScoringConfigDto } from '../dto/update-scoring-config.dto';

@Injectable()
export class SeriesLeaderboardService {
  private readonly logger = new Logger(SeriesLeaderboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authoritative series leaderboard from series points engine
   */
  async getSeriesLeaderboard(
    seriesId: string,
    query?: { page?: number | string; limit?: number | string },
  ) {
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
        gamertag:
          p.player.gamerTag ||
          `${p.player.firstName} ${p.player.lastName}`.trim(),
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

    const total = standings.length;
    let paginatedStandings = standings;
    let pagination: any = undefined;

    if (query?.page !== undefined || query?.limit !== undefined) {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Number(query.limit) || 20);
      const skip = (page - 1) * limit;
      paginatedStandings = standings.slice(skip, skip + limit);
      pagination = {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return {
      seriesId: series.id,
      scoringMethod: series.scoringMethod,
      bestNResults: series.bestNResults,
      lastRecalculatedAt: series.updatedAt,
      standings: paginatedStandings,
      pagination,
      meta: pagination,
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

    const targetTournaments = series.tournaments.filter(
      (st) => forceAll || st.tournament.status === 'COMPLETED',
    );

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

        for (const m of matches) {
          const isP1 =
            m.participant1Ref?.value === reg.playerId ||
            m.participant1Ref?.displayName?.includes(reg.playerId);
          const isP2 =
            m.participant2Ref?.value === reg.playerId ||
            m.participant2Ref?.displayName?.includes(reg.playerId);

          if (isP1 || isP2) {
            const myScore = isP1 ? (m.score1 ?? 0) : (m.score2 ?? 0);
            const oppScore = isP1 ? (m.score2 ?? 0) : (m.score1 ?? 0);
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

    const existingParticipants = await this.prisma.seriesParticipant.findMany({
      where: { seriesId },
      include: { adjustments: true },
    });

    const existingMap = new Map(
      existingParticipants.map((p) => [p.playerId, p]),
    );

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

    rankedList.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    let changesDetected = 0;

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

  /**
   * Fetches series scoring rules configuration
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

  /**
   * Updates scoring configuration and triggers version increment
   */
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
      seriesId: updated.id,
      version: updated.version,
      scoringConfig: updated.scoringConfig,
    };
  }
}
