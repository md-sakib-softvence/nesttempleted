import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  TournamentFormat,
  SchedulingMode,
  FrequencyStatus,
} from '@prisma/client';

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

export interface Participant {
  playerId: string;
  name: string;
  homeVenueId?: string;
}

export interface ScheduleVenueInput {
  venueId: string;
  name: string;
  screens: Array<{ screenId: string; screenName: string }>;
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

@Injectable()
export class TournamentScheduleService {
  private readonly logger = new Logger(TournamentScheduleService.name);

  private readonly dayNameToIndex: Record<string, number> = {
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

    const startMinutes = this.timeStringToMinutes(input.dailyStart);
    const endMinutes = this.timeStringToMinutes(input.dailyEnd);
    const grossMinutes = Math.max(0, endMinutes - startMinutes);

    let lunchMinutes = 0;
    if (
      input.lunchBreakTime &&
      input.lunchDuration &&
      input.lunchDuration > 0
    ) {
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
  calculateDayTimeslots(
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

    const startMinutes = this.timeStringToMinutes(dailyStart);
    const endMinutes = this.timeStringToMinutes(dailyEnd);

    if (endMinutes <= startMinutes) return timeslots;

    let lunchStartMinutes: number | null = null;
    let lunchEndMinutes: number | null = null;

    if (lunchBreakTime && lunchDuration && lunchDuration > 0) {
      lunchStartMinutes = this.timeStringToMinutes(lunchBreakTime);
      lunchEndMinutes = lunchStartMinutes + lunchDuration;
    }

    let currentMinutes = startMinutes;

    while (currentMinutes + matchDuration <= endMinutes) {
      // Check if slot overlaps with lunch break
      if (
        lunchStartMinutes !== null &&
        lunchEndMinutes !== null &&
        currentMinutes < lunchEndMinutes &&
        currentMinutes + matchDuration > lunchStartMinutes
      ) {
        // Jump past lunch break
        currentMinutes = lunchEndMinutes;
        continue;
      }

      timeslots.push(this.minutesToTimeString(currentMinutes));
      currentMinutes += totalSlotMinutes;
    }

    return timeslots;
  }

  /**
   * Generates valid playing date strings (YYYY-MM-DD) based on tournament start date,
   * frequency (DAILY, WEEKLY, MONTHLY), allowed days of the week, total required days, and buffer.
   */
  generatePlayingDates(
    startDate: Date | string,
    neededDays: number,
    frequencyStatus: FrequencyStatus = FrequencyStatus.DAILY,
    frequencyArray: string[] = [],
    buffer = 0,
  ): string[] {
    const totalDaysToCollect = Math.max(1, neededDays + (buffer || 0));
    const dates: string[] = [];

    const allowedDaysSet = new Set<number>();
    if (frequencyArray && frequencyArray.length > 0) {
      for (const item of frequencyArray) {
        const cleaned = String(item).trim().toLowerCase();
        if (this.dayNameToIndex[cleaned] !== undefined) {
          allowedDaysSet.add(this.dayNameToIndex[cleaned]);
        } else {
          const num = parseInt(cleaned, 10);
          if (!isNaN(num) && num >= 0 && num <= 6) {
            allowedDaysSet.add(num);
          }
        }
      }
    }

    // Default to all 7 days if frequencyArray is empty
    if (allowedDaysSet.size === 0) {
      for (let i = 0; i <= 6; i++) allowedDaysSet.add(i);
    }

    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);

    let safetyLoops = 0;
    const maxSafetyLoops = 365 * 2;

    while (dates.length < totalDaysToCollect && safetyLoops < maxSafetyLoops) {
      safetyLoops++;
      const dayOfWeek = cursor.getDay();

      if (allowedDaysSet.has(dayOfWeek)) {
        dates.push(this.formatDateToYMD(cursor));
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
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

    const powerOfTwoSize = this.nextPowerOfTwo(teams);
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
      ? this.generateGroups(
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
          [1, 2].map((pos) =>
            sourceRef('GROUP_POSITION', `${g.name} #${pos}`),
          ),
        );
        const entrants = isHybrid ? qualifiers.length : teams;
        const seedOrder = this.getStandardSeedOrder(
          this.nextPowerOfTwo(entrants),
        );
        let currentRefs = seedOrder.map((s) =>
          isHybrid ? qualifiers[s - 1] ?? byeRef() : seeded(s),
        );

        let level = 1;
        let semifinals: Array<{
          winner: MatchParticipantRef;
          loser: MatchParticipantRef;
        }> = [];

        while (currentRefs.length > 1) {
          const roundTitle = this.roundName(currentRefs.length);
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
        const size = this.nextPowerOfTwo(teams);
        const order = this.getStandardSeedOrder(size);
        const winnersRounds: TournamentMatchEntity[][] = [];
        let entrants = order.map(seeded);
        let wbRound = 1;

        while (entrants.length > 1) {
          const roundMatches: TournamentMatchEntity[] = [];
          for (let i = 0; i < entrants.length; i += 2) {
            roundMatches.push(
              addMatch(
                `match-${tournamentId}-wb-r${wbRound}-${i / 2 + 1}`,
                `WB ${this.roundName(entrants.length)}`,
                'WINNERS',
                entrants[i],
                entrants[i + 1],
              ),
            );
          }
          winnersRounds.push(roundMatches);
          entrants = roundMatches.map((m) =>
            sourceRef('MATCH_WINNER', m.id),
          );
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
      this.populateParticipantDetails(matches, slots, seeds, participants);
    }

    // Normalize BYE auto-advances
    const normalizedMatches = this.normalizeMatchSemantics(matches);

    const summary = this.summarizeTournamentMatches(normalizedMatches);

    return {
      slots,
      seeds,
      groups,
      matches: normalizedMatches,
      summary,
    };
  }

  /**
   * Normalizes match semantics by following structural BYE auto-advances.
   */
  normalizeMatchSemantics(
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
        ? resolved.winnerRef ?? { type: 'BYE', value: 'BYE' }
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
        result.winnerRef =
          p1.type === 'BYE' ? p2 : p1;
        result.loserRef = { type: 'BYE', value: 'BYE' };
        delete result.venueId;
        delete result.screenId;
        delete result.date;
        delete result.time;
      }

      visiting.delete(match.id);
      normalized.set(match.id, result);
      return result;
    };

    return input.map(visit);
  }

  /**
   * Produces match counts summary.
   */
  summarizeTournamentMatches(
    matches: TournamentMatchEntity[],
  ): TournamentStructureSummary {
    const guaranteed = matches.filter(
      (m) => !m.isAutoAdvance && !m.conditional,
    );
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
      finalMatches: guaranteed.filter((m) => m.bracketSection === 'FINAL')
        .length,
      schedulableMatches: guaranteed.filter((m) => m.isSchedulable !== false)
        .length,
      conditionalMatches: matches.filter(
        (m) => m.conditional && !m.isAutoAdvance,
      ).length,
      autoAdvanceCount: matches.filter((m) => m.isAutoAdvance).length,
      totalCompetitionMatches: guaranteed.length,
    };
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

  /**
   * Main scheduling engine:
   * 1. Calculates capacity metrics (Part 2).
   * 2. Generates canonical tournament structure and canonical matches (POST /tournaments).
   * 3. Generates calendar grid (POST /tournaments/{id}/calendar).
   * 4. Allocates matches based on schedulingMode (Part 3).
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
    const participants = this.resolveParticipants(
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
   *
   * AUTO_HOME_VENUE (Home Venue Priority):
   * When registering, players select their homeVenueId.
   * Priority 1: Both players have the same home venue -> assign to that venue.
   * Priority 2: Player 1's home venue.
   * Priority 3: Player 2's home venue.
   * Priority 4: Any remaining venue with open slots.
   *
   * AUTO_RANDOM:
   * Collects all open slots across all venues and dates.
   * Shuffles matches and slots to randomly distribute games across screens and times.
   */
  assignMatchesToSchedule(
    calendar: VenueSchedule[],
    matches: TournamentMatchEntity[],
    participants: Participant[],
    mode: SchedulingMode,
  ): VenueSchedule[] {
    const updatedCalendar: VenueSchedule[] = JSON.parse(
      JSON.stringify(calendar),
    );

    const participantMap = new Map<string, Participant>();
    participants.forEach((p) => participantMap.set(p.playerId, p));

    // Filter unassigned schedulable matches
    const schedulableMatches = matches.filter(
      (m) =>
        m.isSchedulable !== false &&
        !m.isAutoAdvance &&
        !m.conditional &&
        m.status !== 'COMPLETED',
    );

    // Track player busy times (playerId -> Set of "YYYY-MM-DD@HH:mm")
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
      // Collect all available timeslot references
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

      // Shuffle matches and slots
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
      // Priority 1: Both have the same home venue
      if (p1Home && p2Home && p1Home === p2Home) {
        venuePriorities.push(p1Home);
      } else {
        // Priority 2: Player 1 home venue
        if (p1Home) venuePriorities.push(p1Home);
        // Priority 3: Player 2 home venue
        if (p2Home && !venuePriorities.includes(p2Home)) {
          venuePriorities.push(p2Home);
        }
      }

      // Priority 4: Any remaining venue
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
                const p1Busy = isPlayerBusy(
                  match.player1Id,
                  day.date,
                  slot.time,
                );
                const p2Busy = isPlayerBusy(
                  match.player2Id,
                  day.date,
                  slot.time,
                );

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

  /**
   * Physical Allocations (POST /tournaments/{id}/matches/{id}/allocate):
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
    const schedule: TournamentSchedulePayload = JSON.parse(
      JSON.stringify(schedulePayload),
    );

    // 1. Find canonical match
    const match = (schedule.structure.matches || []).find(
      (m) => m.id === matchId,
    );
    if (!match) {
      throw new NotFoundException(
        `Canonical match with ID ${matchId} not found in tournament structure.`,
      );
    }

    // 2. Validate target venue and screen
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

    // 3. Validate day and timeslot
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

    // Check if slot is occupied by another match
    if (
      targetSlot.canonicalMatchId &&
      targetSlot.canonicalMatchId !== matchId
    ) {
      throw new BadRequestException(
        `Screen "${screen.screenName}" timeslot ${time} on ${date} is already occupied by match ${targetSlot.canonicalMatchId}.`,
      );
    }

    // 4. Validate player collision at target (date, time) across all screens/venues
    if (match.player1Id || match.player2Id) {
      for (const v of schedule.calendar) {
        for (const s of v.screens) {
          const d = s.days.find((dayItem) => dayItem.date === date);
          if (d) {
            const slot = d.timeslots.find((slotItem) => slotItem.time === time);
            if (
              slot?.game &&
              slot.canonicalMatchId !== matchId
            ) {
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

    // 5. Free previous slot if match was already allocated elsewhere
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

    // 6. INVARIANT: Never overwrite existing scores
    const existingScore1 = match.score1;
    const existingScore2 = match.score2;
    const existingStatus = match.status;

    // 7. Place match into target slot
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

    // 8. Update canonical match record
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

    // Free slot in calendar
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

    // Retain scores, clear physical location
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

  // --- Private Helpers ---

  private resolveParticipants(
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

    const remaining = numberOfTeams - list.length;
    for (let i = 0; i < remaining; i++) {
      const idx = list.length + 1;
      list.push({
        playerId: `player-${idx}`,
        name: `Player ${idx}`,
        homeVenueId: venues[i % Math.max(1, venues.length)]?.venueId,
      });
    }

    return list;
  }

  private populateParticipantDetails(
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
    }
  }

  private generateGroups(
    tournamentId: string,
    teams: number,
    groupsCount = 4,
  ): TournamentGroupEntity[] {
    const groups: TournamentGroupEntity[] = [];
    const numGroups = Math.min(
      groupsCount,
      Math.max(1, Math.floor(teams / 2)),
    );
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

  private nextPowerOfTwo(n: number): number {
    if (n <= 2) return 2;
    if (n <= 4) return 4;
    if (n <= 8) return 8;
    if (n <= 16) return 16;
    if (n <= 32) return 32;
    if (n <= 64) return 64;
    return 128;
  }

  private getStandardSeedOrder(size: number): number[] {
    if (size === 2) return [1, 2];
    if (size === 4) return [1, 4, 2, 3];
    if (size === 8) return [1, 8, 4, 5, 2, 7, 3, 6];
    if (size === 16) {
      return [
        1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
      ];
    }
    if (size === 32) {
      return [
        1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21,
        2, 31, 15, 18, 7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22,
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

  private roundName(entrants: number): string {
    if (entrants === 2) return 'Final';
    if (entrants === 4) return 'Semifinals';
    if (entrants === 8) return 'Quarterfinal';
    return `Round of ${entrants}`;
  }

  private timeStringToMinutes(timeStr: string): number {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
    return (h || 0) * 60 + (m || 0);
  }

  private minutesToTimeString(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(h)}:${pad(m)}`;
  }

  private formatDateToYMD(date: Date): string {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${y}-${pad(m)}-${pad(d)}`;
  }
}
