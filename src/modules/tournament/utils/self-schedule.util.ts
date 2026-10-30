import { VenueSchedule } from './tournament-calculation.util';

export enum MatchSchedulingPhase {
  NOT_OPEN = 'NOT_OPEN',
  SELF_SCHEDULING_OPEN = 'SELF_SCHEDULING_OPEN', // Phase 1: 0 - 48h
  SELF_SCHEDULING_ESCALATED = 'SELF_SCHEDULING_ESCALATED', // Phase 2: 48 - 96h
  AUTO_ASSIGNMENT_DUE = 'AUTO_ASSIGNMENT_DUE', // Phase 3: 96h+
  AUTO_ASSIGNED = 'AUTO_ASSIGNED',
  CAPACITY_BLOCKED = 'CAPACITY_BLOCKED',
  ADMIN_ACTION_REQUIRED = 'ADMIN_ACTION_REQUIRED',
  SCHEDULED = 'SCHEDULED',
}

export interface SelfSchedulingWindowState {
  phase: 0 | 1 | 2 | 3;
  phaseStatus: MatchSchedulingPhase;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  timeRemainingMs: number;
  timeRemainingFormatted: string;
  autoAssignmentDueAt: string | null;
  timeUntilAutoAssignmentMs: number;
  timeUntilAutoAssignmentFormatted: string;
  isAutoAssignmentDue: boolean;
  canPlayerSelectSlot: boolean;
  isEscalated: boolean;
  elapsedHours: number;
}

export interface ProposedSlot {
  venueId: string;
  venueName?: string;
  screenId: string;
  screenName?: string;
  date: string;
  time: string;
  proposedBy: string;
  proposedByName?: string;
  proposedAt: string;
}

export interface CandidateSlot {
  venueId: string;
  venueName: string;
  screenId: string;
  screenName: string;
  date: string;
  time: string;
}

export interface SlotValidationResult {
  isValid: boolean;
  reason?: string;
  isOccupied?: boolean;
  isPlayerConflict?: boolean;
  isPolicyClosed?: boolean;
}

/**
 * Format milliseconds into human-readable e.g. "41h 32m"
 */
export function formatRemainingHoursMinutes(ms: number): string {
  if (ms <= 0) return '0h 0m';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Evaluates the 3-stage self-scheduling escalation window.
 * This is a pure function used by both production engine and simulation.
 *
 * Rules (Player Self-Scheduling Escalation Contract v1.2):
 * - NOT_OPEN: openedAt is not set (match not eligible, participants unresolved)
 * - 0 - 48h: Phase 1 (Self Scheduling - Player freely chooses)
 * - 48 - 96h: Phase 2 (Escalated Self Scheduling - Overdue warning, countdown, same capacity rules)
 * - 96h+: Phase 3 (Auto Assignment - Player choice closes, system auto-assigns)
 */
export function evaluateSelfSchedulingWindow(
  openedAt?: string | Date | null,
  currentTime?: string | Date | null,
): SelfSchedulingWindowState {
  if (!openedAt) {
    return {
      phase: 0,
      phaseStatus: MatchSchedulingPhase.NOT_OPEN,
      phaseStartedAt: null,
      phaseEndsAt: null,
      timeRemainingMs: 0,
      timeRemainingFormatted: 'Not Open',
      autoAssignmentDueAt: null,
      timeUntilAutoAssignmentMs: 0,
      timeUntilAutoAssignmentFormatted: 'Not Open',
      isAutoAssignmentDue: false,
      canPlayerSelectSlot: false,
      isEscalated: false,
      elapsedHours: 0,
    };
  }

  const start = new Date(openedAt).getTime();
  const now = currentTime ? new Date(currentTime).getTime() : Date.now();
  const elapsedMs = Math.max(0, now - start);
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));

  const phase1LimitMs = 48 * 60 * 60 * 1000;
  const phase2LimitMs = 96 * 60 * 60 * 1000;

  const autoAssignmentDueAt = new Date(start + phase2LimitMs).toISOString();
  const timeUntilAutoAssignmentMs = Math.max(0, start + phase2LimitMs - now);
  const timeUntilAutoAssignmentFormatted = formatRemainingHoursMinutes(
    timeUntilAutoAssignmentMs,
  );

  if (elapsedHours < 48) {
    const endsAt = new Date(start + phase1LimitMs);
    const rem = Math.max(0, endsAt.getTime() - now);
    return {
      phase: 1,
      phaseStatus: MatchSchedulingPhase.SELF_SCHEDULING_OPEN,
      phaseStartedAt: new Date(start).toISOString(),
      phaseEndsAt: endsAt.toISOString(),
      timeRemainingMs: rem,
      timeRemainingFormatted: formatRemainingHoursMinutes(rem),
      autoAssignmentDueAt,
      timeUntilAutoAssignmentMs,
      timeUntilAutoAssignmentFormatted,
      isAutoAssignmentDue: false,
      canPlayerSelectSlot: true,
      isEscalated: false,
      elapsedHours,
    };
  } else if (elapsedHours < 96) {
    const endsAt = new Date(start + phase2LimitMs);
    const rem = Math.max(0, endsAt.getTime() - now);
    return {
      phase: 2,
      phaseStatus: MatchSchedulingPhase.SELF_SCHEDULING_ESCALATED,
      phaseStartedAt: new Date(start + phase1LimitMs).toISOString(),
      phaseEndsAt: endsAt.toISOString(),
      timeRemainingMs: rem,
      timeRemainingFormatted: formatRemainingHoursMinutes(rem),
      autoAssignmentDueAt,
      timeUntilAutoAssignmentMs,
      timeUntilAutoAssignmentFormatted,
      isAutoAssignmentDue: false,
      canPlayerSelectSlot: true,
      isEscalated: true,
      elapsedHours,
    };
  } else {
    return {
      phase: 3,
      phaseStatus: MatchSchedulingPhase.AUTO_ASSIGNMENT_DUE,
      phaseStartedAt: new Date(start + phase2LimitMs).toISOString(),
      phaseEndsAt: new Date(start + phase2LimitMs).toISOString(),
      timeRemainingMs: 0,
      timeRemainingFormatted: '0h 0m',
      autoAssignmentDueAt,
      timeUntilAutoAssignmentMs: 0,
      timeUntilAutoAssignmentFormatted: '0h 0m',
      isAutoAssignmentDue: true,
      canPlayerSelectSlot: false,
      isEscalated: false,
      elapsedHours,
    };
  }
}

