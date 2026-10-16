import { Injectable, Logger } from '@nestjs/common';
import {
  TournamentFormat,
  SchedulingMode,
  FrequencyStatus,
} from '@prisma/client';
import {
  MatchParticipantRefType,
  MatchParticipantRef,
  TournamentPlayerSlot,
  TournamentSeed,
  TournamentGroupEntity,
  TournamentMatchEntity,
  TournamentStructureSummary,
  TournamentMatchCounts,
  ScheduledGame,
  Timeslot,
  DaySchedule,
  ScreenSchedule,
  VenueSchedule,
  ScheduleVenueInput,
  Participant,
  CapacityCalculationInput,
  CapacityCalculationResult,
  TournamentSchedulePayload,
  GenerateScheduleParams,
  ExpectedMatchesOptions,
  calculateLeagueMatches,
  calculateSingleEliminationMatches,
  calculateDoubleEliminationMatches,
  calculateHybridMatches,
  calculateTournamentExpectedMatches,
  calculateCapacity as calculateCapacityUtil,
  calculateDayTimeslots as calculateDayTimeslotsUtil,
  generatePlayingDates as generatePlayingDatesUtil,
  buildEmptyScheduleGrid as buildEmptyScheduleGridUtil,
  generateCanonicalStructure as generateCanonicalStructureUtil,
  normalizeMatchSemantics as normalizeMatchSemanticsUtil,
  summarizeTournamentMatches as summarizeTournamentMatchesUtil,
  assignMatchesToSchedule as assignMatchesToScheduleUtil,
  allocateMatch as allocateMatchUtil,
  unallocateMatch as unallocateMatchUtil,
  resolveParticipants as resolveParticipantsUtil,
} from '../utils/tournament-calculation.util';

export type {
  MatchParticipantRefType,
  MatchParticipantRef,
  TournamentPlayerSlot,
  TournamentSeed,
  TournamentGroupEntity,
  TournamentMatchEntity,
  TournamentStructureSummary,
  TournamentMatchCounts,
  ScheduledGame,
  Timeslot,
  DaySchedule,
  ScreenSchedule,
  VenueSchedule,
  ScheduleVenueInput,
  Participant,
  CapacityCalculationInput,
  CapacityCalculationResult,
  TournamentSchedulePayload,
  GenerateScheduleParams,
  ExpectedMatchesOptions,
};

@Injectable()
export class TournamentScheduleService {
  private readonly logger = new Logger(TournamentScheduleService.name);

