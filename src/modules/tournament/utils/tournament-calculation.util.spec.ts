import { TournamentFormat } from '@prisma/client';
import {
  calculateLeagueMatches,
  calculateSingleEliminationMatches,
  calculateDoubleEliminationMatches,
  calculateHybridMatches,
  calculateTournamentExpectedMatches,
  calculateCapacity,
  calculateDayTimeslots,
  generatePlayingDates,
  generateCanonicalStructure,
} from './tournament-calculation.util';

describe('Tournament Calculations (tape eSports Calculation.docx specifications)', () => {
  describe('Pure Mathematical Formulas from Document', () => {
    it('League Single: 16 players = 120, 8 players = 28', () => {
      expect(calculateLeagueMatches(16, false)).toBe(120);
      expect(calculateLeagueMatches(8, false)).toBe(28);

      const res16 = calculateTournamentExpectedMatches(
        TournamentFormat.LEAGUE,
        16,
      );
      expect(res16.guaranteedMatchCount).toBe(120);
      expect(res16.conditionalMatchCount).toBe(0);
      expect(res16.maximumPossibleMatchCount).toBe(120);
      expect(res16.totalCompetitionMatches).toBe(120);

      const res8 = calculateTournamentExpectedMatches(
        TournamentFormat.LEAGUE,
        8,
      );
      expect(res8.guaranteedMatchCount).toBe(28);
      expect(res8.maximumPossibleMatchCount).toBe(28);
    });

    it('League Double: 16 players = 240, 8 players = 56', () => {
      expect(calculateLeagueMatches(16, true)).toBe(240);
      expect(calculateLeagueMatches(8, true)).toBe(56);

      const res16 = calculateTournamentExpectedMatches(
        TournamentFormat.LEAGUE_DOUBLE,
        16,
      );
      expect(res16.guaranteedMatchCount).toBe(240);
      expect(res16.conditionalMatchCount).toBe(0);
      expect(res16.maximumPossibleMatchCount).toBe(240);

      const res8 = calculateTournamentExpectedMatches(
        TournamentFormat.LEAGUE_DOUBLE,
        8,
      );
      expect(res8.guaranteedMatchCount).toBe(56);
      expect(res8.maximumPossibleMatchCount).toBe(56);
    });

    it('Single Elimination: 16 players = 15 (16 with 3rd place), 8 players = 7 (8 with 3rd place)', () => {
      // 16 players
      expect(calculateSingleEliminationMatches(16, false)).toBe(15);
      expect(calculateSingleEliminationMatches(16, true)).toBe(16);

      // 8 players
      expect(calculateSingleEliminationMatches(8, false)).toBe(7);
      expect(calculateSingleEliminationMatches(8, true)).toBe(8);

      const res16Without3rd = calculateTournamentExpectedMatches(
        TournamentFormat.SINGLE_ELIMINATION,
        16,
        { thirdPlacePlayoffEnabled: false },
      );
      expect(res16Without3rd.guaranteedMatchCount).toBe(15);
      expect(res16Without3rd.maximumPossibleMatchCount).toBe(15);

      const res16With3rd = calculateTournamentExpectedMatches(
        TournamentFormat.SINGLE_ELIMINATION,
        16,
        { thirdPlacePlayoffEnabled: true },
      );
      expect(res16With3rd.guaranteedMatchCount).toBe(16);
      expect(res16With3rd.maximumPossibleMatchCount).toBe(16);
    });

    it('Single Elimination non-power-of-two: 12 players = 11 playable (12 with 3rd place, with four BYEs)', () => {
      expect(calculateSingleEliminationMatches(12, false)).toBe(11);
      expect(calculateSingleEliminationMatches(12, true)).toBe(12);

      const res12 = calculateTournamentExpectedMatches(
        TournamentFormat.SINGLE_ELIMINATION,
        12,
        { thirdPlacePlayoffEnabled: false },
      );
      expect(res12.guaranteedMatchCount).toBe(11);

      // Verify canonical structure generates 11 playable schedulable matches with 4 auto-advance BYEs
      const struct = generateCanonicalStructure(
        't-12',
        TournamentFormat.SINGLE_ELIMINATION,
        12,
        undefined,
        undefined,
        false,
      );
      expect(struct.summary.schedulableMatches).toBe(11);
      expect(struct.summary.autoAdvanceCount).toBe(4);
    });

    it('Double Elimination: 8 players = 14 guaranteed, 1 conditional GF reset, 15 max', () => {
      const de8 = calculateDoubleEliminationMatches(8, true);
      expect(de8.guaranteedMatchCount).toBe(14);
      expect(de8.conditionalMatchCount).toBe(1);
      expect(de8.maximumPossibleMatchCount).toBe(15);

      const exp8 = calculateTournamentExpectedMatches(
        TournamentFormat.DOUBLE_ELIMINATION,
        8,
        { hasGrandFinalReset: true },
      );
      expect(exp8.guaranteedMatchCount).toBe(14);
      expect(exp8.conditionalMatchCount).toBe(1);
      expect(exp8.maximumPossibleMatchCount).toBe(15);

      // Canonical structure check for 8 players
      const struct8 = generateCanonicalStructure(
        't-de8',
        TournamentFormat.DOUBLE_ELIMINATION,
        8,
      );
      expect(struct8.summary.guaranteedMatchCount).toBe(14);
      expect(struct8.summary.conditionalMatchCount).toBe(1);
      expect(struct8.summary.maximumPossibleMatchCount).toBe(15);
    });

    it('Double Elimination: 128 players = 254 guaranteed, 1 conditional GF reset, 255 max', () => {
      const de128 = calculateDoubleEliminationMatches(128, true);
      expect(de128.guaranteedMatchCount).toBe(254);
      expect(de128.conditionalMatchCount).toBe(1);
      expect(de128.maximumPossibleMatchCount).toBe(255);

      const exp128 = calculateTournamentExpectedMatches(
        TournamentFormat.DOUBLE_ELIMINATION,
        128,
        { hasGrandFinalReset: true },
      );
      expect(exp128.guaranteedMatchCount).toBe(254);
      expect(exp128.conditionalMatchCount).toBe(1);
      expect(exp128.maximumPossibleMatchCount).toBe(255);
    });

    it('Hybrid Single: 16 players (4 groups of 4, top 2) = 31 without 3rd place, 32 with it', () => {
      // 4 groups of 4:
      // Group stage: 4 * (4*3/2) = 24
      // 8 knockout entrants: 8 - 1 = 7
      // Total: 24 + 7 = 31 (32 with 3rd place)
      const h16No3rd = calculateHybridMatches(16, {
        groupsCount: 4,
        qualifiersPerGroup: 2,
        isDouble: false,
        thirdPlacePlayoffEnabled: false,
      });
      expect(h16No3rd.groupStageMatches).toBe(24);
      expect(h16No3rd.knockoutMatches).toBe(7);
      expect(h16No3rd.guaranteedMatchCount).toBe(31);

      const h16With3rd = calculateHybridMatches(16, {
        groupsCount: 4,
        qualifiersPerGroup: 2,
        isDouble: false,
        thirdPlacePlayoffEnabled: true,
      });
      expect(h16With3rd.groupStageMatches).toBe(24);
      expect(h16With3rd.knockoutMatches).toBe(8);
      expect(h16With3rd.guaranteedMatchCount).toBe(32);

      const exp16 = calculateTournamentExpectedMatches(
        TournamentFormat.LEAGUE_AND_KNOCKOUT,
        16,
        { groupsCount: 4, qualifiersPerGroup: 2, thirdPlacePlayoffEnabled: true },
      );
      expect(exp16.guaranteedMatchCount).toBe(32);
      expect(exp16.maximumPossibleMatchCount).toBe(32);
    });

    it('Hybrid Single: 8 players (2 groups of 4, top 2) = 15 without 3rd place, 16 with it', () => {
      // 2 groups of 4:
      // Group: 2 * (4*3/2) = 12
      // 4 knockout entrants: 4 - 1 = 3
      // Total: 12 + 3 = 15 (16 with 3rd place)
      const h8No3rd = calculateHybridMatches(8, {
        groupsCount: 2,
        qualifiersPerGroup: 2,
        isDouble: false,
        thirdPlacePlayoffEnabled: false,
      });
      expect(h8No3rd.groupStageMatches).toBe(12);
      expect(h8No3rd.knockoutMatches).toBe(3);
      expect(h8No3rd.guaranteedMatchCount).toBe(15);

      const h8With3rd = calculateHybridMatches(8, {
        groupsCount: 2,
        qualifiersPerGroup: 2,
        isDouble: false,
        thirdPlacePlayoffEnabled: true,
      });
      expect(h8With3rd.groupStageMatches).toBe(12);
      expect(h8With3rd.knockoutMatches).toBe(4);
      expect(h8With3rd.guaranteedMatchCount).toBe(16);
    });

    it('Double Hybrid: 16 players (4 groups of 4, top 2) = 48 group + 8 QF + 4 SF + 1 final = 61 (62 with 3rd)', () => {
      // Double RR groups: 4 * 4 * 3 = 48
      // QF: 4 * 2 = 8
      // SF: 2 * 2 = 4
      // Final: 1
      // Total: 48 + 8 + 4 + 1 = 61 (62 with 3rd place)
      const dh16No3rd = calculateHybridMatches(16, {
        groupsCount: 4,
        qualifiersPerGroup: 2,
        isDouble: true,
        thirdPlacePlayoffEnabled: false,
      });
      expect(dh16No3rd.groupStageMatches).toBe(48);
      expect(dh16No3rd.knockoutMatches).toBe(13); // 8 QF + 4 SF + 1 Final
      expect(dh16No3rd.guaranteedMatchCount).toBe(61);

      const dh16With3rd = calculateHybridMatches(16, {
        groupsCount: 4,
        qualifiersPerGroup: 2,
        isDouble: true,
        thirdPlacePlayoffEnabled: true,
      });
      expect(dh16With3rd.groupStageMatches).toBe(48);
      expect(dh16With3rd.knockoutMatches).toBe(14);
      expect(dh16With3rd.guaranteedMatchCount).toBe(62);
    });

    it('Double Hybrid: 8 players (2 groups of 4, top 2) = 24 group + 4 SF + 1 final = 29 (30 with 3rd)', () => {
      // Double RR groups: 2 * 4 * 3 = 24
      // SF: 2 * 2 = 4
      // Final: 1
      // Total: 24 + 4 + 1 = 29 (30 with 3rd place)
      const dh8No3rd = calculateHybridMatches(8, {
        groupsCount: 2,
        qualifiersPerGroup: 2,
        isDouble: true,
        thirdPlacePlayoffEnabled: false,
      });
      expect(dh8No3rd.groupStageMatches).toBe(24);
      expect(dh8No3rd.knockoutMatches).toBe(5); // 4 SF + 1 Final
      expect(dh8No3rd.guaranteedMatchCount).toBe(29);

      const dh8With3rd = calculateHybridMatches(8, {
        groupsCount: 2,
        qualifiersPerGroup: 2,
        isDouble: true,
        thirdPlacePlayoffEnabled: true,
      });
      expect(dh8With3rd.groupStageMatches).toBe(24);
      expect(dh8With3rd.knockoutMatches).toBe(6);
      expect(dh8With3rd.guaranteedMatchCount).toBe(30);
    });
  });

  describe('Capacity and Timeslot Calculations (Part 2 of document)', () => {
    const venues = [
      {
        venueId: 'v1',
        name: 'Venue 1',
        screens: [
          { screenId: 's1', screenName: 'Screen 1' },
          { screenId: 's2', screenName: 'Screen 2' },
        ],
      },
      {
        venueId: 'v2',
        name: 'Venue 2',
        screens: [
          { screenId: 's3', screenName: 'Screen 1' },
          { screenId: 's4', screenName: 'Screen 2' },
        ],
      },
    ];

    it('calculates 18 slots/screen/day for 10:00-20:00 with 60 min lunch and 30 min match time', () => {
      const capacity = calculateCapacity({
        dailyStart: '10:00',
        dailyEnd: '20:00',
        slotDuration: 25,
        turnoverDuration: 5,
        lunchBreakTime: '14:00',
        lunchDuration: 60,
        venues,
        totalMatches: 56,
      });

      expect(capacity.matchTimeMinutes).toBe(30);
      expect(capacity.operatingMinutes).toBe(540);
      expect(capacity.slotsPerScreenPerDay).toBe(18);
      expect(capacity.totalScreens).toBe(4);
      expect(capacity.totalDailySlots).toBe(72);
      expect(capacity.totalPlayingDaysNeeded).toBe(1);
    });

    it('calculates 3 playing days needed for 150 matches', () => {
      const capacity = calculateCapacity({
        dailyStart: '10:00',
        dailyEnd: '20:00',
        slotDuration: 25,
        turnoverDuration: 5,
        lunchBreakTime: '14:00',
        lunchDuration: 60,
        venues,
        totalMatches: 150,
      });

      expect(capacity.totalDailySlots).toBe(72);
      expect(capacity.totalPlayingDaysNeeded).toBe(3);
    });

    it('generates exact timeslots skipping lunch break', () => {
      const timeslots = calculateDayTimeslots(
        '10:00',
        '20:00',
        25,
        5,
        '14:00',
        60,
      );

      expect(timeslots.length).toBe(18);
      expect(timeslots[0]).toBe('10:00');
      expect(timeslots[7]).toBe('13:30');
      expect(timeslots[8]).toBe('15:00');
      expect(timeslots[17]).toBe('19:30');
    });
  });
});
