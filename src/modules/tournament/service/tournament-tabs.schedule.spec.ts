import { TournamentTabsService } from './tournament-tabs.service';

describe('schedule tab participant contract', () => {
  it('keeps unresolved slot IDs null and hydrates every calendar card before pagination', async () => {
    const matches = [1, 2].map((n) => ({
      id: `m${n}`,
      round: 'Group Stage',
      status: 'SCHEDULED',
      participant1Ref: { type: 'TOURNAMENT_SLOT', value: '1' },
      participant2Ref: { type: 'TOURNAMENT_SLOT', value: '2' },
      score1: null,
      score2: null,
    }));
    const schedule = {
      structure: {
        slots: [
          {
            slotNumber: 1,
            participantId: 'real-player',
            participantName: 'Alice',
          },
          { slotNumber: 2 },
        ],
        seeds: [],
        matches,
      },
      calendar: [
        {
          screens: [
            {
              days: [
                {
                  date: '2026-11-21',
                  timeslots: matches.map((m) => ({
                    canonicalMatchId: m.id,
                    game: { id: m.id, player1Id: 'TBD', player1Name: 'TBD' },
                  })),
                },
              ],
            },
          ],
        },
      ],
    };
    const prisma = {
      tournament: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ tournamentId: 't', schedule, venues: [] }),
      },
    };
    const service = new TournamentTabsService(
      prisma as any,
      null as any,
      null as any,
      null as any,
    );
    const result = await service.getScheduleTab('t', { limit: 1 } as any);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].player1).toMatchObject({
      id: 'real-player',
      name: 'Alice',
    });
    expect(result.matches[0].player2).toMatchObject({
      id: null,
      name: 'Slot #2',
    });
    const slots = result.calendar.raw[0].screens[0].days[0].timeslots;
    for (const slot of slots) {
      expect(slot.game).toMatchObject({
        player1Id: 'real-player',
        player1Name: 'Alice',
        player2Id: null,
        player2Name: 'Slot #2',
      });
    }
  });
});
