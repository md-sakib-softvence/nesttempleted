import {
  TournamentFormat,
  SchedulingMode,
  FrequencyStatus,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// ==========================================
// 1. Types & Interfaces
// ==========================================

export type MatchParticipantRefType =
  | 'TOURNAMENT_SLOT'
  | 'SEED'
  | 'GROUP_POSITION'
  | 'MATCH_WINNER'
  | 'MATCH_LOSER'
  | 'BYE'
  | 'TIE_WINNER'
  | 'TIE_LOSER';

export interface MatchParticipantRef {
  type: MatchParticipantRefType;
  value: string;
}

export interface TournamentPlayerSlot {
  id: string;
  tournamentId: string;
  slotNumber: number;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'RESERVED';
  participantId?: string;
  participantName?: string;
}

export interface TournamentSeed {
  seedNumber: number;
  participantId?: string;
  slotNumber?: number;
  source: string;
}

export interface TournamentGroupEntity {
  id: string;
  tournamentId: string;
  name: string;
  slotNumbers: number[];
  standings: Array<{
    slotNumber: number;
    played: number;
    wins: number;
    losses: number;
    points: number;
  }>;
}

export interface TournamentMatchEntity {
  id: string;
  tournamentId: string;
  round: string;
  bracketSection: 'GROUP' | 'WINNERS' | 'LOSERS' | 'FINAL';
  matchNumber?: number;
  participant1Ref: MatchParticipantRef;
  participant2Ref: MatchParticipantRef;
  player1Id?: string;
  player1Name?: string;
  player2Id?: string;
  player2Name?: string;
  score1: number | null;
  score2: number | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  isAutoAdvance?: boolean;
  isSchedulable?: boolean;
  conditional?: boolean;
  conditionType?: string;
  conditionMatchId?: string;
  winnerRef?: MatchParticipantRef;
  loserRef?: MatchParticipantRef;
  nextMatchWinnerTargetId?: string;
  nextMatchLoserTargetId?: string;
  tieId?: string;
  legNumber?: number;
  legCount?: number;
  aggregateAdvancement?: boolean;
  venueId?: string;
  venueName?: string;
  screenId?: string;
  screenName?: string;
  date?: string;
  time?: string;
  selfSchedulingOpenedAt?: string;
  schedulingPhase?: string;
  bookedBy?: string;
  bookedAt?: string;
  autoAssignedAt?: string;
  proposedSlot?: {
    venueId: string;
    venueName?: string;
    screenId: string;
    screenName?: string;
    date: string;
    time: string;
    proposedBy: string;
    proposedByName?: string;
    proposedAt: string;
  };
  emergencyTokenUsed?: boolean;
  schedulingExceptionReason?: string;
}

export interface TournamentStructureSummary {
  structuralNodes: number;
  groupStageMatches: number;
  knockoutMatches: number;
  winnersBracketMatches: number;
  losersBracketMatches: number;
  finalMatches: number;
  schedulableMatches: number;
  conditionalMatches: number;
  autoAdvanceCount: number;
  totalCompetitionMatches: number;
  guaranteedMatchCount: number;
  conditionalMatchCount: number;
  maximumPossibleMatchCount: number;
}

export interface TournamentMatchCounts {
  guaranteedMatchCount: number;
  conditionalMatchCount: number;
  maximumPossibleMatchCount: number;
  groupStageMatches: number;
  knockoutMatches: number;
  totalCompetitionMatches: number;
}

export interface ScheduledGame {
  id: string;
  canonicalMatchId?: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  score1: number | null;
  score2: number | null;
  status: string;
  round?: string;
  matchNumber?: number;
  bracketSection?: string;
  venueId?: string;
  venueName?: string;
  screenId?: string;
  screenName?: string;
  date?: string;
  time?: string;
}

export interface Timeslot {
  time: string;
  game: ScheduledGame | null;
  canonicalMatchId?: string | null;
}

export interface DaySchedule {
  date: string;
  timeslots: Timeslot[];
  schedulingPolicy?: {
    isWindowOpen: boolean;
    windowOpenTime: string;
    windowCloseTime: string;
  };
}

export interface ScreenSchedule {
  screenId: string;
  screenName: string;
  days: DaySchedule[];
}

export interface VenueSchedule {
  venueId: string;
  venueName: string;
  screens: ScreenSchedule[];
}

export interface ScheduleVenueInput {
  venueId: string;
  name: string;
  screens: Array<{ screenId: string; screenName: string }>;
}

export interface Participant {
  playerId: string;
  name: string;
  homeVenueId?: string;
}

export interface CapacityCalculationInput {
  dailyStart: string;
  dailyEnd: string;
  slotDuration: number;
  turnoverDuration: number;
  lunchBreakTime?: string | null;
  lunchDuration?: number | null;
  venues: ScheduleVenueInput[];
  totalMatches: number;
}

export interface CapacityCalculationResult {
  matchTimeMinutes: number;
  operatingMinutes: number;
  slotsPerScreenPerDay: number;
  totalScreens: number;
  totalDailySlots: number;
  totalMatches: number;
  totalPlayingDaysNeeded: number;
}

export interface TournamentSchedulePayload {
  capacity: CapacityCalculationResult & { eventDates: string[] };
  structure: {
    slots: TournamentPlayerSlot[];
    seeds: TournamentSeed[];
    groups: TournamentGroupEntity[];
    matches: TournamentMatchEntity[];
    summary: TournamentStructureSummary;
  };
  calendar: VenueSchedule[];
}

export interface GenerateScheduleParams {
  tournamentId?: string;
  tournamentName?: string;
  tournamentFormat: TournamentFormat;
  schedulingMode: SchedulingMode;
  numberOfTeams: number;
  startDate: Date | string;
  dailyStart: string;
  dailyEnd: string;
  matchDuration: number;
  turnoverDuration: number;
  lunchBreakTime?: string | null;
  lunchDuration?: number | null;
  buffer?: number;
  frequencyStatus?: FrequencyStatus;
  frequencyArray?: string[];
  venues: ScheduleVenueInput[];
  participants?: Participant[];
  groupsCount?: number;
  thirdPlacePlayoffEnabled?: boolean;
  schedulingPolicy?: {
    isWindowOpen?: boolean;
    windowOpenTime?: string;
    windowCloseTime?: string;
  };
}

// ==========================================
// 2. Pure Match Counting Formulas (tape eSports Calculation.docx)
// ==========================================

export interface ExpectedMatchesOptions {
  groupsCount?: number;
  qualifiersPerGroup?: number;
  thirdPlacePlayoffEnabled?: boolean;
  hasGrandFinalReset?: boolean;
}

/**
 * Calculates League match count.
 * Single League: N * (N - 1) / 2
 * Double League: N * (N - 1)
 */
export function calculateLeagueMatches(
  numberOfTeams: number,
  isDouble = false,
): number {
  if (numberOfTeams < 2) return 0;
  return isDouble
    ? numberOfTeams * (numberOfTeams - 1)
    : (numberOfTeams * (numberOfTeams - 1)) / 2;
}

/**
 * Calculates Single Elimination match count.
 * Playable matches = N - 1 (+ 1 if third-place playoff is enabled).
 * Non-power-of-two BYEs are auto-advances, not played matches.
 */
export function calculateSingleEliminationMatches(
  numberOfTeams: number,
  thirdPlacePlayoffEnabled = true,
): number {
  if (numberOfTeams < 2) return 0;
  const base = numberOfTeams - 1;
  const thirdPlace = thirdPlacePlayoffEnabled && numberOfTeams >= 4 ? 1 : 0;
  return base + thirdPlace;
}

/**
 * Calculates Double Elimination match counts.
 * Guaranteed matches = 2N - 2
 * Conditional matches = 1 (Grand Final Reset, if enabled)
 * Maximum possible matches = 2N - 1
 */
export function calculateDoubleEliminationMatches(
  numberOfTeams: number,
  hasGrandFinalReset = true,
): {
  guaranteedMatchCount: number;
  conditionalMatchCount: number;
  maximumPossibleMatchCount: number;
} {
  if (numberOfTeams < 2) {
    return {
      guaranteedMatchCount: 0,
      conditionalMatchCount: 0,
      maximumPossibleMatchCount: 0,
    };
  }
  const guaranteed = 2 * numberOfTeams - 2;
  const conditional = hasGrandFinalReset ? 1 : 0;
  return {
    guaranteedMatchCount: guaranteed,
    conditionalMatchCount: conditional,
    maximumPossibleMatchCount: guaranteed + conditional,
  };
}

/**
 * Calculates group sizes evenly across groupsCount.
 */
export function calculateGroupDistribution(
  teams: number,
  groupsCount: number,
): number[] {
  if (teams <= 0 || groupsCount <= 0) return [];
  const g = Math.min(groupsCount, Math.max(1, Math.floor(teams / 2)));
  const baseSize = Math.floor(teams / g);
  const remainder = teams % g;
  const sizes: number[] = [];
  for (let i = 0; i < g; i++) {
    sizes.push(baseSize + (i < remainder ? 1 : 0));
  }
  return sizes;
}

/**
 * Calculates Hybrid (League + Knockout) match counts.
 * Group Stage: Single RR (S*(S-1)/2) or Double RR (S*(S-1)) per group
 * Knockout Stage:
 *  - Single Leg Knockout: K - 1 (+ 1 if 3rd place enabled), where K = G * Q
 *  - Double Leg Knockout: All rounds before final have 2 legs, final is 1 match (+ 1 if 3rd place enabled).
 *    Total KO matches = 2 * (K - 2) + 1 = 2K - 3 (+ 1 if 3rd place enabled).
 */
export function calculateHybridMatches(
  numberOfTeams: number,
  options?: {
    groupsCount?: number;
    qualifiersPerGroup?: number;
    isDouble?: boolean;
    thirdPlacePlayoffEnabled?: boolean;
  },
): {
  groupStageMatches: number;
  knockoutMatches: number;
  guaranteedMatchCount: number;
  conditionalMatchCount: number;
  maximumPossibleMatchCount: number;
} {
  if (numberOfTeams < 2) {
    return {
      groupStageMatches: 0,
      knockoutMatches: 0,
      guaranteedMatchCount: 0,
      conditionalMatchCount: 0,
      maximumPossibleMatchCount: 0,
    };
  }

  const defaultGroups = Math.max(1, Math.floor(numberOfTeams / 4));
  const groupsCount = options?.groupsCount || defaultGroups;
  const qualifiersPerGroup = options?.qualifiersPerGroup ?? 2;
  const isDouble = options?.isDouble ?? false;
  const thirdPlaceEnabled = options?.thirdPlacePlayoffEnabled ?? true;

  const groupSizes = calculateGroupDistribution(numberOfTeams, groupsCount);
  let groupStageMatches = 0;
  for (const s of groupSizes) {
    groupStageMatches += isDouble ? s * (s - 1) : (s * (s - 1)) / 2;
  }

  // Knockout entrants K = number of groups * qualifiers per group
  const totalQualifiers = groupSizes.length * qualifiersPerGroup;

  let knockoutMatches = 0;
  if (totalQualifiers >= 2) {
    if (isDouble) {
      // 2 legs for every round before the single final, plus 1 for the final
      // Formula: 2 * (K - 2) + 1 = 2K - 3 (for K >= 2)
      knockoutMatches =
        totalQualifiers === 2 ? 1 : 2 * (totalQualifiers - 2) + 1;
    } else {
      // Standard single elimination knockout: K - 1
      knockoutMatches = totalQualifiers - 1;
    }

    if (thirdPlaceEnabled && totalQualifiers >= 4) {
      knockoutMatches += 1;
    }
  }

  const guaranteed = groupStageMatches + knockoutMatches;

  return {
    groupStageMatches,
    knockoutMatches,
    guaranteedMatchCount: guaranteed,
    conditionalMatchCount: 0,
    maximumPossibleMatchCount: guaranteed,
  };
}

/**
 * Universal expected match count calculator following all tape eSports Calculation rules:
 * - League Single: N(N - 1) / 2
 * - League Double: N(N - 1)
 * - Single Elimination: N - 1 (+ 1 for 3rd place)
 * - Double Elimination: 2N - 2 guaranteed, 1 conditional GF reset, 2N - 1 maximum
 * - Hybrid Single: group matches + K - 1 (+ 1 for 3rd place)
 * - Hybrid Double: double RR groups + 2-leg KO before final + single final (+ 1 for 3rd place)
 */
export function calculateTournamentExpectedMatches(
  format: TournamentFormat,
  numberOfTeams: number,
  options?: ExpectedMatchesOptions,
): TournamentMatchCounts {
  const thirdPlacePlayoffEnabled = options?.thirdPlacePlayoffEnabled ?? true;
  const hasGrandFinalReset = options?.hasGrandFinalReset ?? true;

  switch (format) {
    case TournamentFormat.LEAGUE: {
      const count = calculateLeagueMatches(numberOfTeams, false);
      return {
        guaranteedMatchCount: count,
        conditionalMatchCount: 0,
        maximumPossibleMatchCount: count,
        groupStageMatches: count,
        knockoutMatches: 0,
        totalCompetitionMatches: count,
      };
    }
    case TournamentFormat.LEAGUE_DOUBLE: {
      const count = calculateLeagueMatches(numberOfTeams, true);
      return {
        guaranteedMatchCount: count,
        conditionalMatchCount: 0,
        maximumPossibleMatchCount: count,
        groupStageMatches: count,
        knockoutMatches: 0,
        totalCompetitionMatches: count,
      };
    }
    case TournamentFormat.SINGLE_ELIMINATION: {
      const count = calculateSingleEliminationMatches(
        numberOfTeams,
        thirdPlacePlayoffEnabled,
      );
      return {
        guaranteedMatchCount: count,
        conditionalMatchCount: 0,
        maximumPossibleMatchCount: count,
        groupStageMatches: 0,
        knockoutMatches: count,
        totalCompetitionMatches: count,
      };
    }
    case TournamentFormat.DOUBLE_ELIMINATION: {
      const de = calculateDoubleEliminationMatches(
        numberOfTeams,
        hasGrandFinalReset,
      );
      return {
        guaranteedMatchCount: de.guaranteedMatchCount,
        conditionalMatchCount: de.conditionalMatchCount,
        maximumPossibleMatchCount: de.maximumPossibleMatchCount,
        groupStageMatches: 0,
        knockoutMatches: de.guaranteedMatchCount,
        totalCompetitionMatches: de.guaranteedMatchCount,
      };
    }
    case TournamentFormat.LEAGUE_AND_KNOCKOUT: {
      const hybrid = calculateHybridMatches(numberOfTeams, {
        groupsCount: options?.groupsCount,
        qualifiersPerGroup: options?.qualifiersPerGroup ?? 2,
        isDouble: false,
        thirdPlacePlayoffEnabled,
      });
      return {
        guaranteedMatchCount: hybrid.guaranteedMatchCount,
        conditionalMatchCount: hybrid.conditionalMatchCount,
        maximumPossibleMatchCount: hybrid.maximumPossibleMatchCount,
        groupStageMatches: hybrid.groupStageMatches,
        knockoutMatches: hybrid.knockoutMatches,
        totalCompetitionMatches: hybrid.guaranteedMatchCount,
      };
    }
    case TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE: {
      const hybridDouble = calculateHybridMatches(numberOfTeams, {
        groupsCount: options?.groupsCount,
        qualifiersPerGroup: options?.qualifiersPerGroup ?? 2,
        isDouble: true,
        thirdPlacePlayoffEnabled,
      });
      return {
        guaranteedMatchCount: hybridDouble.guaranteedMatchCount,
        conditionalMatchCount: hybridDouble.conditionalMatchCount,
        maximumPossibleMatchCount: hybridDouble.maximumPossibleMatchCount,
        groupStageMatches: hybridDouble.groupStageMatches,
        knockoutMatches: hybridDouble.knockoutMatches,
        totalCompetitionMatches: hybridDouble.guaranteedMatchCount,
      };
    }
    default: {
      const count = calculateSingleEliminationMatches(
        numberOfTeams,
        thirdPlacePlayoffEnabled,
      );
      return {
        guaranteedMatchCount: count,
        conditionalMatchCount: 0,
        maximumPossibleMatchCount: count,
        groupStageMatches: 0,
        knockoutMatches: count,
        totalCompetitionMatches: count,
      };
    }
  }
}

// ==========================================
// 3. Part 2: Capacity, Timeslots & Calendar Calculations
// ==========================================

export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(h)}:${pad(m)}`;
}

export function formatDateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Part 2: How Venues, Screens & Timeslots Are Calculated
 *
 * 1. Daily Timeslots per Screen
 * Match Time = slotDuration + turnoverDuration (in minutes)
 * Operating Minutes = (eventEndTime - eventStartTime) - lunchBreakDuration
 * Slots Per Screen Per Day = floor(Operating Minutes / Match Time)
 *
 * 2. Total Daily Capacity Across All Venues
 * Total Daily Slots = (Slots Per Screen Per Day) * (Total Screens across all Venues)
 *
 * 3. Total Playing Days Needed
 * Total Days Needed = ceil(Total Matches / Total Daily Slots)
 */
export function calculateCapacity(
  input: CapacityCalculationInput,
): CapacityCalculationResult {
  const matchTimeMinutes = input.slotDuration + input.turnoverDuration;
  if (matchTimeMinutes <= 0) {
    return {
      matchTimeMinutes: 0,
      operatingMinutes: 0,
      slotsPerScreenPerDay: 0,
      totalScreens: 0,
      totalDailySlots: 0,
      totalMatches: input.totalMatches,
      totalPlayingDaysNeeded: 0,
    };
  }

  const startMinutes = timeStringToMinutes(input.dailyStart);
  const endMinutes = timeStringToMinutes(input.dailyEnd);
  const grossMinutes = Math.max(0, endMinutes - startMinutes);

  let lunchMinutes = 0;
  if (input.lunchBreakTime && input.lunchDuration && input.lunchDuration > 0) {
    lunchMinutes = input.lunchDuration;
  }

  const operatingMinutes = Math.max(0, grossMinutes - lunchMinutes);
  const slotsPerScreenPerDay = Math.floor(operatingMinutes / matchTimeMinutes);

  const totalScreens = (input.venues || []).reduce(
    (acc, v) => acc + (v.screens ? v.screens.length : 0),
    0,
  );

  const totalDailySlots = slotsPerScreenPerDay * totalScreens;

  const totalPlayingDaysNeeded =
    totalDailySlots > 0
      ? Math.ceil(input.totalMatches / totalDailySlots)
      : Math.max(1, input.totalMatches > 0 ? 1 : 0);

  return {
    matchTimeMinutes,
    operatingMinutes,
    slotsPerScreenPerDay,
    totalScreens,
    totalDailySlots,
    totalMatches: input.totalMatches,
    totalPlayingDaysNeeded,
  };
}

/**
 * Generates the timeslot strings (e.g. ['10:00', '10:30', ...]) for a day
 * based on daily start, daily end, match duration, turnover duration, and lunch break.
 */
export function calculateDayTimeslots(
  dailyStart: string,
  dailyEnd: string,
  matchDuration: number,
  turnoverDuration: number,
  lunchBreakTime?: string | null,
  lunchDuration?: number | null,
): string[] {
  const timeslots: string[] = [];
  const totalSlotMinutes = matchDuration + turnoverDuration;

  if (totalSlotMinutes <= 0) return timeslots;

  const startMinutes = timeStringToMinutes(dailyStart);
  const endMinutes = timeStringToMinutes(dailyEnd);

  if (endMinutes <= startMinutes) return timeslots;

  let lunchStartMinutes: number | null = null;
  let lunchEndMinutes: number | null = null;

  if (lunchBreakTime && lunchDuration && lunchDuration > 0) {
    lunchStartMinutes = timeStringToMinutes(lunchBreakTime);
    lunchEndMinutes = lunchStartMinutes + lunchDuration;
  }

  let currentMinutes = startMinutes;

  while (currentMinutes + matchDuration <= endMinutes) {
    const slotStart = currentMinutes;
    const slotEnd = slotStart + matchDuration;

    // Check lunch collision
    let inLunch = false;
    if (lunchStartMinutes !== null && lunchEndMinutes !== null) {
      if (
        (slotStart >= lunchStartMinutes && slotStart < lunchEndMinutes) ||
        (slotEnd > lunchStartMinutes && slotEnd <= lunchEndMinutes) ||
        (slotStart <= lunchStartMinutes && slotEnd >= lunchEndMinutes)
      ) {
        inLunch = true;
      }
    }

    if (inLunch && lunchEndMinutes !== null) {
      currentMinutes = lunchEndMinutes;
      continue;
    }

    timeslots.push(minutesToTimeString(slotStart));
    currentMinutes += totalSlotMinutes;
  }

  return timeslots;
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/**
 * Generates an array of ISO date strings ('YYYY-MM-DD') for the tournament.
 */
export function generatePlayingDates(
  startDate: Date | string,
  totalDaysNeeded: number,
  frequencyStatus: FrequencyStatus = FrequencyStatus.DAILY,
  frequencyArray: string[] = [],
  buffer = 0,
): string[] {
  if (totalDaysNeeded <= 0) return [];

  const start = new Date(startDate);
  const dates: string[] = [];
  const currentDate = new Date(start);

  const allowedDayIndices = (frequencyArray || [])
    .map((name) => DAY_NAME_TO_INDEX[name.trim().toLowerCase()])
    .filter((idx) => idx !== undefined);

  if (
    frequencyStatus === FrequencyStatus.WEEKLY &&
    allowedDayIndices.length > 0
  ) {
    let loopGuard = 0;
    while (dates.length < totalDaysNeeded && loopGuard < 1000) {
      loopGuard++;
      const dayOfWeek = currentDate.getDay();
      if (allowedDayIndices.includes(dayOfWeek)) {
        dates.push(formatDateToYMD(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    for (let i = 0; i < totalDaysNeeded; i++) {
      dates.push(formatDateToYMD(currentDate));
      currentDate.setDate(currentDate.getDate() + 1 + buffer);
    }
  }

  return dates;
}

/**
 * Builds the basic empty calendar schedule structure for all venues and screens.
 */
export function buildEmptyScheduleGrid(
  venues: ScheduleVenueInput[],
  eventDates: string[],
  dayTimeslots: string[],
  schedulingPolicy?: {
    isWindowOpen?: boolean;
    windowOpenTime?: string;
    windowCloseTime?: string;
  },
): VenueSchedule[] {
  const policy = {
    isWindowOpen: schedulingPolicy?.isWindowOpen ?? false,
    windowOpenTime: schedulingPolicy?.windowOpenTime ?? '',
    windowCloseTime: schedulingPolicy?.windowCloseTime ?? '',
  };

  return (venues || []).map((venue) => {
    const screens: ScreenSchedule[] = (venue.screens || []).map((screen) => {
      const days: DaySchedule[] = eventDates.map((dateStr) => ({
        date: dateStr,
        timeslots: dayTimeslots.map((timeStr) => ({
          time: timeStr,
          game: null,
          canonicalMatchId: null,
        })),
        schedulingPolicy: { ...policy },
      }));

      return {
        screenId: screen.screenId,
        screenName: screen.screenName,
        days,
      };
    });

    return {
      venueId: venue.venueId,
      venueName: venue.name,
      screens,
    };
  });
}

// ==========================================
// 4. Bracket & Group Helpers
// ==========================================

export function nextPowerOfTwo(n: number): number {
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  if (n <= 16) return 16;
  if (n <= 32) return 32;
  if (n <= 64) return 64;
  return 128;
}

export function getStandardSeedOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  if (size === 4) return [1, 4, 2, 3];
  if (size === 8) return [1, 8, 4, 5, 2, 7, 3, 6];
  if (size === 16) {
    return [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];
  }
  if (size === 32) {
    return [
      1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21, 2, 31, 15, 18,
      7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22,
    ];
  }

  let base = [1, 4, 2, 3];
  let currentSize = 4;
  while (currentSize < size) {
    const next: number[] = [];
    const nextSum = currentSize * 2 + 1;
    for (const s of base) {
      next.push(s);
      next.push(nextSum - s);
    }
    base = next;
    currentSize *= 2;
  }
  return base;
}

export function roundName(entrants: number): string {
  if (entrants === 2) return 'Final';
  if (entrants === 4) return 'Semifinals';
  if (entrants === 8) return 'Quarterfinal';
  return `Round of ${entrants}`;
}

export function generateGroups(
  tournamentId: string,
  teams: number,
  groupsCount = 4,
): TournamentGroupEntity[] {
  const groups: TournamentGroupEntity[] = [];
  const numGroups = Math.min(groupsCount, Math.max(1, Math.floor(teams / 2)));
  const baseSize = Math.floor(teams / numGroups);
  const remainder = teams % numGroups;

  let currentSlot = 1;
  for (let g = 0; g < numGroups; g++) {
    const groupName = `Group ${String.fromCharCode(65 + g)}`;
    const size = baseSize + (g < remainder ? 1 : 0);
    const slotNumbers: number[] = [];
    for (let s = 0; s < size; s++) {
      if (currentSlot <= teams) {
        slotNumbers.push(currentSlot++);
      }
    }
    groups.push({
      id: `group-${tournamentId}-${g + 1}`,
      tournamentId,
      name: groupName,
      slotNumbers,
      standings: slotNumbers.map((slotNum) => ({
        slotNumber: slotNum,
        played: 0,
        wins: 0,
        losses: 0,
        points: 0,
      })),
    });
  }
  return groups;
}

export function resolveParticipants(
  providedParticipants: Participant[] | undefined,
  numberOfTeams: number,
  venues: ScheduleVenueInput[],
): Participant[] {
  const list: Participant[] = [];

  if (providedParticipants && providedParticipants.length > 0) {
    providedParticipants.forEach((p, idx) => {
      list.push({
        playerId: p.playerId || `p-${idx + 1}`,
        name: p.name || `Player ${idx + 1}`,
        homeVenueId:
          p.homeVenueId || venues[idx % Math.max(1, venues.length)]?.venueId,
      });
    });
  }

  return list;
}

export function populateParticipantDetails(
  matches: TournamentMatchEntity[],
  slots: TournamentPlayerSlot[],
  seeds: TournamentSeed[],
  participants: Participant[],
) {
  const participantMap = new Map<string, Participant>();
  participants.forEach((p) => participantMap.set(p.playerId, p));

  const slotMap = new Map<number, Participant>();
  slots.forEach((s) => {
    if (s.participantId) {
      const p = participantMap.get(s.participantId);
      if (p) slotMap.set(s.slotNumber, p);
    }
  });

  const seedMap = new Map<number, Participant>();
  seeds.forEach((s) => {
    if (s.participantId) {
      const p = participantMap.get(s.participantId);
      if (p) seedMap.set(s.seedNumber, p);
    }
  });

  for (const m of matches) {
    // Participant 1
    if (m.participant1Ref.type === 'TOURNAMENT_SLOT') {
      const slotNum = parseInt(m.participant1Ref.value, 10);
      const p = slotMap.get(slotNum);
      if (p) {
        m.player1Id = p.playerId;
        m.player1Name = p.name;
      }
    } else if (m.participant1Ref.type === 'SEED') {
      const seedNum = parseInt(m.participant1Ref.value, 10);
      const p = seedMap.get(seedNum);
      if (p) {
        m.player1Id = p.playerId;
        m.player1Name = p.name;
      }
    }

    // Participant 2
    if (m.participant2Ref.type === 'TOURNAMENT_SLOT') {
      const slotNum = parseInt(m.participant2Ref.value, 10);
      const p = slotMap.get(slotNum);
      if (p) {
        m.player2Id = p.playerId;
        m.player2Name = p.name;
      }
    } else if (m.participant2Ref.type === 'SEED') {
      const seedNum = parseInt(m.participant2Ref.value, 10);
      const p = seedMap.get(seedNum);
      if (p) {
        m.player2Id = p.playerId;
        m.player2Name = p.name;
      }
    }

    // Initialize self-scheduling clock when both participants are resolved on schedulable matches
    if (
      m.player1Id &&
      m.player2Id &&
      !m.player1Id.startsWith('TBD') &&
      !m.player2Id.startsWith('TBD') &&
      !m.player1Id.startsWith('BYE') &&
      !m.player2Id.startsWith('BYE') &&
      !m.isAutoAdvance &&
      !m.conditional &&
      m.isSchedulable !== false &&
      m.status !== 'COMPLETED' &&
      !m.selfSchedulingOpenedAt
    ) {
      m.selfSchedulingOpenedAt = new Date().toISOString();
    }
  }
}

// ==========================================
// 5. Structure Generation & Semantic Normalization
// ==========================================

export function normalizeMatchSemantics(
  input: TournamentMatchEntity[],
): TournamentMatchEntity[] {
  const byId = new Map(input.map((m) => [m.id, m]));
  const normalized = new Map<string, TournamentMatchEntity>();
  const visiting = new Set<string>();

  const effective = (ref: MatchParticipantRef): MatchParticipantRef => {
    if (ref.type !== 'MATCH_WINNER' && ref.type !== 'MATCH_LOSER') return ref;
    const source = byId.get(ref.value);
    if (!source || visiting.has(source.id)) return ref;
    const resolved = visit(source);
    if (!resolved.isAutoAdvance) return ref;
    return ref.type === 'MATCH_WINNER'
      ? (resolved.winnerRef ?? { type: 'BYE', value: 'BYE' })
      : { type: 'BYE', value: 'BYE' };
  };

  const visit = (match: TournamentMatchEntity): TournamentMatchEntity => {
    if (normalized.has(match.id)) return normalized.get(match.id)!;
    visiting.add(match.id);
    const p1 = effective(match.participant1Ref);
    const p2 = effective(match.participant2Ref);
    const auto = p1.type === 'BYE' || p2.type === 'BYE';
    const result: TournamentMatchEntity = {
      ...match,
      participant1Ref: p1,
      participant2Ref: p2,
      isAutoAdvance: auto,
      isSchedulable:
        auto || match.conditional ? false : (match.isSchedulable ?? true),
    };

    if (auto) {
      result.status = 'COMPLETED';
      result.winnerRef = p1.type === 'BYE' ? p2 : p1;
      result.loserRef = { type: 'BYE', value: 'BYE' };
      delete result.venueId;
      delete result.screenId;
      delete result.date;
      delete result.time;
      delete result.selfSchedulingOpenedAt;
    }

    if (result.conditional && !result.isSchedulable) {
      delete result.selfSchedulingOpenedAt;
    }

    visiting.delete(match.id);
    normalized.set(match.id, result);
    return result;
  };

  return input.map(visit);
}

export function summarizeTournamentMatches(
  matches: TournamentMatchEntity[],
): TournamentStructureSummary {
  const guaranteed = matches.filter((m) => !m.isAutoAdvance && !m.conditional);
  const conditional = matches.filter((m) => m.conditional && !m.isAutoAdvance);

  return {
    structuralNodes: matches.length,
    groupStageMatches: guaranteed.filter((m) => m.bracketSection === 'GROUP')
      .length,
    knockoutMatches: guaranteed.filter((m) => m.bracketSection !== 'GROUP')
      .length,
    winnersBracketMatches: guaranteed.filter(
      (m) => m.bracketSection === 'WINNERS',
    ).length,
    losersBracketMatches: guaranteed.filter(
      (m) => m.bracketSection === 'LOSERS',
    ).length,
    finalMatches: guaranteed.filter((m) => m.bracketSection === 'FINAL').length,
    schedulableMatches: guaranteed.filter((m) => m.isSchedulable !== false)
      .length,
    conditionalMatches: conditional.length,
    autoAdvanceCount: matches.filter((m) => m.isAutoAdvance).length,
    totalCompetitionMatches: guaranteed.length,
    guaranteedMatchCount: guaranteed.length,
    conditionalMatchCount: conditional.length,
    maximumPossibleMatchCount: guaranteed.length + conditional.length,
  };
}

export function generateCanonicalStructure(
  tournamentId: string,
  format: TournamentFormat,
  teams: number,
  groupsCount?: number,
  participants?: Participant[],
  thirdPlacePlayoffEnabled = true,
): {
  slots: TournamentPlayerSlot[];
  seeds: TournamentSeed[];
  groups: TournamentGroupEntity[];
  matches: TournamentMatchEntity[];
  summary: TournamentStructureSummary;
} {
  const slots: TournamentPlayerSlot[] = [];
  for (let i = 1; i <= teams; i++) {
    const p = participants && participants[i - 1];
    slots.push({
      id: `slot-${tournamentId}-${i}`,
      tournamentId,
      slotNumber: i,
      status: p ? 'ASSIGNED' : 'UNASSIGNED',
      participantId: p?.playerId,
      participantName: p?.name,
    });
  }

  const powerOfTwoSize = nextPowerOfTwo(teams);
  const seeds: TournamentSeed[] = [];
  for (let i = 1; i <= powerOfTwoSize; i++) {
    const p = participants && participants[i - 1];
    seeds.push({
      seedNumber: i,
      participantId: p?.playerId,
      slotNumber: i <= teams ? i : undefined,
      source: i > teams ? 'BYE' : `Seed ${i}`,
    });
  }

  const isHybrid =
    format === TournamentFormat.LEAGUE_AND_KNOCKOUT ||
    format === TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE;
  const isLeague =
    format === TournamentFormat.LEAGUE ||
    format === TournamentFormat.LEAGUE_DOUBLE;

  const groups: TournamentGroupEntity[] = isHybrid
    ? generateGroups(
        tournamentId,
        teams,
        groupsCount || Math.max(1, Math.floor(teams / 4)),
      )
    : [];

  const matches: TournamentMatchEntity[] = [];

  const addMatch = (
    id: string,
    round: string,
    section: TournamentMatchEntity['bracketSection'],
    p1: MatchParticipantRef,
    p2: MatchParticipantRef,
  ): TournamentMatchEntity => {
    const m: TournamentMatchEntity = {
      id,
      tournamentId,
      round,
      bracketSection: section,
      participant1Ref: p1,
      participant2Ref: p2,
      status: 'SCHEDULED',
      score1: null,
      score2: null,
      isAutoAdvance: false,
      isSchedulable: true,
    };
    matches.push(m);
    return m;
  };

  const sourceRef = (
    type: MatchParticipantRefType,
    value: string,
  ): MatchParticipantRef => ({ type, value });
  const byeRef = (): MatchParticipantRef => ({ type: 'BYE', value: 'BYE' });
  const seeded = (seed: number): MatchParticipantRef =>
    seed > teams ? byeRef() : sourceRef('SEED', String(seed));

  if (teams >= 2) {
    if (isLeague || isHybrid) {
      const pools = isHybrid
        ? groups
        : [{ name: 'League', slotNumbers: slots.map((s) => s.slotNumber) }];
      const isDouble =
        format === TournamentFormat.LEAGUE_DOUBLE ||
        format === TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE;

      let num = 0;
      for (const pool of pools) {
        for (let i = 0; i < pool.slotNumbers.length; i++) {
          for (let j = i + 1; j < pool.slotNumbers.length; j++) {
            for (let leg = 1; leg <= (isDouble ? 2 : 1); leg++) {
              const pair = [pool.slotNumbers[i], pool.slotNumbers[j]];
              if (leg === 2) pair.reverse();
              num++;
              const id = `match-${tournamentId}-grp-${pool.name.replace(/\s+/g, '').toLowerCase()}-m${num}`;
              const m = addMatch(
                id,
                `${isHybrid ? 'Group Stage' : 'League'}${leg === 2 ? ' (Leg 2)' : ''}`,
                'GROUP',
                sourceRef('TOURNAMENT_SLOT', String(pair[0])),
                sourceRef('TOURNAMENT_SLOT', String(pair[1])),
              );
              m.matchNumber = num;
            }
          }
        }
      }
    }

    if (format === TournamentFormat.SINGLE_ELIMINATION || isHybrid) {
      const qualifiers = groups.flatMap((g) =>
        [1, 2].map((pos) => sourceRef('GROUP_POSITION', `${g.name} #${pos}`)),
      );
      const entrants = isHybrid ? qualifiers.length : teams;
      const seedOrder = getStandardSeedOrder(nextPowerOfTwo(entrants));
      let currentRefs = seedOrder.map((s) =>
        isHybrid ? (qualifiers[s - 1] ?? byeRef()) : seeded(s),
      );

      let level = 1;
      let semifinals: Array<{
        winner: MatchParticipantRef;
        loser: MatchParticipantRef;
      }> = [];

      while (currentRefs.length > 1) {
        const roundTitle = roundName(currentRefs.length);
        const nextRefs: Array<{
          winner: MatchParticipantRef;
          loser: MatchParticipantRef;
        }> = [];

        for (let i = 0; i < currentRefs.length; i += 2) {
          const id = `match-${tournamentId}-ko-r${level}-${i / 2 + 1}`;
          const m = addMatch(
            id,
            roundTitle,
            currentRefs.length === 2 ? 'FINAL' : 'WINNERS',
            currentRefs[i],
            currentRefs[i + 1],
          );
          m.matchNumber = i / 2 + 1;

          if (
            format === TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE &&
            currentRefs.length > 2
          ) {
            const tieId = `tie-${tournamentId}-ko-r${level}-${i / 2 + 1}`;
            const leg2Id = `${id}-leg2`;
            const leg2 = addMatch(
              leg2Id,
              roundTitle,
              'WINNERS',
              currentRefs[i + 1],
              currentRefs[i],
            );
            Object.assign(m, {
              tieId,
              legNumber: 1,
              legCount: 2,
              aggregateAdvancement: true,
            });
            Object.assign(leg2, {
              tieId,
              legNumber: 2,
              legCount: 2,
              aggregateAdvancement: true,
              matchNumber: m.matchNumber,
            });
            nextRefs.push({
              winner: sourceRef('TIE_WINNER', tieId),
              loser: sourceRef('TIE_LOSER', tieId),
            });
          } else {
            nextRefs.push({
              winner: sourceRef('MATCH_WINNER', m.id),
              loser: sourceRef('MATCH_LOSER', m.id),
            });
          }
        }

        if (roundTitle === 'Semifinals') {
          semifinals = nextRefs;
        }
        currentRefs = nextRefs.map((n) => n.winner);
        level++;
      }

      if (thirdPlacePlayoffEnabled && semifinals.length === 2) {
        const thirdPlaceMatch = addMatch(
          `match-${tournamentId}-ko-third-place`,
          '3rd Place Playoff',
          'FINAL',
          semifinals[0].loser,
          semifinals[1].loser,
        );
        thirdPlaceMatch.matchNumber = 99;
      }
    } else if (format === TournamentFormat.DOUBLE_ELIMINATION) {
      const size = nextPowerOfTwo(teams);
      const order = getStandardSeedOrder(size);
      const winnersRounds: TournamentMatchEntity[][] = [];
      let entrants = order.map(seeded);
      let wbRound = 1;

      while (entrants.length > 1) {
        const roundMatches: TournamentMatchEntity[] = [];
        for (let i = 0; i < entrants.length; i += 2) {
          roundMatches.push(
            addMatch(
              `match-${tournamentId}-wb-r${wbRound}-${i / 2 + 1}`,
              `WB ${roundName(entrants.length)}`,
              'WINNERS',
              entrants[i],
              entrants[i + 1],
            ),
          );
        }
        winnersRounds.push(roundMatches);
        entrants = roundMatches.map((m) => sourceRef('MATCH_WINNER', m.id));
        wbRound++;
      }

      const wbFinal = winnersRounds[winnersRounds.length - 1][0];
      let lbChampion: MatchParticipantRef;

      if (size === 2) {
        lbChampion = sourceRef('MATCH_LOSER', wbFinal.id);
      } else {
        let survivors: MatchParticipantRef[] = [];
        let lbRound = 1;
        const opening = winnersRounds[0];

        for (let i = 0; i < opening.length; i += 2) {
          const m = addMatch(
            `match-${tournamentId}-lb-r${lbRound}-${i / 2 + 1}`,
            `Losers Round ${lbRound}`,
            'LOSERS',
            sourceRef('MATCH_LOSER', opening[i].id),
            sourceRef('MATCH_LOSER', opening[i + 1].id),
          );
          survivors.push(sourceRef('MATCH_WINNER', m.id));
        }

        for (let r = 1; r < winnersRounds.length; r++) {
          lbRound++;
          const drops = winnersRounds[r];
          survivors = survivors.map((ref, i) => {
            const dropIndex = drops.length > 1 ? i ^ 1 : i;
            const last = r === winnersRounds.length - 1;
            const m = addMatch(
              `match-${tournamentId}-lb-r${lbRound}-${i + 1}`,
              last ? 'Losers Final' : `Losers Round ${lbRound}`,
              'LOSERS',
              ref,
              sourceRef('MATCH_LOSER', drops[dropIndex].id),
            );
            return sourceRef('MATCH_WINNER', m.id);
          });

          if (r < winnersRounds.length - 1) {
            lbRound++;
            const consolidated: MatchParticipantRef[] = [];
            for (let i = 0; i < survivors.length; i += 2) {
              const m = addMatch(
                `match-${tournamentId}-lb-r${lbRound}-${i / 2 + 1}`,
                `Losers Round ${lbRound}`,
                'LOSERS',
                survivors[i],
                survivors[i + 1],
              );
              consolidated.push(sourceRef('MATCH_WINNER', m.id));
            }
            survivors = consolidated;
          }
        }

        lbChampion = survivors[0];
      }

      const gf = addMatch(
        `match-${tournamentId}-gf`,
        'Grand Final',
        'FINAL',
        sourceRef('MATCH_WINNER', wbFinal.id),
        lbChampion,
      );

      const reset = addMatch(
        `match-${tournamentId}-gf-reset`,
        'Grand Final Reset',
        'FINAL',
        sourceRef('MATCH_WINNER', gf.id),
        sourceRef('MATCH_LOSER', gf.id),
      );
      Object.assign(reset, {
        conditional: true,
        conditionType: 'GRAND_FINAL_RESET',
        conditionMatchId: gf.id,
        isSchedulable: false,
      });
    }
  }

  // Connect backlinks
  for (const m of matches) {
    for (const ref of [m.participant1Ref, m.participant2Ref]) {
      const source = matches.find((other) => other.id === ref.value);
      if (source && ref.type === 'MATCH_WINNER') {
        source.nextMatchWinnerTargetId = m.id;
      }
      if (source && ref.type === 'MATCH_LOSER') {
        source.nextMatchLoserTargetId = m.id;
      }
    }
  }

  // Resolve player names/IDs onto canonical matches if participants supplied
  if (participants && participants.length > 0) {
    populateParticipantDetails(matches, slots, seeds, participants);
  }

  // Normalize BYE auto-advances
  const normalizedMatches = normalizeMatchSemantics(matches);

  const summary = summarizeTournamentMatches(normalizedMatches);

  return {
    slots,
    seeds,
    groups,
    matches: normalizedMatches,
    summary,
  };
}