/**
 * Checks whether a given timeslot is a peak hours block (e.g. 12:00-15:00, 17:00-19:00).
 */
export function isPeakTimeslot(time: string): boolean {
  if (!time) return false;
  const hour = parseInt(time.split(':')[0], 10);
  if (isNaN(hour)) return false;
  return (hour >= 12 && hour <= 15) || (hour >= 17 && hour <= 19);
}

/**
 * Shared slot eligibility validator (Contract Rule 9):
 * Automatic assignment, manual booking, and the simulator must use the identical validator.
 */
export function validateSlotForMatch(
  calendar: VenueSchedule[],
  target: { venueId: string; screenId: string; date: string; time: string },
  targetMatchId: string,
  player1Id?: string,
  player2Id?: string,
  checkOperatingWindow = true,
): SlotValidationResult {
  const venue = (calendar || []).find((v) => v.venueId === target.venueId);
  if (!venue) {
    return { isValid: false, reason: 'Venue does not exist' };
  }

  const screen = (venue.screens || []).find(
    (s) => s.screenId === target.screenId,
  );
  if (!screen) {
    return { isValid: false, reason: 'Screen does not exist' };
  }

  const day = (screen.days || []).find((d) => d.date === target.date);
  if (!day) {
    return { isValid: false, reason: 'Date is not an active playing date' };
  }

  const slot = (day.timeslots || []).find((t) => t.time === target.time);
  if (!slot) {
    return { isValid: false, reason: 'Timeslot does not exist' };
  }

  if (slot.canonicalMatchId && slot.canonicalMatchId !== targetMatchId) {
    return {
      isValid: false,
      isOccupied: true,
      reason: `Timeslot is occupied by match ${slot.canonicalMatchId}`,
    };
  }

  if (checkOperatingWindow && day.schedulingPolicy) {
    const policy = day.schedulingPolicy;
    if (policy.isWindowOpen === false) {
      return {
        isValid: false,
        isPolicyClosed: true,
        reason: 'Scheduling window is closed for this matchday',
      };
    }
    const now = Date.now();
    if (
      policy.windowOpenTime &&
      now < new Date(policy.windowOpenTime).getTime()
    ) {
      return {
        isValid: false,
        isPolicyClosed: true,
        reason: 'Matchday scheduling window is not yet open',
      };
    }
    if (
      policy.windowCloseTime &&
      now >= new Date(policy.windowCloseTime).getTime()
    ) {
      return {
        isValid: false,
        isPolicyClosed: true,
        reason: 'Matchday scheduling window has closed',
      };
    }
  }

  // Cross-calendar player overlap collision check
  if (player1Id || player2Id) {
    for (const v of calendar) {
      for (const s of v.screens || []) {
        const d = (s.days || []).find(
          (dayItem) => dayItem.date === target.date,
        );
        if (d) {
          const checkSlot = (d.timeslots || []).find(
            (ts) =>
              ts.time === target.time &&
              ts.canonicalMatchId &&
              ts.canonicalMatchId !== targetMatchId,
          );
          if (checkSlot && checkSlot.game) {
            const g = checkSlot.game;
            if (
              player1Id &&
              (g.player1Id === player1Id || g.player2Id === player1Id)
            ) {
              return {
                isValid: false,
                isPlayerConflict: true,
                reason: `Player 1 (${player1Id}) is already scheduled at ${target.date} ${target.time}`,
              };
            }
            if (
              player2Id &&
              (g.player1Id === player2Id || g.player2Id === player2Id)
            ) {
              return {
                isValid: false,
                isPlayerConflict: true,
                reason: `Player 2 (${player2Id}) is already scheduled at ${target.date} ${target.time}`,
              };
            }
          }
        }
      }
    }
  }

  return { isValid: true };
}

