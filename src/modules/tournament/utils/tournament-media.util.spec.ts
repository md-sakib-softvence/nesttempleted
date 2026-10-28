import { presignTournamentMedia } from './tournament-media.util';

describe('presignTournamentMedia (Payload Optimization & On-Demand Slots/Seeds)', () => {
  const generateLargeTournament = () => {
    const slots = Array.from({ length: 254 }, (_, i) => ({
      id: `slot-${i + 1}`,
      slotNumber: i + 1,
      status: 'ASSIGNED',
      participantId: `player-${i + 1}`,
      participantName: `Player ${i + 1}`,
    }));

    const seeds = Array.from({ length: 128 }, (_, i) => ({
      source: `Seed ${i + 1}`,
      seedNumber: i + 1,
      slotNumber: i + 1,
      participantId: `player-${i + 1}`,
    }));

    return {
      tournamentId: 'tourney-254',
      name: 'Winter Fest 254',
      tournamentFormat: 'LEAGUE',
      numberOfTeams: 254,
      schedule: {
        slots,
        seeds,
        calendar: [],
      },
    };
  };

  it('should omit heavy slots and seeds by default for large tournaments (>32 teams)', async () => {
    const tourney = generateLargeTournament();
    const result = await presignTournamentMedia(tourney);

    expect(result.slots).toEqual([]);
    expect(result.seeds).toEqual([]);
    expect(result.slotSummary).toBeDefined();
    expect(result.slotSummary.totalSlots).toBe(254);
    expect(result.slotSummary.assignedSlots).toBe(254);
    expect(result.slotSummary.totalSeeds).toBe(128);
  });

  it('should include heavy slots and seeds when requested via include="slots,seeds"', async () => {
    const tourney = generateLargeTournament();
    const result = await presignTournamentMedia(tourney, {
      include: 'slots,seeds',
    });

    expect(result.slots.length).toBe(254);
    expect(result.seeds.length).toBe(128);
    expect(result.slots[0].id).toBe('slot-1');
  });

  it('should include all when requested via include="all"', async () => {
    const tourney = generateLargeTournament();
    const result = await presignTournamentMedia(tourney, {
      include: 'all',
    });

    expect(result.slots.length).toBe(254);
    expect(result.seeds.length).toBe(128);
  });

  it('should automatically embed slots and seeds for small tournaments (<= 32 teams)', async () => {
    const smallSlots = Array.from({ length: 16 }, (_, i) => ({
      id: `slot-${i + 1}`,
      slotNumber: i + 1,
      status: 'ASSIGNED',
    }));

    const smallTourney = {
      tournamentId: 'tourney-16',
      name: 'Small Cup',
      tournamentFormat: 'SINGLE_ELIMINATION',
      numberOfTeams: 16,
      schedule: {
        slots: smallSlots,
        seeds: [],
        calendar: [],
      },
    };

    const result = await presignTournamentMedia(smallTourney);
    expect(result.slots.length).toBe(16);
    expect(result.slotSummary.totalSlots).toBe(16);
  });
});
