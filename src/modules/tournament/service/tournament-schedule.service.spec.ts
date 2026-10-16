import { Test, TestingModule } from '@nestjs/testing';
import {
  TournamentScheduleService,
  ScheduleVenueInput,
  Participant,
} from './tournament-schedule.service';
import { TournamentFormat, SchedulingMode, FrequencyStatus } from '@prisma/client';

describe('TournamentScheduleService', () => {
  let service: TournamentScheduleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TournamentScheduleService],
    }).compile();

    service = module.get<TournamentScheduleService>(TournamentScheduleService);
  });

  describe('Part 2: Capacity and Timeslot Calculations', () => {
    const venues: ScheduleVenueInput[] = [
      {
        venueId: 'v-1',
        name: 'Venue 1',
        screens: [
          { screenId: 's-1-1', screenName: 'Screen 1' },
          { screenId: 's-1-2', screenName: 'Screen 2' },
        ],
      },
      {
        venueId: 'v-2',
        name: 'Venue 2',
        screens: [
          { screenId: 's-2-1', screenName: 'Screen 1' },
          { screenId: 's-2-2', screenName: 'Screen 2' },
        ],
      },
    ];

    it('should calculate 18 slots per screen per day for 10:00-20:00 with 60 min lunch and 30 min match', () => {
      const capacity = service.calculateCapacity({
        dailyStart: '10:00',
        dailyEnd: '20:00',
        slotDuration: 25,
        turnoverDuration: 5,
        lunchBreakTime: '14:00',
        lunchDuration: 60,
        venues,
        totalMatches: 56,
      });

      // Match Time = 25 + 5 = 30
      expect(capacity.matchTimeMinutes).toBe(30);
      // Operating Minutes = 600 - 60 = 540
      expect(capacity.operatingMinutes).toBe(540);
      // Slots Per Screen Per Day = floor(540 / 30) = 18
      expect(capacity.slotsPerScreenPerDay).toBe(18);
      // Total Screens across 2 venues = 4
      expect(capacity.totalScreens).toBe(4);
      // Total Daily Capacity = 18 * 4 = 72
      expect(capacity.totalDailySlots).toBe(72);
      // For 56 matches with 72 slots/day -> ceil(56 / 72) = 1 day needed
      expect(capacity.totalPlayingDaysNeeded).toBe(1);
    });

    it('should calculate 3 playing days needed for 150 matches with 72 slots/day', () => {
      const capacity = service.calculateCapacity({
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
      // ceil(150 / 72) = 3
      expect(capacity.totalPlayingDaysNeeded).toBe(3);
    });

    it('should generate exact timeslots skipping lunch break', () => {
      const timeslots = service.calculateDayTimeslots(
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
      // Should skip 14:00-15:00 and resume at 15:00
      expect(timeslots[8]).toBe('15:00');
      expect(timeslots[17]).toBe('19:30');
    });

    it('should schedule playing days on allowed days of the week', () => {
      // Start on a Wednesday: 2026-10-07
      // Allowed days: Saturdays & Sundays
      const dates = service.generatePlayingDates(
        '2026-10-07',
        2,
        FrequencyStatus.WEEKLY,
        ['Sat', 'Sun'],
      );

      expect(dates.length).toBe(2);
      // First Saturday is 2026-10-10, first Sunday is 2026-10-11
      expect(dates[0]).toBe('2026-10-10');
      expect(dates[1]).toBe('2026-10-11');
    });
  });

  describe('Part 3: Structure Generation & Scheduling', () => {
    const venues: ScheduleVenueInput[] = [
      {
        venueId: 'venue-north',
        name: 'North Venue',
        screens: [{ screenId: 'screen-n1', screenName: 'Station 1' }],
      },
      {
        venueId: 'venue-south',
        name: 'South Venue',
        screens: [{ screenId: 'screen-s1', screenName: 'Station 1' }],
      },
    ];

    const participants: Participant[] = [
      { playerId: 'p1', name: 'Player 1', homeVenueId: 'venue-north' },
      { playerId: 'p2', name: 'Player 2', homeVenueId: 'venue-north' },
      { playerId: 'p3', name: 'Player 3', homeVenueId: 'venue-south' },
      { playerId: 'p4', name: 'Player 4', homeVenueId: 'venue-south' },
    ];

    it('should generate canonical structure with slots, seeds, and canonical matches', async () => {
      const schedule = await service.generateSchedule({
        tournamentId: 't-1',
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        schedulingMode: SchedulingMode.MANUAL,
        numberOfTeams: 4,
        startDate: '2026-10-10',
        dailyStart: '10:00',
        dailyEnd: '18:00',
        matchDuration: 25,
        turnoverDuration: 5,
        venues,
        participants,
      });

      expect(schedule.structure.slots.length).toBe(4);
      expect(schedule.structure.matches.length).toBeGreaterThan(0);
      expect(schedule.structure.matches[0].id).toBeDefined();
      expect(schedule.structure.matches[0].participant1Ref).toBeDefined();
      expect(schedule.structure.matches[0].participant2Ref).toBeDefined();

      // In MANUAL mode, calendar timeslots start empty
      const firstSlot = schedule.calendar[0].screens[0].days[0].timeslots[0];
      expect(firstSlot.game).toBeNull();
    });

    it('should assign shared home venue in AUTO_HOME_VENUE mode', async () => {
      const schedule = await service.generateSchedule({
        tournamentId: 't-home',
        tournamentFormat: TournamentFormat.LEAGUE,
        schedulingMode: SchedulingMode.AUTO_HOME_VENUE,
        numberOfTeams: 4,
        startDate: '2026-10-10',
        dailyStart: '10:00',
        dailyEnd: '18:00',
        matchDuration: 25,
        turnoverDuration: 5,
        venues,
        participants,
      });

      // Match between P1 & P2 should prefer 'venue-north'
      const matchP1P2 = schedule.structure.matches.find(
        (m) =>
          (m.player1Id === 'p1' && m.player2Id === 'p2') ||
          (m.player1Id === 'p2' && m.player2Id === 'p1'),
      );

      expect(matchP1P2).toBeDefined();
      expect(matchP1P2?.venueId).toBe('venue-north');
    });

    it('should allocate match to physical slot and NEVER overwrite existing scores', async () => {
      const schedule = await service.generateSchedule({
        tournamentId: 't-alloc',
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        schedulingMode: SchedulingMode.MANUAL,
        numberOfTeams: 4,
        startDate: '2026-10-10',
        dailyStart: '10:00',
        dailyEnd: '18:00',
        matchDuration: 25,
        turnoverDuration: 5,
        venues,
        participants,
      });

      const match = schedule.structure.matches[0];
      // Simulate existing score on match
      match.score1 = 3;
      match.score2 = 1;
      match.status = 'COMPLETED';

      const targetDate = schedule.capacity.eventDates[0];
      const targetTime = '10:00';

      const { updatedSchedule, match: allocatedMatch } = service.allocateMatch(
        schedule,
        match.id,
        'venue-north',
        'screen-n1',
        targetDate,
        targetTime,
      );

      // Verify physical slot assigned
      expect(allocatedMatch.venueId).toBe('venue-north');
      expect(allocatedMatch.screenId).toBe('screen-n1');
      expect(allocatedMatch.date).toBe(targetDate);
      expect(allocatedMatch.time).toBe(targetTime);

      // CRITICAL INVARIANT: Scores must not be overwritten!
      expect(allocatedMatch.score1).toBe(3);
      expect(allocatedMatch.score2).toBe(1);
      expect(allocatedMatch.status).toBe('COMPLETED');

      // Verify calendar slot in updatedSchedule has the match with scores preserved
      const slot = updatedSchedule.calendar
        .find((v) => v.venueId === 'venue-north')
        ?.screens.find((s) => s.screenId === 'screen-n1')
        ?.days.find((d) => d.date === targetDate)
        ?.timeslots.find((t) => t.time === targetTime);

      expect(slot?.canonicalMatchId).toBe(match.id);
      expect(slot?.game?.score1).toBe(3);
      expect(slot?.game?.score2).toBe(1);
    });
  });
});