  /**
   * Expected match counts according to tape eSports Calculation.docx:
   * - League Single: N(N - 1) / 2
   * - League Double: N(N - 1)
   * - Single Elimination: N - 1 (+ 1 for 3rd place)
   * - Double Elimination: 2N - 2 guaranteed, 1 conditional GF reset, 2N - 1 max
   * - Hybrid Single: group matches + K - 1 (+ 1 for 3rd place)
   * - Hybrid Double: double RR groups + 2-leg KO before final + single final (+ 1 for 3rd place)
   */
  calculateExpectedMatches(
    format: TournamentFormat,
    numberOfTeams: number,
    options?: ExpectedMatchesOptions,
  ): TournamentMatchCounts {
    return calculateTournamentExpectedMatches(format, numberOfTeams, options);
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
  calculateCapacity(
    input: CapacityCalculationInput,
  ): CapacityCalculationResult {
    return calculateCapacityUtil(input);
  }

  /**
   * Generates the timeslot strings (e.g. ['10:00', '10:30', ...]) for a day
   * based on daily start, daily end, match duration, turnover duration, and lunch break.
   */
  calculateDayTimeslots(
    dailyStart: string,
    dailyEnd: string,
    matchDuration: number,
    turnoverDuration: number,
    lunchBreakTime?: string | null,
    lunchDuration?: number | null,
  ): string[] {
    return calculateDayTimeslotsUtil(
      dailyStart,
      dailyEnd,
      matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
    );
  }

  /**
   * Generates an array of ISO date strings ('YYYY-MM-DD') for the tournament.
   */
  generatePlayingDates(
    startDate: Date | string,
    totalDaysNeeded: number,
    frequencyStatus: FrequencyStatus = FrequencyStatus.DAILY,
    frequencyArray: string[] = [],
    buffer = 0,
  ): string[] {
    return generatePlayingDatesUtil(
      startDate,
      totalDaysNeeded,
      frequencyStatus,
      frequencyArray,
      buffer,
    );
  }

  /**
   * Generates canonical tournament structure including slots, seeds, groups,
   * canonical match entities, and summary statistics.
   */
  generateCanonicalStructure(
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
    return generateCanonicalStructureUtil(
      tournamentId,
      format,
      teams,
      groupsCount,
      participants,
      thirdPlacePlayoffEnabled,
    );
  }

  /**
   * Normalizes match semantics by following structural BYE auto-advances.
   */
  normalizeMatchSemantics(
    input: TournamentMatchEntity[],
  ): TournamentMatchEntity[] {
    return normalizeMatchSemanticsUtil(input);
  }

  /**
   * Produces match counts summary.
   */
  summarizeTournamentMatches(
    matches: TournamentMatchEntity[],
  ): TournamentStructureSummary {
    return summarizeTournamentMatchesUtil(matches);
  }

  /**
   * Builds the basic empty calendar schedule structure for all venues and screens.
   */
  buildEmptyScheduleGrid(
    venues: ScheduleVenueInput[],
    eventDates: string[],
    dayTimeslots: string[],
    schedulingPolicy?: {
      isWindowOpen?: boolean;
      windowOpenTime?: string;
      windowCloseTime?: string;
    },
  ): VenueSchedule[] {
    return buildEmptyScheduleGridUtil(
      venues,
      eventDates,
      dayTimeslots,
      schedulingPolicy,
    );
  }

  /**
   * End-to-end schedule generation pipeline:
   * 1. Resolves participants.
   * 2. Generates canonical structure.
   * 3. Calculates capacity metrics.
   * 4. Generates active event dates.
   * 5. Calculates day timeslots.
   * 6. Builds base empty schedule grid.
   * 7. Allocates matches if in AUTO mode.
   */
  async generateSchedule(
    params: GenerateScheduleParams,
  ): Promise<TournamentSchedulePayload> {
    const {
      tournamentId = 't-default',
      tournamentFormat,
      schedulingMode,
      numberOfTeams,
      startDate,
      dailyStart,
      dailyEnd,
      matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
      buffer = 0,
      frequencyStatus = FrequencyStatus.DAILY,
      frequencyArray = [],
      venues,
      groupsCount,
      thirdPlacePlayoffEnabled = true,
      schedulingPolicy,
    } = params;

    // Resolve participants
    const participants = resolveParticipantsUtil(
      params.participants,
      numberOfTeams,
      venues,
    );

    // 1. Generate canonical structure
    const structure = this.generateCanonicalStructure(
      tournamentId,
      tournamentFormat,
      numberOfTeams,
      groupsCount,
      participants,
      thirdPlacePlayoffEnabled,
    );

    const schedulableCount =
      structure.summary.schedulableMatches ||
      structure.summary.totalCompetitionMatches;

    // 2. Calculate capacity metrics
    const capacity = this.calculateCapacity({
      dailyStart,
      dailyEnd,
      slotDuration: matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
      venues,
      totalMatches: schedulableCount,
    });

    // 3. Generate active event dates
    const eventDates = this.generatePlayingDates(
      startDate,
      capacity.totalPlayingDaysNeeded,
      frequencyStatus,
      frequencyArray,
      buffer,
    );

    // 4. Calculate day timeslots
    const dayTimeslots = this.calculateDayTimeslots(
      dailyStart,
      dailyEnd,
      matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
    );

    // 5. Build base empty schedule grid
    const calendar = this.buildEmptyScheduleGrid(
      venues,
      eventDates,
      dayTimeslots,
      schedulingPolicy,
    );

    // If MANUAL or PLAYER_SELF mode: return empty grid, matches remain unallocated
    if (
      schedulingMode === SchedulingMode.MANUAL ||
      schedulingMode === SchedulingMode.PLAYER_SELF
    ) {
      return {
        capacity: { ...capacity, eventDates },
        structure,
        calendar,
      };
    }

    // 6. AUTO_HOME_VENUE or AUTO_RANDOM: allocate schedulable matches
    const updatedCalendar = this.assignMatchesToSchedule(
      calendar,
      structure.matches,
      participants,
      schedulingMode,
    );

    return {
      capacity: { ...capacity, eventDates },
      structure,
      calendar: updatedCalendar,
    };
  }

  /**
   * Assigns matches into empty timeslots according to schedulingMode:
   * - AUTO_HOME_VENUE (Home Venue Priority)
   * - AUTO_RANDOM
   */
  assignMatchesToSchedule(
    calendar: VenueSchedule[],
    matches: TournamentMatchEntity[],
    participants: Participant[],
    mode: SchedulingMode,
  ): VenueSchedule[] {
    return assignMatchesToScheduleUtil(calendar, matches, participants, mode);
  }

  /**
   * Physical Allocations:
   * Link a canonical match ID to a physical slot (venueId, screenId, date, time).
   *
   * CRITICAL INVARIANT:
   * "Never overwrite scores when moving a schedule slot."
   */
  allocateMatch(
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
    return allocateMatchUtil(
      schedulePayload,
      matchId,
      venueId,
      screenId,
      date,
      time,
    );
  }

  /**
   * Clears physical allocation of a match, preserving match scores and status.
   */
  unallocateMatch(
    schedulePayload: TournamentSchedulePayload,
    matchId: string,
  ): {
    updatedSchedule: TournamentSchedulePayload;
    match: TournamentMatchEntity;
  } {
    return unallocateMatchUtil(schedulePayload, matchId);
  }
}
