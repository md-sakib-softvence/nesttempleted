import { SeriesLeaderboardService } from './series-leaderboard.service';

describe('SeriesLeaderboardService', () => {
  const activeParticipant = {
    id: 'participant-1',
    playerId: 'player-1',
    currentRank: 1,
    previousRank: 1,
    movement: 'same',
    totalPoints: 0,
    tournamentsCompleted: 0,
    wins: 0,
    goalDifference: 0,
    goalsFor: 0,
    adjustments: [],
    player: {
      playerId: 'player-1',
      gamerTag: 'player-one',
      firstName: 'Player',
      lastName: 'One',
    },
  };

  const createService = () => {
    const prisma = {
      series: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'series-1',
          isDeleted: false,
          scoringMethod: 'CUMULATIVE',
          bestNResults: 0,
          updatedAt: new Date('2026-11-10T00:00:00.000Z'),
        }),
      },
      seriesParticipant: {
        findMany: jest.fn(),
      },
      seriesTournament: {
        findMany: jest.fn(),
      },
      tournamentRegistration: {
        count: jest.fn(),
      },
    };

    return { prisma, service: new SeriesLeaderboardService(prisma as any) };
  };

  it('recalculates once when linked tournaments have registrations but no stored participants', async () => {
    const { prisma, service } = createService();
    prisma.seriesParticipant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeParticipant]);
    prisma.seriesTournament.findMany.mockResolvedValue([
      { tournamentId: 'tournament-1' },
    ]);
    prisma.tournamentRegistration.count.mockResolvedValue(1);
    const recalculate = jest
      .spyOn(service, 'recalculateSeriesStandings')
      .mockResolvedValue({} as any);

    const result = await service.getSeriesLeaderboard('series-1');

    expect(recalculate).toHaveBeenCalledWith('series-1', true);
    expect(result.standings).toHaveLength(1);
    expect(result.standings[0]).toMatchObject({
      playerId: 'player-1',
      gamertag: 'player-one',
      totalPoints: 0,
      tournamentsCount: 0,
    });
  });

  it('keeps an empty leaderboard read-only when linked tournaments have no registrations', async () => {
    const { prisma, service } = createService();
    prisma.seriesParticipant.findMany.mockResolvedValue([]);
    prisma.seriesTournament.findMany.mockResolvedValue([
      { tournamentId: 'tournament-1' },
    ]);
    prisma.tournamentRegistration.count.mockResolvedValue(0);
    const recalculate = jest.spyOn(service, 'recalculateSeriesStandings');

    const result = await service.getSeriesLeaderboard('series-1');

    expect(recalculate).not.toHaveBeenCalled();
    expect(result.standings).toEqual([]);
  });
});
