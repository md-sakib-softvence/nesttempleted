import {
  VenueSchedule,
  TournamentMatchEntity,
  TournamentSchedulePayload,
} from './tournament-calculation.util';

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
  phase: 1 | 2 | 3;
  phaseStatus: MatchSchedulingPhase;
  phaseStartedAt: string;
  phaseEndsAt: string;
  timeRemainingMs: number;
  timeRemainingFormatted: string;
  isAutoAssignmentDue: boolean;
  canPlayerSelectSlot: boolean;
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
 * Rules:
 * - 0 - 48h: Phase 1 (Self Scheduling - Player freely chooses)
 * - 48 - 96h: Phase 2 (Escalated Self Scheduling - Overdue warning, countdown, same capacity rules)
 * - 96h+: Phase 3 (Auto Assignment - Player choice closes, system auto-assigns)
 */
export function evaluateSelfSchedulingWindow(
  openedAt?: string | Date | null,
  currentTime?: string | Date | null,
): SelfSchedulingWindowState {
  const start = openedAt ? new Date(openedAt).getTime() : Date.now();
  const now = currentTime ? new Date(currentTime).getTime() : Date.now();
  const elapsedMs = Math.max(0, now - start);
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));

  const phase1LimitMs = 48 * 60 * 60 * 1000;
  const phase2LimitMs = 96 * 60 * 60 * 1000;

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
      isAutoAssignmentDue: false,
      canPlayerSelectSlot: true,
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
      isAutoAssignmentDue: false,
      canPlayerSelectSlot: true,
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
      isAutoAssignmentDue: true,
      canPlayerSelectSlot: false,
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
 * Deterministic Earliest Valid Available Slot Finder:
 *
 * Sorts all vacant physical slots by:
 * 1. Date ascending
 * 2. Time ascending
 * 3. Stable venue / screen ordering
 *
 * Verifies that neither player has another match scheduled on that date and time.
 * Returns the first valid slot, or null if no valid capacity exists.
 */
export function findEarliestValidSlot(
  calendar: VenueSchedule[],
  targetMatchId: string,
  player1Id?: string,
  player2Id?: string,
): CandidateSlot | null {
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
          // Check if slot is empty or already booked by this exact match
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

  // Evaluate each slot against player conflict validator
  for (const slot of vacantSlots) {
    let hasConflict = false;

    if (player1Id || player2Id) {
      for (const v of calendar) {
        for (const s of v.screens) {
          const day = s.days.find((d) => d.date === slot.date);
          if (day) {
            const occupiedSlot = day.timeslots.find(
              (ts) =>
                ts.time === slot.time &&
                ts.canonicalMatchId &&
                ts.canonicalMatchId !== targetMatchId,
            );
            if (occupiedSlot && occupiedSlot.game) {
              const g = occupiedSlot.game;
              if (
                player1Id &&
                (g.player1Id === player1Id || g.player2Id === player1Id)
              ) {
                hasConflict = true;
                break;
              }
              if (
                player2Id &&
                (g.player1Id === player2Id || g.player2Id === player2Id)
              ) {
                hasConflict = true;
                break;
              }
            }
          }
        }
        if (hasConflict) break;
      }
    }

    if (!hasConflict) {
      return slot;
    }
  }

  return null;
}
