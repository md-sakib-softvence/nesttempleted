import { Injectable, Logger } from '@nestjs/common';
import { TournamentFormat, SchedulingMode, FrequencyStatus } from '@prisma/client';

export interface ScheduledGame {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  score1: number | null;
  score2: number | null;
  status: string;
  round?: string;
  matchNumber?: number;
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
   * Generates the timeslot strings (e.g. ['09:00', '09:20', ...]) for a day
   * based on daily start, daily end, match duration, turnover duration, and optional lunch break.
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

    if (totalSlotMinutes <= 0) {
      return timeslots;
    }

    const startMinutes = this.timeStringToMinutes(dailyStart);
    const endMinutes = this.timeStringToMinutes(dailyEnd);

    if (endMinutes <= startMinutes) {
      return timeslots;
    }

    let lunchStartMinutes: number | null = null;
    let lunchEndMinutes: number | null = null;

    if (lunchBreakTime && lunchDuration && lunchDuration > 0) {
      lunchStartMinutes = this.timeStringToMinutes(lunchBreakTime);
      lunchEndMinutes = lunchStartMinutes + lunchDuration;
    }

    let currentMinutes = startMinutes;

    while (currentMinutes + matchDuration <= endMinutes) {
      const matchEndMinutes = currentMinutes + matchDuration;

      // Check if this slot overlaps with lunch break
      const overlapsWithLunch =
        lunchStartMinutes !== null &&
        lunchEndMinutes !== null &&
        currentMinutes < lunchEndMinutes &&
        matchEndMinutes > lunchStartMinutes;

      if (!overlapsWithLunch) {
        timeslots.push(this.minutesToTimeString(currentMinutes));
      }

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

      let isAllowed = false;
      if (frequencyStatus === FrequencyStatus.DAILY) {
        isAllowed = allowedDaysSet.has(dayOfWeek);
      } else if (frequencyStatus === FrequencyStatus.WEEKLY) {
        isAllowed = allowedDaysSet.has(dayOfWeek);
      } else if (frequencyStatus === FrequencyStatus.MONTHLY) {
        isAllowed = allowedDaysSet.has(dayOfWeek);
      } else {
        isAllowed = true;
      }

      if (isAllowed) {
        dates.push(this.formatDateToYMD(cursor));
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }

  /**
   * Calculates the total number of expected matches for a tournament format and team count.
   */
  calculateExpectedMatches(
    format: TournamentFormat,
    teams: number,
    groupsCount?: number,
  ): number {
    if (teams < 2) return 0;

    switch (format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        return teams > 2 ? teams : teams - 1;

      case TournamentFormat.DOUBLE_ELIMINATION:
        return (teams - 1) * 2 + 1;

      case TournamentFormat.LEAGUE:
        return (teams * (teams - 1)) / 2;

      case TournamentFormat.LEAGUE_DOUBLE:
        return teams * (teams - 1);

      case TournamentFormat.LEAGUE_AND_KNOCKOUT:
      case TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE: {
        const numGroups = groupsCount || Math.max(1, Math.floor(teams / 4));
        const baseGroupSize = Math.floor(teams / numGroups);
        const extraTeams = teams % numGroups;

        let totalGroupGames = 0;
        for (let i = 0; i < numGroups; i++) {
          const size = baseGroupSize + (i < extraTeams ? 1 : 0);
          if (size >= 2) {
            if (format === TournamentFormat.LEAGUE_AND_KNOCKOUT) {
              totalGroupGames += (size * (size - 1)) / 2;
            } else {
              totalGroupGames += size * (size - 1);
            }
          }
        }

        let totalKnockoutGames = 0;
        if (format === TournamentFormat.LEAGUE_AND_KNOCKOUT) {
          if (numGroups === 2) {
            totalKnockoutGames = 4;
          } else if (numGroups === 4) {
            totalKnockoutGames = 8;
          } else {
            totalKnockoutGames = numGroups;
            if (numGroups > 1) {
              totalKnockoutGames += Math.floor(numGroups / 2) + 2;
            }
          }
        } else {
          if (numGroups === 2) {
            totalKnockoutGames = 5;
          } else if (numGroups === 4) {
            totalKnockoutGames = 13;
          } else {
            totalKnockoutGames = numGroups * 2;
            if (numGroups > 1) {
              totalKnockoutGames += Math.floor(numGroups / 2) * 2 + 1;
            }
          }
        }

        return totalGroupGames + totalKnockoutGames;
      }

      default:
        return (teams * (teams - 1)) / 2;
    }
  }

  /**
   * Generates participant fixture pairings based on tournament format.
   */
  generateFixtures(
    format: TournamentFormat,
    participants: Participant[],
    groupsCount?: number,
  ): Array<{
    player1: Participant;
    player2: Participant;
    round: string;
    matchNumber: number;
  }> {
    const fixtures: Array<{
      player1: Participant;
      player2: Participant;
      round: string;
      matchNumber: number;
    }> = [];

    let matchCounter = 1;

    if (
      format === TournamentFormat.LEAGUE ||
      format === TournamentFormat.LEAGUE_DOUBLE
    ) {
      const n = participants.length;
      const players = [...participants];
      if (n % 2 !== 0) {
        players.push({ playerId: 'BYE', name: 'BYE' });
      }

      const totalRounds = players.length - 1;
      const halfSize = players.length / 2;

      for (let round = 0; round < totalRounds; round++) {
        for (let i = 0; i < halfSize; i++) {
          const p1 = players[i];
          const p2 = players[players.length - 1 - i];

          if (p1.playerId !== 'BYE' && p2.playerId !== 'BYE') {
            fixtures.push({
              player1: p1,
              player2: p2,
              round: `Round ${round + 1}`,
              matchNumber: matchCounter++,
            });
          }
        }
        players.splice(1, 0, players.pop()!);
      }

      if (format === TournamentFormat.LEAGUE_DOUBLE) {
        const leg1Count = fixtures.length;
        for (let i = 0; i < leg1Count; i++) {
          const match = fixtures[i];
          fixtures.push({
            player1: match.player2,
            player2: match.player1,
            round: `Return Leg - ${match.round}`,
            matchNumber: matchCounter++,
          });
        }
      }
    } else if (format === TournamentFormat.SINGLE_ELIMINATION) {
      const n = participants.length;
      const targetSize = n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 16;
      const padded = [...participants];
      while (padded.length < targetSize) {
        padded.push({
          playerId: `BYE_${padded.length + 1}`,
          name: 'BYE',
        });
      }

      if (targetSize <= 2) {
        fixtures.push({
          player1: padded[0],
          player2: padded[1],
          round: 'Final',
          matchNumber: matchCounter++,
        });
      } else if (targetSize <= 4) {
        fixtures.push({
          player1: padded[0],
          player2: padded[1],
          round: 'Semifinal 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: padded[2],
          player2: padded[3],
          round: 'Semifinal 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_SF1_W', name: 'Winner SF 1' },
          player2: { playerId: 'TBD_SF2_W', name: 'Winner SF 2' },
          round: 'Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_SF1_L', name: 'Loser SF 1' },
          player2: { playerId: 'TBD_SF2_L', name: 'Loser SF 2' },
          round: '3rd Place Playoff',
          matchNumber: matchCounter++,
        });
      } else if (targetSize <= 8) {
        for (let i = 0; i < 4; i++) {
          fixtures.push({
            player1: padded[2 * i],
            player2: padded[2 * i + 1],
            round: `Quarterfinal ${i + 1}`,
            matchNumber: matchCounter++,
          });
        }
        fixtures.push({
          player1: { playerId: 'TBD_QF1_W', name: 'Winner QF 1' },
          player2: { playerId: 'TBD_QF2_W', name: 'Winner QF 2' },
          round: 'Semifinal 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_QF3_W', name: 'Winner QF 3' },
          player2: { playerId: 'TBD_QF4_W', name: 'Winner QF 4' },
          round: 'Semifinal 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_SF1_W', name: 'Winner SF 1' },
          player2: { playerId: 'TBD_SF2_W', name: 'Winner SF 2' },
          round: 'Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_SF1_L', name: 'Loser SF 1' },
          player2: { playerId: 'TBD_SF2_L', name: 'Loser SF 2' },
          round: '3rd Place Playoff',
          matchNumber: matchCounter++,
        });
      } else {
        for (let i = 0; i < 8; i++) {
          fixtures.push({
            player1: padded[2 * i],
            player2: padded[2 * i + 1],
            round: `Round of 16 - Match ${i + 1}`,
            matchNumber: matchCounter++,
          });
        }
        for (let i = 0; i < 4; i++) {
          fixtures.push({
            player1: {
              playerId: `TBD_R16_${2 * i + 1}_W`,
              name: `Winner R16 Match ${2 * i + 1}`,
            },
            player2: {
              playerId: `TBD_R16_${2 * i + 2}_W`,
              name: `Winner R16 Match ${2 * i + 2}`,
            },
            round: `Quarterfinal ${i + 1}`,
            matchNumber: matchCounter++,
          });
        }
        fixtures.push({
          player1: { playerId: 'TBD_QF1_W', name: 'Winner QF 1' },
          player2: { playerId: 'TBD_QF2_W', name: 'Winner QF 2' },
          round: 'Semifinal 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_QF3_W', name: 'Winner QF 3' },
          player2: { playerId: 'TBD_QF4_W', name: 'Winner QF 4' },
          round: 'Semifinal 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_SF1_W', name: 'Winner SF 1' },
          player2: { playerId: 'TBD_SF2_W', name: 'Winner SF 2' },
          round: 'Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_SF1_L', name: 'Loser SF 1' },
          player2: { playerId: 'TBD_SF2_L', name: 'Loser SF 2' },
          round: '3rd Place Playoff',
          matchNumber: matchCounter++,
        });
      }
    } else if (format === TournamentFormat.DOUBLE_ELIMINATION) {
      const n = participants.length;
      const targetSize = n <= 4 ? 4 : 8;
      const padded = [...participants];
      while (padded.length < targetSize) {
        padded.push({
          playerId: `BYE_${padded.length + 1}`,
          name: 'BYE',
        });
      }

      if (targetSize <= 4) {
        fixtures.push({
          player1: padded[0],
          player2: padded[1],
          round: 'Winners Bracket SF 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: padded[2],
          player2: padded[3],
          round: 'Winners Bracket SF 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_SF1_W', name: 'Winner WB SF 1' },
          player2: { playerId: 'TBD_WB_SF2_W', name: 'Winner WB SF 2' },
          round: 'Winners Bracket Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_SF1_L', name: 'Loser WB SF 1' },
          player2: { playerId: 'TBD_WB_SF2_L', name: 'Loser WB SF 2' },
          round: 'Losers Bracket Round 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_LB_R1_W', name: 'Winner LB R1' },
          player2: { playerId: 'TBD_WB_F_L', name: 'Loser WB Final' },
          round: 'Losers Bracket Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_F_W', name: 'Winner WB Final' },
          player2: { playerId: 'TBD_LB_F_W', name: 'Winner LB Final' },
          round: 'Grand Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_GF_P1', name: 'Grand Finalist 1' },
          player2: { playerId: 'TBD_GF_P2', name: 'Grand Finalist 2' },
          round: 'Grand Final (Reset If Needed)',
          matchNumber: matchCounter++,
        });
      } else {
        for (let i = 0; i < 4; i++) {
          fixtures.push({
            player1: padded[2 * i],
            player2: padded[2 * i + 1],
            round: `Winners Bracket QF ${i + 1}`,
            matchNumber: matchCounter++,
          });
        }
        fixtures.push({
          player1: { playerId: 'TBD_WB_QF1_W', name: 'Winner WB QF 1' },
          player2: { playerId: 'TBD_WB_QF2_W', name: 'Winner WB QF 2' },
          round: 'Winners Bracket SF 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_QF3_W', name: 'Winner WB QF 3' },
          player2: { playerId: 'TBD_WB_QF4_W', name: 'Winner WB QF 4' },
          round: 'Winners Bracket SF 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_SF1_W', name: 'Winner WB SF 1' },
          player2: { playerId: 'TBD_WB_SF2_W', name: 'Winner WB SF 2' },
          round: 'Winners Bracket Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_QF1_L', name: 'Loser WB QF 1' },
          player2: { playerId: 'TBD_WB_QF2_L', name: 'Loser WB QF 2' },
          round: 'Losers Bracket R1 Match 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_QF3_L', name: 'Loser WB QF 3' },
          player2: { playerId: 'TBD_WB_QF4_L', name: 'Loser WB QF 4' },
          round: 'Losers Bracket R1 Match 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_LB_R1_M1_W', name: 'Winner LB R1 M1' },
          player2: { playerId: 'TBD_WB_SF1_L', name: 'Loser WB SF 1' },
          round: 'Losers Bracket R2 Match 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_LB_R1_M2_W', name: 'Winner LB R1 M2' },
          player2: { playerId: 'TBD_WB_SF2_L', name: 'Loser WB SF 2' },
          round: 'Losers Bracket R2 Match 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_LB_R2_M1_W', name: 'Winner LB R2 M1' },
          player2: { playerId: 'TBD_LB_R2_M2_W', name: 'Winner LB R2 M2' },
          round: 'Losers Bracket Semifinal',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_LB_SF_W', name: 'Winner LB SF' },
          player2: { playerId: 'TBD_WB_F_L', name: 'Loser WB Final' },
          round: 'Losers Bracket Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_WB_F_W', name: 'Winner WB Final' },
          player2: { playerId: 'TBD_LB_F_W', name: 'Winner LB Final' },
          round: 'Grand Final',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_GF_P1', name: 'Grand Finalist 1' },
          player2: { playerId: 'TBD_GF_P2', name: 'Grand Finalist 2' },
          round: 'Grand Final (Reset If Needed)',
          matchNumber: matchCounter++,
        });
      }
    } else {
      const numGroups = groupsCount || Math.max(1, Math.floor(participants.length / 4));
      const groups: Participant[][] = Array.from({ length: numGroups }, () => []);

      participants.forEach((p, idx) => {
        groups[idx % numGroups].push(p);
      });

      groups.forEach((group, gIdx) => {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            fixtures.push({
              player1: group[i],
              player2: group[j],
              round: `Group ${String.fromCharCode(65 + gIdx)} Match`,
              matchNumber: matchCounter++,
            });
            if (format === TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE) {
              fixtures.push({
                player1: group[j],
                player2: group[i],
                round: `Group ${String.fromCharCode(65 + gIdx)} Return Match`,
                matchNumber: matchCounter++,
              });
            }
          }
        }
      });

      if (numGroups >= 2) {
        fixtures.push({
          player1: { playerId: 'TBD_G1_W', name: 'Winner Group A' },
          player2: { playerId: 'TBD_G2_RU', name: 'Runner-up Group B' },
          round: 'Knockout SF 1',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_G2_W', name: 'Winner Group B' },
          player2: { playerId: 'TBD_G1_RU', name: 'Runner-up Group A' },
          round: 'Knockout SF 2',
          matchNumber: matchCounter++,
        });
        fixtures.push({
          player1: { playerId: 'TBD_SF1_W', name: 'Winner SF 1' },
          player2: { playerId: 'TBD_SF2_W', name: 'Winner SF 2' },
          round: 'Knockout Final',
          matchNumber: matchCounter++,
        });
      }
    }

    return fixtures;
  }

  /**
   * Builds the basic empty calendar schedule structure for all venues and screens.
   */
  buildEmptyScheduleGrid(
    venues: ScheduleVenueInput[],
    eventDates: string[],
    dayTimeslots: string[],
  ): VenueSchedule[] {
    return venues.map((venue) => {
      const screens: ScreenSchedule[] = (venue.screens || []).map((screen) => {
        const days: DaySchedule[] = eventDates.map((dateStr) => {
          return {
            date: dateStr,
            timeslots: dayTimeslots.map((timeStr) => ({
              time: timeStr,
              game: null,
            })),
            schedulingPolicy: {
              isWindowOpen: false,
              windowOpenTime: '',
              windowCloseTime: '',
            },
          };
        });

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
   * 1. Generates empty timeslots across all venues, screens, and active event days.
   * 2. If mode === MANUAL: returns the empty schedule structure.
   * 3. If mode === AUTO_HOME_VENUE:
   *    Generates tournament fixtures and assigns matches prioritizing home venues
   *    (Shared home venue -> Player 1 home venue -> Player 2 home venue -> other venues),
   *    ensuring no player has overlapping matches in the same timeslot.
   */
  async generateSchedule(
    params: GenerateScheduleParams,
  ): Promise<VenueSchedule[]> {
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
    } = params;

    if (!venues || venues.length === 0) {
      this.logger.warn('No venues supplied for tournament schedule generation.');
      return [];
    }

    // 1. Calculate timeslots available per day
    const dayTimeslots = this.calculateDayTimeslots(
      dailyStart,
      dailyEnd,
      matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
    );

    if (dayTimeslots.length === 0) {
      this.logger.warn('Calculated 0 timeslots for the given daily hours and durations.');
      return [];
    }

    // 2. Determine total playing days needed
    const totalScreens = venues.reduce(
      (acc, v) => acc + (v.screens ? v.screens.length : 0),
      0,
    );
    const slotsPerDay = dayTimeslots.length * Math.max(1, totalScreens);
    const expectedMatches = this.calculateExpectedMatches(
      tournamentFormat,
      numberOfTeams,
      groupsCount,
    );

    const neededDays = Math.max(
      1,
      Math.ceil(expectedMatches / Math.max(1, slotsPerDay)),
    );

    // 3. Generate active event dates
    const eventDates = this.generatePlayingDates(
      startDate,
      neededDays,
      frequencyStatus,
      frequencyArray,
      buffer,
    );

    // 4. Build base empty schedule grid
    const schedule = this.buildEmptyScheduleGrid(venues, eventDates, dayTimeslots);

    // If MANUAL mode, return the initialized empty grid for manual assignment
    if (schedulingMode === SchedulingMode.MANUAL) {
      return schedule;
    }

    // 5. AUTO_HOME_VENUE: Generate participants & assign matches with home venue priority
    const participants = this.resolveParticipants(
      params.participants,
      numberOfTeams,
      venues,
    );

    const fixtures = this.generateFixtures(
      tournamentFormat,
      participants,
      groupsCount,
    );

    this.logger.log(
      `Generated ${fixtures.length} fixtures for tournament ${tournamentId} in ${schedulingMode} mode with ${venues.length} venues.`,
    );

    // Track which players are playing at which (date, time) to prevent collisions
    const playerBookings = new Map<string, Set<string>>();

    const isPlayerBusy = (playerId: string, date: string, time: string): boolean => {
      if (playerId.startsWith('BYE') || playerId.startsWith('TBD')) return false;
      const key = `${date}@${time}`;
      return playerBookings.get(playerId)?.has(key) ?? false;
    };

    const bookPlayer = (playerId: string, date: string, time: string) => {
      if (playerId.startsWith('BYE') || playerId.startsWith('TBD')) return;
      const key = `${date}@${time}`;
      if (!playerBookings.has(playerId)) {
        playerBookings.set(playerId, new Set());
      }
      playerBookings.get(playerId)!.add(key);
    };

    // Assign fixtures
    for (const fixture of fixtures) {
      const { player1, player2, round, matchNumber } = fixture;

      // Determine venue priority order
      const venuePriorityList: string[] = [];

      const p1Home = player1.homeVenueId;
      const p2Home = player2.homeVenueId;

      if (p1Home && p2Home && p1Home === p2Home) {
        venuePriorityList.push(p1Home);
      } else {
        if (p1Home) venuePriorityList.push(p1Home);
        if (p2Home && !venuePriorityList.includes(p2Home)) {
          venuePriorityList.push(p2Home);
        }
      }

      venues.forEach((v) => {
        if (!venuePriorityList.includes(v.venueId)) {
          venuePriorityList.push(v.venueId);
        }
      });

      let assigned = false;

      for (const targetVenueId of venuePriorityList) {
        if (assigned) break;

        const venueSched = schedule.find((vs) => vs.venueId === targetVenueId);
        if (!venueSched) continue;

        for (const screen of venueSched.screens) {
          if (assigned) break;

          for (const day of screen.days) {
            if (assigned) break;

            for (const slot of day.timeslots) {
              if (slot.game === null) {
                const p1Busy = isPlayerBusy(player1.playerId, day.date, slot.time);
                const p2Busy = isPlayerBusy(player2.playerId, day.date, slot.time);

                if (!p1Busy && !p2Busy) {
                  const gameId = `match-${tournamentId}-${matchNumber}`;
                  slot.game = {
                    id: gameId,
                    player1Id: player1.playerId,
                    player1Name: player1.name,
                    player2Id: player2.playerId,
                    player2Name: player2.name,
                    score1: null,
                    score2: null,
                    status: 'SCHEDULED',
                    round,
                    matchNumber,
                    venueId: targetVenueId,
                    venueName: venueSched.venueName,
                    screenId: screen.screenId,
                    screenName: screen.screenName,
                    date: day.date,
                    time: slot.time,
                  };

                  bookPlayer(player1.playerId, day.date, slot.time);
                  bookPlayer(player2.playerId, day.date, slot.time);
                  assigned = true;
                  break;
                }
              }
            }
          }
        }
      }

      if (!assigned) {
        this.logger.warn(
          `Could not find an empty non-conflicting slot for match #${matchNumber} (${player1.name} vs ${player2.name}). Additional days or screens may be needed.`,
        );
      }
    }

    return schedule;
  }

  /**
   * Helper: guarantees a list of participants with names and home venue IDs.
   */
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
          homeVenueId: p.homeVenueId || venues[idx % venues.length]?.venueId,
        });
      });
    }

    const remaining = numberOfTeams - list.length;
    for (let i = 0; i < remaining; i++) {
      const idx = list.length + 1;
      list.push({
        playerId: `player-${idx}`,
        name: `Player ${idx}`,
        homeVenueId: venues[i % venues.length]?.venueId,
      });
    }

    return list;
  }

  private timeStringToMinutes(timeStr: string): number {
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