// ==========================================
// 6. Physical Slot Allocation Operations
// ==========================================

export function assignMatchesToSchedule(
  calendar: VenueSchedule[],
  matches: TournamentMatchEntity[],
  participants: Participant[],
  mode: SchedulingMode,
): VenueSchedule[] {
  const updatedCalendar: VenueSchedule[] = JSON.parse(JSON.stringify(calendar));

  const participantMap = new Map<string, Participant>();
  participants.forEach((p) => participantMap.set(p.playerId, p));

  const schedulableMatches = matches.filter(
    (m) =>
      m.isSchedulable !== false &&
      !m.isAutoAdvance &&
      !m.conditional &&
      m.status !== 'COMPLETED',
  );

  const playerBookings = new Map<string, Set<string>>();

  const isPlayerBusy = (
    playerId: string | undefined,
    date: string,
    time: string,
  ): boolean => {
    if (!playerId || playerId.startsWith('BYE') || playerId.startsWith('TBD'))
      return false;
    const key = `${date}@${time}`;
    return playerBookings.get(playerId)?.has(key) ?? false;
  };

  const bookPlayer = (
    playerId: string | undefined,
    date: string,
    time: string,
  ) => {
    if (!playerId || playerId.startsWith('BYE') || playerId.startsWith('TBD'))
      return;
    const key = `${date}@${time}`;
    if (!playerBookings.has(playerId)) {
      playerBookings.set(playerId, new Set());
    }
    playerBookings.get(playerId)!.add(key);
  };

  if (mode === SchedulingMode.AUTO_RANDOM) {
    interface OpenSlotRef {
      slot: Timeslot;
      venueId: string;
      venueName: string;
      screenId: string;
      screenName: string;
      date: string;
    }
    const openSlots: OpenSlotRef[] = [];

    for (const venue of updatedCalendar) {
      for (const screen of venue.screens) {
        for (const day of screen.days) {
          for (const slot of day.timeslots) {
            if (!slot.game) {
              openSlots.push({
                slot,
                venueId: venue.venueId,
                venueName: venue.venueName,
                screenId: screen.screenId,
                screenName: screen.screenName,
                date: day.date,
              });
            }
          }
        }
      }
    }

    const shuffledMatches = [...schedulableMatches].sort(
      () => Math.random() - 0.5,
    );
    const shuffledSlots = [...openSlots].sort(() => Math.random() - 0.5);

    for (const match of shuffledMatches) {
      const slotIdx = shuffledSlots.findIndex(
        (os) =>
          !os.slot.game &&
          !isPlayerBusy(match.player1Id, os.date, os.slot.time) &&
          !isPlayerBusy(match.player2Id, os.date, os.slot.time),
      );

      if (slotIdx !== -1) {
        const { slot, venueId, venueName, screenId, screenName, date } =
          shuffledSlots[slotIdx];

        slot.canonicalMatchId = match.id;
        slot.game = {
          id: match.id,
          canonicalMatchId: match.id,
          player1Id: match.player1Id || 'TBD',
          player1Name: match.player1Name || 'TBD',
          player2Id: match.player2Id || 'TBD',
          player2Name: match.player2Name || 'TBD',
          score1: match.score1,
          score2: match.score2,
          status: match.status,
          round: match.round,
          matchNumber: match.matchNumber,
          bracketSection: match.bracketSection,
          venueId,
          venueName,
          screenId,
          screenName,
          date,
          time: slot.time,
        };

        match.venueId = venueId;
        match.venueName = venueName;
        match.screenId = screenId;
        match.screenName = screenName;
        match.date = date;
        match.time = slot.time;

        bookPlayer(match.player1Id, date, slot.time);
        bookPlayer(match.player2Id, date, slot.time);
        shuffledSlots.splice(slotIdx, 1);
      }
    }

    return updatedCalendar;
  }

  // AUTO_HOME_VENUE Mode
  for (const match of schedulableMatches) {
    const p1 = match.player1Id
      ? participantMap.get(match.player1Id)
      : undefined;
    const p2 = match.player2Id
      ? participantMap.get(match.player2Id)
      : undefined;

    const p1Home = p1?.homeVenueId;
    const p2Home = p2?.homeVenueId;

    const venuePriorities: string[] = [];
    if (p1Home && p2Home && p1Home === p2Home) {
      venuePriorities.push(p1Home);
    } else {
      if (p1Home) venuePriorities.push(p1Home);
      if (p2Home && !venuePriorities.includes(p2Home)) {
        venuePriorities.push(p2Home);
      }
    }

    updatedCalendar.forEach((v) => {
      if (!venuePriorities.includes(v.venueId)) {
        venuePriorities.push(v.venueId);
      }
    });

    let assigned = false;

    for (const venueId of venuePriorities) {
      if (assigned) break;
      const venueSched = updatedCalendar.find((v) => v.venueId === venueId);
      if (!venueSched) continue;

      for (const screen of venueSched.screens) {
        if (assigned) break;

        for (const day of screen.days) {
          if (assigned) break;

          for (const slot of day.timeslots) {
            if (slot.game === null) {
              const p1Busy = isPlayerBusy(match.player1Id, day.date, slot.time);
              const p2Busy = isPlayerBusy(match.player2Id, day.date, slot.time);

              if (!p1Busy && !p2Busy) {
                slot.canonicalMatchId = match.id;
                slot.game = {
                  id: match.id,
                  canonicalMatchId: match.id,
                  player1Id: match.player1Id || 'TBD',
                  player1Name: match.player1Name || 'TBD',
                  player2Id: match.player2Id || 'TBD',
                  player2Name: match.player2Name || 'TBD',
                  score1: match.score1,
                  score2: match.score2,
                  status: match.status,
                  round: match.round,
                  matchNumber: match.matchNumber,
                  bracketSection: match.bracketSection,
                  venueId: venueSched.venueId,
                  venueName: venueSched.venueName,
                  screenId: screen.screenId,
                  screenName: screen.screenName,
                  date: day.date,
                  time: slot.time,
                };

                match.venueId = venueSched.venueId;
                match.venueName = venueSched.venueName;
                match.screenId = screen.screenId;
                match.screenName = screen.screenName;
                match.date = day.date;
                match.time = slot.time;

                bookPlayer(match.player1Id, day.date, slot.time);
                bookPlayer(match.player2Id, day.date, slot.time);
                assigned = true;
                break;
              }
            }
          }
        }
      }
    }
  }

  return updatedCalendar;
}

