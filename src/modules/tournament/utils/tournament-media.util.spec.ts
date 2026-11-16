import {
  presignTournamentMedia,
  extractStorageKey,
  syncTournamentLifecycleState,
} from './tournament-media.util';

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

  it('should extract storage key from S3 pre-signed URLs while keeping raw keys intact', () => {
    const presignedUrl =
      'https://my-bucket.s3.us-east-1.amazonaws.com/74cbf62c-e09a-4737-8628-c49e7931e325.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc';
    expect(extractStorageKey(presignedUrl)).toBe(
      '74cbf62c-e09a-4737-8628-c49e7931e325.png',
    );
    expect(extractStorageKey('74cbf62c-e09a-4737-8628-c49e7931e325.png')).toBe(
      '74cbf62c-e09a-4737-8628-c49e7931e325.png',
    );
  });

  describe('syncTournamentLifecycleState (registrationOpen vs status synchronization)', () => {
    it('should transition status to REGISTRATION_CLOSE and keep registrationOpen false when registrationOpen is false', () => {
      const result = syncTournamentLifecycleState({
        status: 'REGISTRATION_OPEN',
        registrationOpen: false,
      });
      expect(result.status).toBe('REGISTRATION_CLOSE');
      expect(result.registrationOpen).toBe(false);
    });

    it('should transition status to REGISTRATION_OPEN and keep registrationOpen true when registrationOpen is true', () => {
      const result = syncTournamentLifecycleState({
        status: 'UPCOMING',
        registrationOpen: true,
      });
      expect(result.status).toBe('REGISTRATION_OPEN');
      expect(result.registrationOpen).toBe(true);
    });

    it('reopens a closed registration', () => {
      const result = syncTournamentLifecycleState(
        { registrationOpen: true, status: undefined },
        { status: 'REGISTRATION_CLOSE', registrationOpen: false },
      );
      expect(result.status).toBe('REGISTRATION_OPEN');
      expect(result.registrationOpen).toBe(true);
    });

    it('closes registration when updating only the flag', () => {
      const result = syncTournamentLifecycleState(
        { registrationOpen: false, status: undefined },
        { status: 'REGISTRATION_OPEN', registrationOpen: true },
      );
      expect(result.status).toBe('REGISTRATION_CLOSE');
    });

    it('should force registrationOpen to true when status is set to REGISTRATION_OPEN', () => {
      const result = syncTournamentLifecycleState({
        status: 'REGISTRATION_OPEN',
      });
      expect(result.status).toBe('REGISTRATION_OPEN');
      expect(result.registrationOpen).toBe(true);
    });

    it('should force registrationOpen to false when status is UPCOMING and registrationOpen is not specified', () => {
      const result = syncTournamentLifecycleState({
        status: 'UPCOMING',
      });
      expect(result.status).toBe('UPCOMING');
      expect(result.registrationOpen).toBe(false);
    });

    it('should force registrationOpen to false for IN_PROGRESS, ONGOING, COMPLETED', () => {
      expect(
        syncTournamentLifecycleState({
          status: 'IN_PROGRESS',
          registrationOpen: true,
        }).registrationOpen,
      ).toBe(false);

      expect(
        syncTournamentLifecycleState({
          status: 'COMPLETED',
          registrationOpen: true,
        }).registrationOpen,
      ).toBe(false);
    });
  });
});
