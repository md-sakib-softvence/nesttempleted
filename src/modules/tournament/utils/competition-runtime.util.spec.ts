import {
  FrequencyStatus,
  SchedulingMode,
  TournamentFormat as F,
} from '@prisma/client';
import { TournamentScheduleService } from '../service/tournament-schedule.service';
import {
  allocateMatch,
  calculateCapacity,
  generateCanonicalStructure,
  generatePlayingDates,
  resolveDoubleEliminationPlacementRefs,
} from './tournament-calculation.util';
import {
  applyQualificationDraw,
  compareQualificationStats,
  capacitySummary,
  ensureCapacity,
  reconcileCalendarSettings,
  reconcileQualification,
  refreshParticipants,
  resolveReference,
} from './competition-runtime.util';

const venues = [
  {
    venueId: 'v',
    name: 'Venue',
    screens: [{ screenId: 's', screenName: 'Screen' }],
  },
];
const config = {
  startDate: '2026-11-16',
  dailyStart: '09:00',
  dailyEnd: '17:00',
  matchDuration: 20,
  turnoverDuration: 5,
  lunchBreakTime: '13:00',
  lunchDuration: 60,
  frequencyStatus: FrequencyStatus.DAILY,
  frequencyArray: ['1'],
  buffer: 0,
  venues,
};
const make = (
  format = F.LEAGUE_AND_KNOCKOUT,
  teams = 8,
  groupsCount = 2,
  topQualifiers = 2,
  reset = false,
) =>
  new TournamentScheduleService().generateSchedule({
    ...config,
    tournamentFormat: format,
    schedulingMode: SchedulingMode.MANUAL,
    numberOfTeams: teams,
    groupsCount,
    topQualifiers,
    hasGrandFinalReset: reset,
    participants: Array.from({ length: teams }, (_, i) => ({
      playerId: `p${i + 1}`,
      name: `Player ${i + 1}`,
    })),
  });

function finishGroups(schedule: any, draw = false) {
  for (const m of schedule.structure.matches.filter(
    (m: any) => m.bracketSection === 'GROUP',
  )) {
    m.status = 'COMPLETED';
    m.score1 = draw ? 0 : (Number(m.participant1Ref.value) % 4) + 1;
    m.score2 = 0;
  }
}