export function allocateMatch(
  schedulePayload: TournamentSchedulePayload,
  matchId: string,
  venueId: string,
  screenId: string,
  date: string,
  time: string,
): {
  updatedSchedule: TournamentSchedulePayload;
  match: TournamentMatchEntity;
  allocation: {
    id: string;
    canonicalMatchId: string;
    venueId: string;
    screenId: string;
    date: string;
    time: string;
  };
} {
  const schedule: TournamentSchedulePayload = JSON.parse(
    JSON.stringify(schedulePayload),
  );

  const match = (schedule.structure.matches || []).find(
    (m) => m.id === matchId,
  );
  if (!match) {
    throw new NotFoundException(
      `Canonical match with ID ${matchId} not found in tournament structure.`,
    );
  }

  const venue = (schedule.calendar || []).find((v) => v.venueId === venueId);
  if (!venue) {
    throw new BadRequestException(
      `Target venue with ID ${venueId} does not exist in this tournament schedule.`,
    );
  }

  const screen = venue.screens.find((s) => s.screenId === screenId);
  if (!screen) {
    throw new BadRequestException(
      `Target screen with ID ${screenId} does not exist in venue ${venue.venueName}.`,
    );
  }

  const day = screen.days.find((d) => d.date === date);
  if (!day) {
    throw new BadRequestException(
      `Date ${date} is not an active playing date in this tournament schedule.`,
    );
  }

  const targetSlot = day.timeslots.find((t) => t.time === time);
  if (!targetSlot) {
    throw new BadRequestException(
      `Timeslot ${time} does not exist on date ${date} for screen ${screen.screenName}.`,
    );
  }

  if (targetSlot.canonicalMatchId && targetSlot.canonicalMatchId !== matchId) {
    throw new BadRequestException(
      `Screen "${screen.screenName}" timeslot ${time} on ${date} is already occupied by match ${targetSlot.canonicalMatchId}.`,
    );
  }

  if (match.player1Id || match.player2Id) {
    for (const v of schedule.calendar) {
      for (const s of v.screens) {
        const d = s.days.find((dayItem) => dayItem.date === date);
        if (d) {
          const slot = d.timeslots.find((slotItem) => slotItem.time === time);
          if (slot?.game && slot.canonicalMatchId !== matchId) {
            const game = slot.game;
            if (
              match.player1Id &&
              (game.player1Id === match.player1Id ||
                game.player2Id === match.player1Id)
            ) {
              throw new BadRequestException(
                `Player collision: Player 1 (${match.player1Name || match.player1Id}) is already scheduled for match ${game.id} at ${date} ${time}.`,
              );
            }
            if (
              match.player2Id &&
              (game.player2Id === match.player2Id ||
                game.player1Id === match.player2Id)
            ) {
              throw new BadRequestException(
                `Player collision: Player 2 (${match.player2Name || match.player2Id}) is already scheduled for match ${game.id} at ${date} ${time}.`,
              );
            }
          }
        }
      }
    }
  }

  // Free previous slot if match was already allocated elsewhere
  for (const v of schedule.calendar) {
    for (const s of v.screens) {
      for (const d of s.days) {
        for (const slot of d.timeslots) {
          if (slot.canonicalMatchId === matchId) {
            slot.game = null;
            slot.canonicalMatchId = null;
          }
        }
      }
    }
  }

  // CRITICAL INVARIANT: Never overwrite existing scores
  const existingScore1 = match.score1;
  const existingScore2 = match.score2;
  const existingStatus = match.status;

  targetSlot.canonicalMatchId = match.id;
  targetSlot.game = {
    id: match.id,
    canonicalMatchId: match.id,
    player1Id: match.player1Id || 'TBD',
    player1Name: match.player1Name || 'TBD',
    player2Id: match.player2Id || 'TBD',
    player2Name: match.player2Name || 'TBD',
    score1: existingScore1,
    score2: existingScore2,
    status: existingStatus,
    round: match.round,
    matchNumber: match.matchNumber,
    bracketSection: match.bracketSection,
    venueId: venue.venueId,
    venueName: venue.venueName,
    screenId: screen.screenId,
    screenName: screen.screenName,
    date,
    time,
  };

  match.venueId = venue.venueId;
  match.venueName = venue.venueName;
  match.screenId = screen.screenId;
  match.screenName = screen.screenName;
  match.date = date;
  match.time = time;
  match.score1 = existingScore1;
  match.score2 = existingScore2;
  match.status = existingStatus;

  return {
    updatedSchedule: schedule,
    match,
    allocation: {
      id: `alloc-${match.id}`,
      canonicalMatchId: match.id,
      venueId: venue.venueId,
      screenId: screen.screenId,
      date,
      time,
    },
  };
}

export function unallocateMatch(
  schedulePayload: TournamentSchedulePayload,
  matchId: string,
): {
  updatedSchedule: TournamentSchedulePayload;
  match: TournamentMatchEntity;
} {
  const schedule: TournamentSchedulePayload = JSON.parse(
    JSON.stringify(schedulePayload),
  );

  const match = (schedule.structure.matches || []).find(
    (m) => m.id === matchId,
  );
  if (!match) {
    throw new NotFoundException(
      `Canonical match with ID ${matchId} not found in tournament schedule.`,
    );
  }

  for (const v of schedule.calendar) {
    for (const s of v.screens) {
      for (const d of s.days) {
        for (const slot of d.timeslots) {
          if (slot.canonicalMatchId === matchId) {
            slot.game = null;
            slot.canonicalMatchId = null;
          }
        }
      }
    }
  }

  delete match.venueId;
  delete match.venueName;
  delete match.screenId;
  delete match.screenName;
  delete match.date;
  delete match.time;

  return {
    updatedSchedule: schedule,
    match,
  };
}
