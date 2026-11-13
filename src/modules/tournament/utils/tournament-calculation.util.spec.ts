import { TournamentFormat } from '@prisma/client';
import {
  calculateLeagueMatches,
  calculateSingleEliminationMatches,
  calculateDoubleEliminationMatches,
  calculateHybridMatches,
  calculateTournamentExpectedMatches,
  calculateCapacity,
  calculateDayTimeslots,
  generateCanonicalStructure,
  largestPowerOfTwoNotExceeding,
  isPowerOfTwo,
  resolveDoubleEliminationPlacementRefs,
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
        {
          groupsCount: 4,
          qualifiersPerGroup: 2,
          thirdPlacePlayoffEnabled: true,
        },
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

  describe('Clean Unassigned Slots & Participants Resolution', () => {
    it('leaves all slots and seeds UNASSIGNED when tournament has no registered participants', () => {
      const struct = generateCanonicalStructure(
        't-empty',
        TournamentFormat.SINGLE_ELIMINATION,
        8,
        undefined,
        [],
        false,
      );

      expect(struct.slots.length).toBe(8);
      struct.slots.forEach((slot, index) => {
        expect(slot.status).toBe('UNASSIGNED');
        expect(slot.participantId).toBeUndefined();
        expect(slot.participantName).toBeUndefined();
        expect(slot.slotNumber).toBe(index + 1);
      });

      expect(struct.seeds.length).toBe(8);
      struct.seeds.forEach((seed) => {
        expect(seed.participantId).toBeUndefined();
      });

      // Matches should not have fake/dummy player IDs
      struct.matches.forEach((m) => {
        expect(m.player1Id).toBeUndefined();
        expect(m.player2Id).toBeUndefined();
        expect(m.selfSchedulingOpenedAt).toBeUndefined();
      });
    });
  });

  describe('v1.2.1 Engine Implementation Handoff Rules & Preliminary Rounds', () => {
    it('largestPowerOfTwoNotExceeding computes correct powers of 2', () => {
      expect(largestPowerOfTwoNotExceeding(20)).toBe(16);
      expect(largestPowerOfTwoNotExceeding(16)).toBe(16);
      expect(largestPowerOfTwoNotExceeding(15)).toBe(8);
      expect(largestPowerOfTwoNotExceeding(45)).toBe(32);
      expect(largestPowerOfTwoNotExceeding(2)).toBe(2);
      expect(largestPowerOfTwoNotExceeding(3)).toBe(2);
    });

    it('Golden Example: 40 teams, 10 groups, Top 2 = 79 matches (60 group + 19 KO without 3rd place)', () => {
      // 1. Math formulas
      const expNo3rd = calculateHybridMatches(40, {
        groupsCount: 10,
        qualifiersPerGroup: 2,
        isDouble: false,
        thirdPlacePlayoffEnabled: false,
      });
      expect(expNo3rd.groupStageMatches).toBe(60);
      expect(expNo3rd.knockoutMatches).toBe(19);
      expect(expNo3rd.guaranteedMatchCount).toBe(79);

      const expWith3rd = calculateHybridMatches(40, {
        groupsCount: 10,
        qualifiersPerGroup: 2,
        isDouble: false,
        thirdPlacePlayoffEnabled: true,
      });
      expect(expWith3rd.knockoutMatches).toBe(20);
      expect(expWith3rd.guaranteedMatchCount).toBe(80);

      // 2. Canonical Structure Generation
      const struct = generateCanonicalStructure(
        't-40',
        TournamentFormat.LEAGUE_AND_KNOCKOUT,
        40,
        10,
        undefined,
        false,
        { topQualifiers: 2 },
      );

      expect(struct.groups.length).toBe(10);
      expect(struct.summary.groupStageMatches).toBe(60);
      expect(struct.summary.knockoutMatches).toBe(19);
      expect(struct.summary.schedulableMatches).toBe(79);
      expect(struct.summary.autoAdvanceCount).toBe(0);

      // Verify 4 Preliminary Round matches
      const prelimMatches = struct.matches.filter(
        (m) => m.round === 'Preliminary Round',
      );
      expect(prelimMatches.length).toBe(4);

      // Check pairings: 13v20, 14v19, 15v18, 16v17
      // Seeds 1-10 are Group Winners (Group A #1 to Group J #1)
      // Seeds 11-20 are Runners-up (Group A #2 to Group J #2)
      // Seed 13 = Group C #2, Seed 20 = Group J #2
      expect(prelimMatches[0].participant1Ref.value).toBe('Group C #2');
      expect(prelimMatches[0].participant2Ref.value).toBe('Group J #2');

      // Seed 14 = Group D #2, Seed 19 = Group I #2
      expect(prelimMatches[1].participant1Ref.value).toBe('Group D #2');
      expect(prelimMatches[1].participant2Ref.value).toBe('Group I #2');

      // Seed 15 = Group E #2, Seed 18 = Group H #2
      expect(prelimMatches[2].participant1Ref.value).toBe('Group E #2');
      expect(prelimMatches[2].participant2Ref.value).toBe('Group H #2');

      // Seed 16 = Group F #2, Seed 17 = Group G #2
      expect(prelimMatches[3].participant1Ref.value).toBe('Group F #2');
      expect(prelimMatches[3].participant2Ref.value).toBe('Group G #2');

      // Verify Round of 16 matches (8 matches)
      const r16Matches = struct.matches.filter((m) => m.round === 'Round of 16');
      expect(r16Matches.length).toBe(8);

      // Match 1: Seed 1 (Group A #1) vs Winner of Prelim 4 (Match 4)
      expect(r16Matches[0].participant1Ref.value).toBe('Group A #1');
      expect(r16Matches[0].participant2Ref.value).toBe(prelimMatches[3].id);

      // Match 3: Seed 4 (Group D #1) vs Winner of Prelim 1 (Match 1)
      expect(r16Matches[2].participant1Ref.value).toBe('Group D #1');
      expect(r16Matches[2].participant2Ref.value).toBe(prelimMatches[0].id);

      // Match 5: Seed 2 (Group B #1) vs Winner of Prelim 3 (Match 3)
      expect(r16Matches[4].participant1Ref.value).toBe('Group B #1');
      expect(r16Matches[4].participant2Ref.value).toBe(prelimMatches[2].id);

      // Match 7: Seed 3 (Group C #1) vs Winner of Prelim 2 (Match 2)
      expect(r16Matches[6].participant1Ref.value).toBe('Group C #1');
      expect(r16Matches[6].participant2Ref.value).toBe(prelimMatches[1].id);
    });

    it('Dynamic Top Q: 4 groups of 5 teams with Top 3 qualifiers (12 qualifiers)', () => {
      // 4 groups of 5:
      // Group matches = 4 * (5 * 4 / 2) = 40
      // Qualifiers = 4 * 3 = 12
      // R = 8, P = 4 prelim ties, D = 4 direct entries
      // KO matches = 12 - 1 = 11 (4 prelim + 4 QF + 2 SF + 1 Final)
      // Total = 40 + 11 = 51
      const struct = generateCanonicalStructure(
        't-top3',
        TournamentFormat.LEAGUE_AND_KNOCKOUT,
        20,
        4,
        undefined,
        false,
        { topQualifiers: 3 },
      );

      expect(struct.groups.length).toBe(4);
      expect(struct.summary.groupStageMatches).toBe(40);
      expect(struct.summary.knockoutMatches).toBe(11);
      expect(struct.summary.schedulableMatches).toBe(51);

      const prelims = struct.matches.filter(
        (m) => m.round === 'Preliminary Round',
      );
      expect(prelims.length).toBe(4);
      const qfs = struct.matches.filter((m) => m.round === 'Quarterfinal');
      expect(qfs.length).toBe(4);
    });

    it('Double Hybrid with Preliminary Round (40 teams, 10 groups, Top 2 = 20 qualifiers)', () => {
      // Group matches = 10 * (4 * 3) = 120
      // KO matches = 2 * (20 - 2) + 1 = 37 (8 prelim + 16 R16 + 8 QF + 4 SF + 1 Final)
      // Total = 120 + 37 = 157
      const dh = calculateHybridMatches(40, {
        groupsCount: 10,
        qualifiersPerGroup: 2,
        isDouble: true,
        thirdPlacePlayoffEnabled: false,
      });
      expect(dh.groupStageMatches).toBe(120);
      expect(dh.knockoutMatches).toBe(37);
      expect(dh.guaranteedMatchCount).toBe(157);

      const struct = generateCanonicalStructure(
        't-dh40',
        TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE,
        40,
        10,
        undefined,
        false,
        { topQualifiers: 2 },
      );

      expect(struct.summary.groupStageMatches).toBe(120);
      expect(struct.summary.knockoutMatches).toBe(37);
      expect(struct.summary.schedulableMatches).toBe(157);

      // Preliminary round has 4 ties with 2 legs each = 8 matches
      const prelims = struct.matches.filter(
        (m) => m.round === 'Preliminary Round',
      );
      expect(prelims.length).toBe(8);
      prelims.forEach((m) => {
        expect(m.aggregateAdvancement).toBe(true);
        expect(m.legCount).toBe(2);
      });
    });

    it('Capacity calculation with conditional reserve days and buffer days', () => {
      const venues = [
        {
          venueId: 'v-1',
          name: 'Main Arena',
          screens: [{ screenId: 's1', screenName: 'Screen 1' }],
        },
      ];

      // 09:00 to 17:00 (480 mins), 30 min match duration, 0 turnover, 0 lunch -> 16 slots/day
      // 79 total matches -> baseline = ceil(79 / 16) = 5 days
      const capSingleScreen = calculateCapacity({
        dailyStart: '09:00',
        dailyEnd: '17:00',
        slotDuration: 30,
        turnoverDuration: 0,
        venues,
        totalMatches: 79,
      });

      expect(capSingleScreen.slotsPerScreenPerDay).toBe(16);
      expect(capSingleScreen.totalDailySlots).toBe(16);
      expect(capSingleScreen.baselineDays).toBe(5);
      expect(capSingleScreen.reserveDays).toBe(0);
      expect(capSingleScreen.bufferDays).toBe(0);
      expect(capSingleScreen.totalPlayingDaysNeeded).toBe(5);

      // With conditional Grand Final reset match (+1 match) and buffer of 2 days
      const capWithReserveAndBuffer = calculateCapacity({
        dailyStart: '09:00',
        dailyEnd: '17:00',
        slotDuration: 30,
        turnoverDuration: 0,
        venues,
        totalMatches: 79,
        conditionalMatches: 1, // 80 matches -> still 5 days (ceil(80/16) = 5)
        bufferDays: 2,
      });

      expect(capWithReserveAndBuffer.baselineDays).toBe(5);
      expect(capWithReserveAndBuffer.reserveDays).toBe(0);
      expect(capWithReserveAndBuffer.bufferDays).toBe(2);
      expect(capWithReserveAndBuffer.totalPlayingDaysNeeded).toBe(7);

      // Threshold check: 80 matches with 1 conditional match -> 81 matches pushes to 6th day
      const capThreshold = calculateCapacity({
        dailyStart: '09:00',
        dailyEnd: '17:00',
        slotDuration: 30,
        turnoverDuration: 0,
        venues,
        totalMatches: 80, // ceil(80/16) = 5
        conditionalMatches: 1, // ceil(81/16) = 6 -> reserveDays = 6 - 5 = 1
        bufferDays: 1,
      });

      expect(capThreshold.baselineDays).toBe(5);
      expect(capThreshold.reserveDays).toBe(1);
      expect(capThreshold.bufferDays).toBe(1);
      expect(capThreshold.totalPlayingDaysNeeded).toBe(7); // 5 + 1 + 1 = 7
    });

    it('Double Elimination placement resolution identifies top 4 positions', () => {
      const struct = generateCanonicalStructure(
        't-de-test',
        TournamentFormat.DOUBLE_ELIMINATION,
        8,
      );

      const placements = resolveDoubleEliminationPlacementRefs(struct.matches);
      expect(placements.first).toBeDefined();
      expect(placements.second).toBeDefined();
      expect(placements.third).toBeDefined();
      expect(placements.fourth).toBeDefined();

      // 3rd place must be the loser of Losers Final
      const losersFinal = struct.matches.find((m) => m.round === 'Losers Final');
      expect(losersFinal).toBeDefined();
      expect(placements.third?.value).toBe(losersFinal?.id);
      expect(placements.third?.type).toBe('MATCH_LOSER');
    });
  });
});