describe('Handoff v1.2.1 regression cases', () => {
  it.each([F.LEAGUE_AND_KNOCKOUT, F.LEAGUE_AND_KNOCKOUT_DOUBLE])(
    '40/10/Q2 inventory and merit placeholders: %s',
    async (format) => {
      const s = await make(format, 40, 10);
      expect(s.structure.summary.guaranteedMatchCount).toBe(
        format === F.LEAGUE_AND_KNOCKOUT ? 79 : 157,
      );
      const prelim = s.structure.matches.filter(
        (m) => m.round === 'Preliminary Round' && m.legNumber !== 2,
      );
      expect(
        prelim.map((m) => [m.participant1Ref.value, m.participant2Ref.value]),
      ).toEqual([
        ['13', '20'],
        ['14', '19'],
        ['15', '18'],
        ['16', '17'],
      ]);
      expect(
        prelim.every((m) => m.participant1Ref.type === 'QUALIFIER_SEED'),
      ).toBe(true);
    },
  );
  it('rejects oversized fields, invalid Top Q, zero capacity and a missing weekday selection', () => {
    expect(() =>
      generateCanonicalStructure('x', F.SINGLE_ELIMINATION, 129),
    ).toThrow();
    expect(() =>
      generateCanonicalStructure('x', F.LEAGUE_AND_KNOCKOUT, 8, 2, [], false, {
        topQualifiers: 5,
      }),
    ).toThrow('Top Q');
    expect(() =>
      calculateCapacity({
        ...config,
        slotDuration: 20,
        totalMatches: 28,
        venues: [],
      }),
    ).toThrow('capacity');
    expect(() =>
      generatePlayingDates('2026-11-16', 1, FrequencyStatus.DAILY, []),
    ).toThrow('weekday');
  });
  it.each(Object.values(FrequencyStatus))(
    'weekdays govern dates for label %s; buffer does not space dates',
    (frequency) => {
      expect(
        generatePlayingDates('2026-11-16', 4, frequency, ['1'], 2),
      ).toEqual(['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']);
    },
  );
  it('derives standings from canonical scores, freezes resolved seeds, and preserves graph edges', async () => {
    const s = await make();
    finishGroups(s);
    const refs = JSON.stringify(
      s.structure.matches.map((m) => [m.participant1Ref, m.participant2Ref]),
    );
    reconcileQualification(s, false);
    // Resolve any exact cross-group ties using an explicit persisted draw.
    while (
      (s.structure as any).qualificationResolution.status === 'DRAW_REQUIRED'
    ) {
      const tie = (s.structure as any).qualificationResolution.tieGroups[0];
      applyQualificationDraw(
        s,
        tie.id,
        [...tie.participantIds].reverse(),
        false,
        'admin',
      );
    }
    const snapshot = JSON.stringify(
      (s.structure as any).qualificationResolution,
    );
    expect((s.structure as any).qualificationResolution.status).toBe(
      'RESOLVED',
    );
    expect(
      (s.structure as any).qualificationResolution.seeds.map(
        (r: any) => r.tier,
      ),
    ).toEqual([1, 1, 2, 2]);
    s.structure.matches[0].score1 = 99;
    reconcileQualification(s, false);
    refreshParticipants(s);
    expect(JSON.stringify((s.structure as any).qualificationResolution)).toBe(
      snapshot,
    );
    expect(
      JSON.stringify(
        s.structure.matches.map((m) => [m.participant1Ref, m.participant2Ref]),
      ),
    ).toBe(refs);
    expect(
      resolveReference(s, { type: 'QUALIFIER_SEED', value: '1' }),
    ).toBeDefined();
  });
  it('requires explicit current tie permutations; incomplete groups stay pending', async () => {
    const s = await make();
    reconcileQualification(s, false);
    expect((s.structure as any).qualificationResolution.status).toBe('PENDING');
    finishGroups(s, true);
    reconcileQualification(s, false);
    const r = (s.structure as any).qualificationResolution;
    expect(r.status).toBe('DRAW_REQUIRED');
    const tie = r.tieGroups[0];
    expect(() =>
      applyQualificationDraw(s, tie.id, ['foreign'], false, 'admin'),
    ).toThrow();
    expect(() =>
      applyQualificationDraw(
        s,
        tie.id,
        tie.participantIds.map(() => tie.participantIds[0]),
        false,
        'admin',
      ),
    ).toThrow();
    applyQualificationDraw(
      s,
      tie.id,
      [...tie.participantIds].reverse(),
      false,
      'admin',
    );
    expect(() =>
      applyQualificationDraw(s, tie.id, tie.participantIds, false, 'admin'),
    ).toThrow();
  });
  it('waits for both aggregate legs and leaves equal aggregate unresolved', async () => {
    const s = await make(F.LEAGUE_AND_KNOCKOUT_DOUBLE, 12, 3);
    const legs = s.structure.matches.filter((m) => m.tieId);
    const first = legs[0],
      second = legs.find((m) => m.tieId === first.tieId && m.id !== first.id)!;
    first.participant1Ref = { type: 'PARTICIPANT', value: 'a' };
    first.participant2Ref = { type: 'PARTICIPANT', value: 'b' };
    second.participant1Ref = first.participant2Ref;
    second.participant2Ref = first.participant1Ref;
    first.status = 'COMPLETED';
    first.score1 = 2;
    first.score2 = 0;
    const ref = { type: 'TIE_WINNER' as const, value: first.tieId! };
    expect(resolveReference(s, ref)).toBeUndefined();
    second.status = 'COMPLETED';
    second.score1 = 2;
    second.score2 = 0;
    expect(resolveReference(s, ref)).toBeUndefined();
    second.score1 = 1;
    expect(resolveReference(s, ref)).toBe('a');
  });
  it('respects disabled and inactive resets and graph-based placements after renaming', async () => {
    const without = await make(F.DOUBLE_ELIMINATION, 8, 2, 2, false);
    expect(without.structure.matches.filter((m) => m.conditional)).toHaveLength(
      0,
    );
    const s = await make(F.DOUBLE_ELIMINATION, 8, 2, 2, true);
    s.structure.matches.forEach((m) => (m.round = 'Renamed'));
    const gf = s.structure.matches.find(
      (m) => m.bracketSection === 'FINAL' && !m.conditional,
    )!;
    const reset = s.structure.matches.find((m) => m.conditional)!;
    expect(
      resolveDoubleEliminationPlacementRefs(s.structure.matches).first?.value,
    ).toBe(gf.id);
    reset.isSchedulable = true;
    expect(
      resolveDoubleEliminationPlacementRefs(s.structure.matches).first?.value,
    ).toBe(reset.id);
  });
  it('extends actual capacity idempotently and rejects settings that invalidate occupied slots', async () => {
    const s = await make(F.LEAGUE, 8);
    const m = s.structure.matches[0];
    const day = s.calendar[0].screens[0].days[0];
    const booked = allocateMatch(
      s,
      m.id,
      'v',
      's',
      day.date,
      day.timeslots[0].time,
    ).updatedSchedule;
    booked.calendar[0].screens[0].days = [
      booked.calendar[0].screens[0].days[0],
    ];
    expect(capacitySummary(booked).status).toBe('GUARANTEED_SHORTFALL');
    const before = JSON.stringify(booked.structure);
    const outcome = ensureCapacity(booked, config);
    expect(outcome.slotsAdded).toBeGreaterThan(0);
    expect(capacitySummary(booked).status).toBe('SUFFICIENT');
    expect(ensureCapacity(booked, config).slotsAdded).toBe(0);
    expect(JSON.stringify(booked.structure)).toBe(before);
    expect(() =>
      reconcileCalendarSettings(booked, { ...config, frequencyArray: ['2'] }),
    ).toThrow('DATE_NOT_PERMITTED');
    expect(() =>
      reconcileCalendarSettings(booked, { ...config, matchDuration: 30 }),
    ).toThrow('SLOT_WINDOW_CHANGED');
  });
  it('rejects interval overlap at different start times while allowing adjacency', async () => {
    const s = await make(F.LEAGUE, 4);
    const day = s.calendar[0].screens[0].days[0];
    const first = s.structure.matches[0];
    const next = s.structure.matches.find(
      (m) =>
        m.id !== first.id &&
        [m.player1Id, m.player2Id].includes(first.player1Id),
    )!;
    const booked = allocateMatch(
      s,
      first.id,
      'v',
      's',
      day.date,
      '09:00',
    ).updatedSchedule;
    booked.calendar[0].screens[0].days[0].timeslots.push(
      { time: '09:10', game: null },
      { time: '09:20', game: null },
    );
    expect(() =>
      allocateMatch(booked, next.id, 'v', 's', day.date, '09:10'),
    ).toThrow('PLAYER_TIME_OVERLAP');
    expect(() =>
      allocateMatch(booked, next.id, 'v', 's', day.date, '09:20'),
    ).not.toThrow();
  });
  it('uses rates before fair play, then goals and wins before drawing', () => {
    const row = {
      participantId: 'p',
      slotNumber: 1,
      groupId: 'g',
      groupName: 'Group',
      played: 3,
      points: 7,
      goalsFor: 5,
      goalsAgainst: 2,
      goalDifference: 3,
      wins: 2,
      fairPlayPenaltyPoints: 0,
    };
    expect(
      compareQualificationStats(row, { ...row, played: 4, points: 8 }),
    ).toBeLessThan(0);
    expect(
      compareQualificationStats(row, { ...row, goalsFor: 4 }),
    ).toBeLessThan(0);
    expect(compareQualificationStats(row, { ...row, wins: 1 })).toBeLessThan(0);
    expect(
      compareQualificationStats(row, { ...row, fairPlayPenaltyPoints: 1 }),
    ).toBeLessThan(0);
    expect(compareQualificationStats(row, { ...row })).toBe(0);
  });
  it('moves an activated reset from inactive reserve into active pending demand', async () => {
    const s = await make(F.DOUBLE_ELIMINATION, 8, 2, 2, true);
    const reset = s.structure.matches.find((m) => m.conditional)!;
    expect(capacitySummary(s).inactiveConditionalReserveMatches).toBe(1);
    const before = capacitySummary(s).pendingGuaranteedMatches;
    reset.isSchedulable = true;
    expect(capacitySummary(s).inactiveConditionalReserveMatches).toBe(0);
    expect(capacitySummary(s).pendingGuaranteedMatches).toBe(before + 1);
    const snapshot = JSON.stringify(s);
    capacitySummary(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('does not guess placements from ambiguous finals or active resets', async () => {
    const s = await make(F.DOUBLE_ELIMINATION, 8, 2, 2, true);
    const reset = s.structure.matches.find((m) => m.conditional)!;
    reset.isSchedulable = true;
    s.structure.matches.push({ ...reset, id: 'ambiguous-reset' });
    expect(resolveDoubleEliminationPlacementRefs(s.structure.matches)).toEqual(
      {},
    );
  });
  it('rejects impossible calendar dates instead of shifting into another month', () => {
    expect(() =>
      generatePlayingDates('2026-02-31', 1, FrequencyStatus.DAILY, ['1']),
    ).toThrow('valid start date');
  });
});
