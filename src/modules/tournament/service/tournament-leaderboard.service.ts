import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TournamentLeaderboardService {
  private readonly logger = new Logger(TournamentLeaderboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all completed and scored matches of a tournament.
   */
  async getTournamentResults(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] = schedule.structure?.matches || schedule.matches || [];

    return matches.filter(
      (m: any) =>
        m.status === 'COMPLETED' || (m.score1 !== null && m.score2 !== null),
    );
  }

  /**
   * Computes standings / leaderboard table and performance analytics from tournament matches.
   * Supports filtering by 'table', 'goals', or 'metrics'.
   */
  async getTournamentLeaderboard(
    tournamentId: string,
    filter?: string,
    query?: { page?: number | string; limit?: number | string },
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: {
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
          },
        },
      },
    });

    const playerMap = new Map<
      string,
      { name: string; gamertag: string; photo?: string }
    >();
    for (const reg of registrations) {
      if (reg.playerId && reg.player) {
        playerMap.set(reg.playerId, {
          name: `${reg.player.firstName} ${reg.player.lastName}`.trim(),
          gamertag: reg.player.gamerTag || reg.player.firstName,
          photo: reg.playerPhotoUrl || undefined,
        });
      }
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];
    const participants: any[] =
      schedule.participants || schedule.structure?.participants || [];

    const statsMap = new Map<
      string,
      {
        playerId: string;
        name: string;
        gamertag: string;
        playerPhotoUrl?: string;
        rank: number;
        played: number;
        wins: number;
        won: number;
        draws: number;
        drawn: number;
        losses: number;
        lost: number;
        goalsFor: number;
        goalsAgainst: number;
        goalDifference: number;
        cleanSheets: number;
        points: number;
        form: ('W' | 'L' | 'D')[];
      }
    >();

    const getOrInitStats = (id: string, defaultName: string) => {
      if (!statsMap.has(id)) {
        const playerInfo = playerMap.get(id);
        statsMap.set(id, {
          playerId: id,
          name: playerInfo?.name || defaultName,
          gamertag: playerInfo?.gamertag || defaultName,
          playerPhotoUrl: playerInfo?.photo,
          rank: 0,
          played: 0,
          wins: 0,
          won: 0,
          draws: 0,
          drawn: 0,
          losses: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          cleanSheets: 0,
          points: 0,
          form: [],
        });
      }
      return statsMap.get(id)!;
    };

    // Initialize all participants
    for (const p of participants) {
      getOrInitStats(p.id, p.name || p.displayName || p.id);
    }

    // Process completed matches
    for (const match of matches) {
      if (
        match.status === 'COMPLETED' ||
        (match.score1 !== null && match.score2 !== null)
      ) {
        const p1Id =
          match.player1Id ||
          match.participant1Ref?.id ||
          match.participant1Ref?.value;
        const p2Id =
          match.player2Id ||
          match.participant2Ref?.id ||
          match.participant2Ref?.value;

        if (!p1Id || !p2Id) continue;

        const p1Name =
          match.player1Name || match.participant1Ref?.name || `Player ${p1Id}`;
        const p2Name =
          match.player2Name || match.participant2Ref?.name || `Player ${p2Id}`;

        const s1 = Number(match.score1) || 0;
        const s2 = Number(match.score2) || 0;

        const p1Stats = getOrInitStats(p1Id, p1Name);
        const p2Stats = getOrInitStats(p2Id, p2Name);

        p1Stats.played += 1;
        p2Stats.played += 1;
        p1Stats.goalsFor += s1;
        p1Stats.goalsAgainst += s2;
        p2Stats.goalsFor += s2;
        p2Stats.goalsAgainst += s1;

        if (s2 === 0) p1Stats.cleanSheets += 1;
        if (s1 === 0) p2Stats.cleanSheets += 1;

        if (s1 > s2) {
          p1Stats.wins += 1;
          p1Stats.won += 1;
          p1Stats.points += 3;
          p1Stats.form.push('W');

          p2Stats.losses += 1;
          p2Stats.lost += 1;
          p2Stats.form.push('L');
        } else if (s2 > s1) {
          p2Stats.wins += 1;
          p2Stats.won += 1;
          p2Stats.points += 3;
          p2Stats.form.push('W');

          p1Stats.losses += 1;
          p1Stats.lost += 1;
          p1Stats.form.push('L');
        } else {
          p1Stats.draws += 1;
          p1Stats.drawn += 1;
          p1Stats.points += 1;
          p1Stats.form.push('D');

          p2Stats.draws += 1;
          p2Stats.drawn += 1;
          p2Stats.points += 1;
          p2Stats.form.push('D');
        }

        p1Stats.goalDifference = p1Stats.goalsFor - p1Stats.goalsAgainst;
        p2Stats.goalDifference = p2Stats.goalsFor - p2Stats.goalsAgainst;
      }
    }

    const sortedStandings = Array.from(statsMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    sortedStandings.forEach((entry, idx) => {
      entry.rank = idx + 1;
      if (entry.form.length > 5) {
        entry.form = entry.form.slice(-5);
      }
    });

    // Compute Top Scorers (Goals Table)
    const topScorers = [...sortedStandings]
      .filter((p) => p.goalsFor > 0 || p.played > 0)
      .sort((a, b) => b.goalsFor - a.goalsFor || a.played - b.played)
      .map((p, idx) => ({
        rank: idx + 1,
        playerId: p.playerId,
        gamertag: p.gamertag,
        name: p.name,
        playerPhotoUrl: p.playerPhotoUrl,
        matches: p.played,
        played: p.played,
        goals: p.goalsFor,
        goalsFor: p.goalsFor,
        gpm: p.played > 0 ? Number((p.goalsFor / p.played).toFixed(2)) : 0,
      }));

    // Compute Performance Panel Analytics (Metrics View)
    const analytics = sortedStandings.map((p) => {
      const gpm = p.played > 0 ? Number((p.goalsFor / p.played).toFixed(2)) : 0;
      const gapm =
        p.played > 0 ? Number((p.goalsAgainst / p.played).toFixed(2)) : 0;
      const gdpm =
        p.played > 0 ? Number((p.goalDifference / p.played).toFixed(2)) : 0;
      const winRate =
        p.played > 0 ? Number(((p.wins / p.played) * 100).toFixed(1)) : 0;
      return {
        ...p,
        gpm,
        gapm,
        gdpm,
        winRate,
      };
    });

    const goldenBoot = [...analytics].sort((a, b) => b.goalsFor - a.goalsFor)[0];
    const goldenGlove = [...analytics].sort(
      (a, b) => b.cleanSheets - a.cleanSheets || a.goalsAgainst - b.goalsAgainst,
    )[0];
    const mostClinical = [...analytics].sort((a, b) => b.gdpm - a.gdpm)[0];

    const awards = {
      goldenBoot: goldenBoot
        ? {
            playerId: goldenBoot.playerId,
            name: goldenBoot.gamertag,
            goals: goldenBoot.goalsFor,
            gpm: goldenBoot.gpm,
          }
        : null,
      goldenGlove: goldenGlove
        ? {
            playerId: goldenGlove.playerId,
            name: goldenGlove.gamertag,
            cleanSheets: goldenGlove.cleanSheets,
            gapm: goldenGlove.gapm,
          }
        : null,
      mostClinical: mostClinical
        ? {
            playerId: mostClinical.playerId,
            name: mostClinical.gamertag,
            gdpm: mostClinical.gdpm,
          }
        : null,
    };

    const normalizedFilter = filter?.toLowerCase()?.trim();

    const isPaginated = query?.page !== undefined || query?.limit !== undefined;
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 20);
    const skip = (page - 1) * limit;

    const totalStandings = sortedStandings.length;
    const paginatedStandings = isPaginated
      ? sortedStandings.slice(skip, skip + limit)
      : sortedStandings;

    const totalGoals = topScorers.length;
    const paginatedGoals = isPaginated
      ? topScorers.slice(skip, skip + limit)
      : topScorers;

    const pagination = isPaginated
      ? {
          total: normalizedFilter === 'goals' ? totalGoals : totalStandings,
          page,
          limit,
          totalPages: Math.ceil(
            (normalizedFilter === 'goals' ? totalGoals : totalStandings) / limit,
          ),
        }
      : undefined;

    if (normalizedFilter === 'table') {
      return {
        filter: 'table',
        standings: paginatedStandings,
        table: paginatedStandings,
        pagination,
        meta: pagination,
      };
    }

    if (normalizedFilter === 'goals') {
      return {
        filter: 'goals',
        goals: paginatedGoals,
        topScorers: paginatedGoals,
        goldenBoot: awards.goldenBoot,
        pagination,
        meta: pagination,
      };
    }

    if (normalizedFilter === 'metrics') {
      return {
        filter: 'metrics',
        metrics: analytics,
        analytics,
        awards,
        pagination,
        meta: pagination,
      };
    }

    return {
      filter: 'all',
      standings: paginatedStandings,
      table: paginatedStandings,
      goals: paginatedGoals,
      topScorers: paginatedGoals,
      metrics: analytics,
      analytics,
      awards,
      pagination,
      meta: pagination,
    };
  }
}
