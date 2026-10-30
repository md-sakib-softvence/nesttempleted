import {
  evaluateSelfSchedulingWindow,
  formatRemainingHoursMinutes,
  validateSlotForMatch,
  getEligibleSlotsForMatch,
  findEarliestValidSlot,
  countEligibleSlotsForMatch,
  MatchSchedulingPhase,
} from './self-schedule.util';
import { VenueSchedule } from './tournament-calculation.util';

describe('Player Self Scheduling Escalation Engine v1.2 Contract', () => {
  describe('1. Escalation Window Time Derivation & Phase State Machine', () => {
    it('returns NOT_OPEN when match.selfSchedulingOpenedAt is null or undefined (Section 2)', () => {
      const stateNull = evaluateSelfSchedulingWindow(null);
      expect(stateNull.phase).toBe(0);
      expect(stateNull.phaseStatus).toBe(MatchSchedulingPhase.NOT_OPEN);
      expect(stateNull.canPlayerSelectSlot).toBe(false);
      expect(stateNull.isAutoAssignmentDue).toBe(false);
      expect(stateNull.isEscalated).toBe(false);
      expect(stateNull.timeRemainingFormatted).toBe('Not Open');
      expect(stateNull.timeUntilAutoAssignmentFormatted).toBe('Not Open');

      const stateUndef = evaluateSelfSchedulingWindow(undefined);
      expect(stateUndef.phase).toBe(0);
      expect(stateUndef.phaseStatus).toBe(MatchSchedulingPhase.NOT_OPEN);
    });

    it('evaluates Phase 1 (0 to 48 hours): player freely chooses slot, unescalated (Section 3)', () => {
      // Opened Monday 10:00 AM (2026-10-26T10:00:00Z)
      const openedAt = '2026-10-26T10:00:00Z';
      // 6 hours 28 minutes later -> Monday 16:28:00Z -> 41h 32m remaining in Phase 1
      const simTime = '2026-10-26T16:28:00Z';

      const state = evaluateSelfSchedulingWindow(openedAt, simTime);
      expect(state.phase).toBe(1);
      expect(state.phaseStatus).toBe(MatchSchedulingPhase.SELF_SCHEDULING_OPEN);
      expect(state.canPlayerSelectSlot).toBe(true);
      expect(state.isEscalated).toBe(false);
      expect(state.isAutoAssignmentDue).toBe(false);
      expect(state.elapsedHours).toBe(6);
      expect(state.timeRemainingFormatted).toBe('41h 32m');
      // Auto assignment is due at 96 hours (Friday 10:00 AM) -> 89h 32m remaining
      expect(state.timeUntilAutoAssignmentFormatted).toBe('89h 32m');
    });

    it('evaluates Phase 2 (48 to 96 hours): escalated, warning active, player can still choose (Section 6 & 19)', () => {
      // Opened Monday 10:00 AM (2026-10-26T10:00:00Z)
      const openedAt = '2026-10-26T10:00:00Z';
      // Thursday 3:00 PM (2026-10-29T15:00:00Z) -> exactly 77 hours elapsed
      const simTime = '2026-10-29T15:00:00Z';

      const state = evaluateSelfSchedulingWindow(openedAt, simTime);
      expect(state.phase).toBe(2);
      expect(state.phaseStatus).toBe(
        MatchSchedulingPhase.SELF_SCHEDULING_ESCALATED,
      );
      expect(state.canPlayerSelectSlot).toBe(true);
      expect(state.isEscalated).toBe(true);
      expect(state.isAutoAssignmentDue).toBe(false);
      expect(state.elapsedHours).toBe(77);
      // Exactly 19 hours remaining before automatic assignment at 96 hours (Section 19)
      expect(state.timeUntilAutoAssignmentFormatted).toBe('19h 0m');
      expect(state.timeRemainingFormatted).toBe('19h 0m');
    });

    it('evaluates Phase 3 (96+ hours): player choice closes, automatic assignment due (Section 7 & 19)', () => {
      // Opened Monday 10:00 AM (2026-10-26T10:00:00Z)
      const openedAt = '2026-10-26T10:00:00Z';
      // Friday 11:00 AM (2026-10-30T11:00:00Z) -> 97 hours elapsed
      const simTime = '2026-10-30T11:00:00Z';

      const state = evaluateSelfSchedulingWindow(openedAt, simTime);
      expect(state.phase).toBe(3);
      expect(state.phaseStatus).toBe(MatchSchedulingPhase.AUTO_ASSIGNMENT_DUE);
      expect(state.canPlayerSelectSlot).toBe(false);
      expect(state.isEscalated).toBe(false);
      expect(state.isAutoAssignmentDue).toBe(true);
      expect(state.elapsedHours).toBe(97);
      expect(state.timeRemainingFormatted).toBe('0h 0m');
      expect(state.timeUntilAutoAssignmentMs).toBe(0);
    });

    it('formats remaining hours and minutes correctly', () => {
      expect(formatRemainingHoursMinutes(0)).toBe('0h 0m');
      expect(formatRemainingHoursMinutes(-5000)).toBe('0h 0m');
      expect(formatRemainingHoursMinutes(60 * 1000)).toBe('0h 1m');
      expect(formatRemainingHoursMinutes(60 * 60 * 1000)).toBe('1h 0m');
      expect(formatRemainingHoursMinutes((41 * 60 + 32) * 60 * 1000)).toBe(
        '41h 32m',
      );
    });
  });

  describe('2. Deterministic Slot Allocation & Conflict Validation (Sections 8, 9, 10)', () => {
    const calendar: VenueSchedule[] = [
      {
        venueId: 'v-1',
        venueName: 'Center Court',
        screens: [
          {
            screenId: 's-3',
            screenName: 'Screen 3',
            days: [
              {
                date: '2026-10-31',
                timeslots: [
                  {
                    time: '09:00',
                    canonicalMatchId: 'm-other-1',
                    game: {
                      id: 'g-1',
                      canonicalMatchId: 'm-other-1',
                      round: 1,
                      player1Id: 'player-A',
                      player2Id: 'player-X',
                    },
                  },
                  {
                    time: '10:00',
                    canonicalMatchId: null,
                    game: null,
                  },
                ],
              },
            ],
          },
          {
            screenId: 's-5',
            screenName: 'Screen 5',
            days: [
              {
                date: '2026-10-31',
                timeslots: [
                  {
                    time: '09:00',
                    canonicalMatchId: null,
                    game: null,
                  },
                  {
                    time: '11:00',
                    canonicalMatchId: null,
                    game: null,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        venueId: 'v-2',
        venueName: 'West Arena',
        screens: [
          {
            screenId: 's-1',
            screenName: 'Screen 1',
            days: [
              {
                date: '2026-10-31',
                timeslots: [
                  {
                    time: '10:00',
                    canonicalMatchId: null,
                    game: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    it('detects occupied slot collision', () => {
      const res = validateSlotForMatch(
        calendar,
        {
          venueId: 'v-1',
          screenId: 's-3',
          date: '2026-10-31',
          time: '09:00',
        },
        'm-target',
        'player-B',
        'player-C',
      );
      expect(res.isValid).toBe(false);
      expect(res.isOccupied).toBe(true);
    });

    it('detects player overlap collision on another screen at the same time (Section 8 example)', () => {
      // Screen 5 at 09:00 is vacant, but Player A is playing on Screen 3 at 09:00!
      const res = validateSlotForMatch(
        calendar,
        {
          venueId: 'v-1',
          screenId: 's-5',
          date: '2026-10-31',
          time: '09:00',
        },
        'm-target',
        'player-A', // Player A has collision at 09:00
        'player-B',
      );
      expect(res.isValid).toBe(false);
      expect(res.isPlayerConflict).toBe(true);
    });

    it('allows slot when neither player has overlap and screen is empty', () => {
      const res = validateSlotForMatch(
        calendar,
        {
          venueId: 'v-1',
          screenId: 's-3',
          date: '2026-10-31',
          time: '10:00',
        },
        'm-target',
        'player-A',
        'player-B',
      );
      expect(res.isValid).toBe(true);
    });

    it('finds earliest valid slot deterministically skipping conflicting slots (Section 8)', () => {
      // Available slots on 2026-10-31:
      // s-5 09:00 (conflicts with player-A)
      // s-3 10:00 (v-1, screen s-3)
      // s-1 10:00 (v-2, screen s-1)
      // s-5 11:00 (v-1, screen s-5)
      const candidate = findEarliestValidSlot(
        calendar,
        'm-target',
        'player-A',
        'player-B',
      );

      expect(candidate).not.toBeNull();
      // Should pick 10:00 on v-1 s-3 (earliest valid non-conflicting slot)
      expect(candidate?.date).toBe('2026-10-31');
      expect(candidate?.time).toBe('10:00');
      expect(candidate?.venueId).toBe('v-1');
      expect(candidate?.screenId).toBe('s-3');
    });

    it('counts eligible slots correctly for a match', () => {
      const count = countEligibleSlotsForMatch(
        calendar,
        'm-target',
        'player-A',
        'player-B',
      );
      // Total empty slots = 4 (s-5 09:00, s-3 10:00, s-1 10:00, s-5 11:00)
      // s-5 09:00 conflicts with player-A -> 3 eligible slots remain
      expect(count).toBe(3);
    });

    it('returns null and count 0 when no valid capacity exists (Section 10 CAPACITY_BLOCKED)', () => {
      const fullCalendar: VenueSchedule[] = [
        {
          venueId: 'v-1',
          venueName: 'Center Court',
          screens: [
            {
              screenId: 's-1',
              screenName: 'Screen 1',
              days: [
                {
                  date: '2026-10-31',
                  timeslots: [
                    {
                      time: '10:00',
                      canonicalMatchId: 'm-occupied-1',
                      game: {
                        id: 'g-occ-1',
                        canonicalMatchId: 'm-occupied-1',
                        round: 1,
                        player1Id: 'p-1',
                        player2Id: 'p-2',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const candidate = findEarliestValidSlot(
        fullCalendar,
        'm-target',
        'player-A',
        'player-B',
      );
      expect(candidate).toBeNull();
      expect(
        countEligibleSlotsForMatch(
          fullCalendar,
          'm-target',
          'player-A',
          'player-B',
        ),
      ).toBe(0);
    });
  });
});