/**
 * Returns all valid, available candidate slots for a match in deterministic order:
 * 1. Date ascending
 * 2. Time ascending
 * 3. Stable venue ordering (venueId asc)
 * 4. Stable screen ordering (screenId asc)
 */
export function getEligibleSlotsForMatch(
  calendar: VenueSchedule[],
  targetMatchId: string,
  player1Id?: string,
  player2Id?: string,
): CandidateSlot[] {
  interface FlatSlot {
    venueId: string;
    venueName: string;
    screenId: string;
    screenName: string;
    date: string;
    time: string;
  }

  const vacantSlots: FlatSlot[] = [];

  for (const v of calendar || []) {
    for (const s of v.screens || []) {
      for (const d of s.days || []) {
        for (const t of d.timeslots || []) {
          if (!t.canonicalMatchId || t.canonicalMatchId === targetMatchId) {
            vacantSlots.push({
              venueId: v.venueId,
              venueName: v.venueName,
              screenId: s.screenId,
              screenName: s.screenName,
              date: d.date,
              time: t.time,
            });
          }
        }
      }
    }
  }

  // Deterministic sort: Date asc -> Time asc -> VenueId asc -> ScreenId asc
  vacantSlots.sort((a, b) => {
    const dateComp = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateComp !== 0) return dateComp;
    const timeComp = a.time.localeCompare(b.time);
    if (timeComp !== 0) return timeComp;
    const venueComp = a.venueId.localeCompare(b.venueId);
    if (venueComp !== 0) return venueComp;
    return a.screenId.localeCompare(b.screenId);
  });

  const eligible: CandidateSlot[] = [];
  for (const slot of vacantSlots) {
    const val = validateSlotForMatch(
      calendar,
      slot,
      targetMatchId,
      player1Id,
      player2Id,
      false, // simulation/candidate search checks basic calendar window
    );
    if (val.isValid) {
      eligible.push({
        venueId: slot.venueId,
        venueName: slot.venueName,
        screenId: slot.screenId,
        screenName: slot.screenName,
        date: slot.date,
        time: slot.time,
      });
    }
  }

  return eligible;
}

/**
 * Deterministic Earliest Valid Available Slot Finder:
 * Returns the first valid slot in deterministic order, or null if no valid capacity exists.
 */
export function findEarliestValidSlot(
  calendar: VenueSchedule[],
  targetMatchId: string,
  player1Id?: string,
  player2Id?: string,
): CandidateSlot | null {
  const eligible = getEligibleSlotsForMatch(
    calendar,
    targetMatchId,
    player1Id,
    player2Id,
  );
  return eligible.length > 0 ? eligible[0] : null;
}

/**
 * Returns the count of eligible, non-conflicting available slots for a match.
 */
export function countEligibleSlotsForMatch(
  calendar: VenueSchedule[],
  targetMatchId: string,
  player1Id?: string,
  player2Id?: string,
): number {
  return getEligibleSlotsForMatch(calendar, targetMatchId, player1Id, player2Id)
    .length;
}
