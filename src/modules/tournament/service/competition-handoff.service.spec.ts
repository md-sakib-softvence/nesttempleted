import { TournamentFormat as F, SchedulingMode } from '@prisma/client';
import { TournamentScheduleService } from './tournament-schedule.service';
import { TournamentMatchesService } from './tournament-matches.service';
import { TournamentCoreService } from './tournament-core.service';
import { presignTournamentMedia } from '../utils/tournament-media.util';

jest.mock('../../utils/s3.util', () => ({
  getPreSignedUrl: jest.fn((v) => v),
}));
const config = {
  tournamentId: 't',
  name: 'Test',
  version: 1,
  isDeleted: false,
  tournamentFormat: F.SINGLE_ELIMINATION,
  numberOfTeams: 4,
  schedulingMode: SchedulingMode.MANUAL,
  startDate: '2026-11-16',
  dailyStart: '09:00',
  dailyEnd: '17:00',
  matchDuration: 20,
  turnoverDuration: 5,
  frequencyArray: ['1'],
  venues: [
    {
      venueId: 'v',
      name: 'Venue',
      screens: [{ screenId: 's', screenName: 'Screen' }],
    },
  ],
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
async function fixture() {
  const schedule = await new TournamentScheduleService().generateSchedule({
    ...config,
    tournamentFormat: F.SINGLE_ELIMINATION,
    numberOfTeams: 4,
    participants: [1, 2, 3, 4].map((i) => ({
      playerId: `p${i}`,
      name: `P${i}`,
    })),
  });
  let persisted: any = { ...config, schedule };
  const db: any = {
    tournament: {
      findUnique: jest.fn(async () => clone(persisted)),
      findMany: jest.fn(async () => [clone(persisted)]),
      updateMany: jest.fn(async ({ where, data }) => {
        if (where.version !== persisted.version) return { count: 0 };
        persisted = {
          ...persisted,
          ...data,
          schedule: clone(data.schedule),
          version: persisted.version + 1,
        };
        return { count: 1 };
      }),
    },
    tournamentRegistration: {
      findMany: jest.fn(async ({ where }) =>
        where.playerId.in.map((playerId: string) => ({
          playerId,
          status: 'CONFIRMED',
        })),
      ),
    },
    fanPrediction: { findMany: jest.fn(async () => []) },
  };
  return {
    service: new TournamentMatchesService(db, new TournamentScheduleService()),
    db,
    state: () => persisted,
  };
}

describe('Backend handoff commands and frontend projections', () => {
  it('updates canonical result and progression together while preserving references', async () => {
    const { service, state } = await fixture();
    const refs = clone(
      state().schedule.structure.matches.map((m: any) => [
        m.participant1Ref,
        m.participant2Ref,
      ]),
    );
    const match = state().schedule.structure.matches[0];
    await service.updateMatchScore('t', match.id, { score1: 2, score2: 0 });
    expect(state().version).toBe(2);
    expect(
      state().schedule.structure.matches.map((m: any) => [
        m.participant1Ref,
        m.participant2Ref,
      ]),
    ).toEqual(refs);
    const final = state().schedule.structure.matches.find(
      (m: any) => m.round === 'Final',
    );
    expect([final.player1Id, final.player2Id]).toContain(match.player1Id);
    expect(state().schedule.structure.matches[0].version).toBe(2);
  });
  it('corrects structure.matches with persisted audit, acknowledgement and revision', async () => {
    const { service, state } = await fixture();
    const id = state().schedule.structure.matches[0].id;
    await service.updateMatchScore('t', id, { score1: 2, score2: 0 });
    const result = await service.correctMatchScore(
      id,
      {
        score1: 0,
        score2: 3,
        acknowledgement: true,
        expectedVersion: 2,
        reason: 'Verified score sheet',
      },
      'admin',
    );
    expect(result.match.score2).toBe(3);
    expect(state().schedule.resultCorrections[0]).toMatchObject({
      id: result.auditEventId,
      actorId: 'admin',
      previousScore1: 2,
      previousScore2: 0,
    });
    await expect(
      service.correctMatchScore(id, {
        score1: 1,
        score2: 0,
        acknowledgement: true,
        expectedVersion: 2,
        reason: 'Stale request',
      }),
    ).rejects.toThrow('SCORE_REVISION_CONFLICT');
  });
  it('does not persist result if reserve extension fails', async () => {
    const { service, state, db } = await fixture();
    state().schedule.calendar = [];
    state().venues = [];
    const before = clone(state());
    await expect(
      service.updateMatchScore('t', state().schedule.structure.matches[0].id, {
        score1: 1,
        score2: 0,
      }),
    ).rejects.toThrow('capacity');
    expect(state()).toEqual(before);
    expect(db.tournament.updateMany).not.toHaveBeenCalled();
  });
  it('offers only dependency-safe admin slots and moves allocations atomically', async () => {
    const { service, state } = await fixture();
    const matches = state().schedule.structure.matches;
    const final = matches.find((m: any) => m.round === 'Final');
    expect(
      (await service.getManualAvailableSlots('t', final.id)).slots,
    ).toEqual([]);
    for (let i = 0; i < 2; i++) {
      await service.allocateTournamentMatch('t', matches[i].id, {
        venueId: 'v',
        screenId: 's',
        date: '2026-11-16',
        time: i === 0 ? '09:00' : '09:25',
      });
    }
    const available = await service.getManualAvailableSlots('t', final.id);
    expect(available.slots[0].time).toBe('09:50');
    await service.allocateTournamentMatch('t', final.id, {
      venueId: 'v',
      screenId: 's',
      date: '2026-11-16',
      time: '09:50',
    });
    await expect(
      service.unallocateTournamentMatch('t', matches[0].id),
    ).rejects.toThrow('DEPENDENT_MATCH_ALLOCATED');
    await expect(
      service.allocateTournamentMatch(
        't',
        final.id,
        {
          venueId: 'v',
          screenId: 's',
          date: '2026-11-16',
          time: '10:15',
          expectedScheduleVersion: 1,
        },
        true,
      ),
    ).rejects.toThrow('VERSION_CONFLICT');
    const before = clone(state());
    await expect(
      service.allocateTournamentMatch(
        't',
        matches[0].id,
        { venueId: 'v', screenId: 's', date: '2026-11-16', time: '10:15' },
        true,
      ),
    ).rejects.toThrow('ROUND_DEPENDENCY_CONFLICT');
    expect(state()).toEqual(before);
    await service.allocateTournamentMatch(
      't',
      final.id,
      {
        venueId: 'v',
        screenId: 's',
        date: '2026-11-16',
        time: '10:15',
        expectedScheduleVersion: state().version,
      },
      true,
    );
    expect(
      state().schedule.structure.matches.find((m: any) => m.id === final.id)
        .time,
    ).toBe('10:15');
    const slots = state().schedule.calendar[0].screens[0].days[0].timeslots;
    expect(slots.find((slot: any) => slot.time === '09:50').game).toBeNull();
    expect(
      slots.filter((slot: any) => slot.canonicalMatchId === final.id),
    ).toHaveLength(1);
  });
  it('rejects a lost allocation race using an atomic version condition', async () => {
    const { service, state, db } = await fixture();
    db.tournament.updateMany.mockResolvedValue({ count: 0 });
    const id = state().schedule.structure.matches[0].id;
    await expect(
      service.allocateTournamentMatch('t', id, {
        venueId: 'v',
        screenId: 's',
        date: '2026-11-16',
        time: '09:00',
      }),
    ).rejects.toThrow('changed');
    expect(db.tournament.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournamentId: 't', version: 1 } }),
    );
  });
  it('returns accurate frontend counts/settings without overwriting registration capacity', async () => {
    const schedule = await new TournamentScheduleService().generateSchedule({
      ...config,
      tournamentFormat: F.LEAGUE_AND_KNOCKOUT,
      numberOfTeams: 40,
      groupsCount: 10,
      topQualifiers: 2,
    });
    const result: any = await presignTournamentMedia(
      { ...config, capacity: 64, schedule } as any,
      { include: 'all' },
    );
    expect(result).toMatchObject({
      capacity: 64,
      maxCapacity: 64,
      groupsCount: 10,
      topQualifiers: 2,
      guaranteedMatches: 79,
      conditionalMatches: 0,
      maximumPossibleMatches: 79,
    });
    expect(result.matches).toHaveLength(79);
    expect(result.qualificationResolution.status).toBe('PENDING');
    expect(result.scheduleSettings.thirdPlacePlayoffEnabled).toBe(false);
    expect(Array.isArray(result.schedule)).toBe(true);
    expect(result.frequencySettings.playingDays).toEqual([1]);
  });
  it('wraps creation and nested resource writes in a transaction', async () => {
    const db: any = {
      $transaction: jest.fn(async (fn) =>
        fn({
          sponsor: {
            create: jest.fn(async () => {
              throw new Error('transaction abort');
            }),
          },
        }),
      ),
    };
    const service = new TournamentCoreService(
      db,
      new TournamentScheduleService(),
    );
    await expect(
      service.createTournament({
        name: 'Test',
        startDate: '2026-11-16',
        sponsors: [{ name: 'Sponsor' }],
      } as any),
    ).rejects.toThrow('transaction abort');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it('keeps occupied settings intact across both nested frontend aliases and transaction rollback', async () => {
    const { service, state, db } = await fixture();
    await service.allocateTournamentMatch(
      't',
      state().schedule.structure.matches[0].id,
      { venueId: 'v', screenId: 's', date: '2026-11-16', time: '09:00' },
    );
    db.$transaction = jest.fn(async (fn) => fn(db));
    db.venue = { findMany: jest.fn(async () => config.venues) };
    db.tournament.update = jest.fn();
    const core = new TournamentCoreService(db, new TournamentScheduleService());
    await expect(
      core.updateTournament('t', {
        frequencySettings: { playingDays: [2], frequency: 'Daily' },
      }),
    ).rejects.toThrow('DATE_NOT_PERMITTED');
    expect(db.tournament.update).not.toHaveBeenCalled();
    await expect(
      core.updateTournament('t', { scheduleSettings: { slotDuration: 30 } }),
    ).rejects.toThrow('SLOT_WINDOW_CHANGED');
    expect(db.tournament.update).not.toHaveBeenCalled();
  });
  it('accepts the frontend nested creation shape without relying on absent flat DTO transforms', async () => {
    const db: any = { $transaction: jest.fn(async (fn) => fn({})) };
    const core = new TournamentCoreService(db, new TournamentScheduleService());
    const create = jest
      .spyOn(core as any, 'createTournamentInTransaction')
      .mockImplementation(async (dto) => dto);
    await core.createTournament({
      name: 'Nested',
      format: 'League & Knockout',
      teams: 40,
      maxCapacity: 64,
      topQualifiers: 2,
      groupsCount: 10,
      scheduleSettings: {
        startDate: '2026-11-16',
        eventStartTime: '09:00',
        eventEndTime: '17:00',
        slotDuration: 20,
        thirdPlacePlayoffEnabled: false,
        grandFinalResetEnabled: false,
      },
      frequencySettings: { frequency: 'Daily', playingDays: [1], buffer: 2 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        numberOfTeams: 40,
        capacity: 64,
        topQualifiers: 2,
        groupsCount: 10,
        startDate: '2026-11-16',
        dailyStart: '09:00',
        matchDuration: 20,
        frequencyArray: ['1'],
        buffer: 2,
        tournamentFormat: F.LEAGUE_AND_KNOCKOUT,
      }),
      expect.anything(),
    );
  });
  it('uses the registered home venue rather than inventing a home from slot order', async () => {
    const { service, state } = await fixture();
    const second = clone(state().schedule.calendar[0]);
    second.venueId = 'v2';
    second.venueName = 'Second';
    second.screens[0].screenId = 's2';
    state().schedule.calendar.push(second);
    state().venues.push({
      venueId: 'v2',
      name: 'Second',
      screens: [{ screenId: 's2', screenName: 'Second screen' }],
    });
    state().registrations = [{ playerId: 'p1', homeVenueId: 'v2' }];
    await service.autoAllocateTournamentMatches('t', {
      mode: SchedulingMode.AUTO_HOME_VENUE,
    });
    expect(
      state().schedule.structure.matches.find((m: any) => m.player1Id === 'p1')
        .venueId,
    ).toBe('v2');
  });
  it('reports historical structural flags from existing nodes without regenerating matches', async () => {
    const schedule = await new TournamentScheduleService().generateSchedule({
      ...config,
      tournamentFormat: F.SINGLE_ELIMINATION,
      numberOfTeams: 4,
      thirdPlacePlayoffEnabled: true,
    });
    delete (schedule.structure as any).thirdPlacePlayoffEnabled;
    const before = JSON.stringify(schedule);
    const result: any = await presignTournamentMedia({
      ...config,
      schedule,
    } as any);
    expect(result.scheduleSettings.thirdPlacePlayoffEnabled).toBe(true);
    expect(result.guaranteedMatches).toBe(4);
    expect(JSON.stringify(schedule)).toBe(before);
  });
});

describe('saving automatic scheduling mode', () => {
  async function editableFixture() {
    const result = await fixture();
    const { db, state } = result;
    Object.assign(state(), {
      capacity: 40,
      entryFee: 1500,
      currency: 'NGN',
      registrationOpen: false,
    });
    db.venue = { findMany: jest.fn(async () => config.venues) };
    db.$queryRaw = jest.fn(async () => []);
    db.ticket = { count: jest.fn(async () => 0) };
    db.ticketTier = {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    };
    db.tournament.update = jest.fn(async ({ where, data }) => {
      if (where.version !== state().version) throw new Error('stale version');
      const version = state().version + 1;
      Object.assign(state(), data, { version });
      return clone(state());
    });
    db.$transaction = jest.fn(async (fn) => {
      const before = clone(state());
      try {
        return await fn(db);
      } catch (e) {
        Object.keys(state()).forEach((key) => delete state()[key]);
        Object.assign(state(), before);
        throw e;
      }
    });
    return {
      ...result,
      core: new TournamentCoreService(db, new TournamentScheduleService()),
    };
  }

  it('allocates existing manual fixtures when AUTO_RANDOM is saved', async () => {
    const { core, state } = await editableFixture();
    const ids = state().schedule.structure.matches.map((m) => m.id);
    const result: any = await core.updateTournament('t', {
      schedulingMode: SchedulingMode.AUTO_RANDOM,
    });
    expect(result.schedulingMode).toBe(SchedulingMode.AUTO_RANDOM);
    expect(state().schedule.structure.matches.map((m) => m.id)).toEqual(ids);
    expect(
      state().schedule.structure.matches.every(
        (m) => m.date && m.time && m.screenId,
      ),
    ).toBe(true);
    expect(state().schedule.structure.matches[0].time).toBe('09:00');
  });

  it('fills an empty grid even when AUTO_RANDOM was already stored', async () => {
    const { core, state } = await editableFixture();
    state().schedulingMode = SchedulingMode.AUTO_RANDOM;
    await core.updateTournament('t', {
      schedulingMode: SchedulingMode.AUTO_RANDOM,
    });
    expect(state().schedule.structure.matches.every((m) => m.date)).toBe(true);
    const allocated = clone(state().schedule);
    await core.updateTournament('t', {
      schedulingMode: SchedulingMode.AUTO_RANDOM,
    });
    expect(state().schedule).toEqual(allocated);
  });

  it('keeps manual saves unallocated', async () => {
    const { core, state } = await editableFixture();
    await core.updateTournament('t', { schedulingMode: SchedulingMode.MANUAL });
    expect(state().schedule.structure.matches.every((m) => !m.date)).toBe(true);
  });

  it('does not enable automatic mode when the schedule is missing', async () => {
    const { core, state, db } = await editableFixture();
    state().schedule = null;
    await expect(
      core.updateTournament('t', {
        schedulingMode: SchedulingMode.AUTO_RANDOM,
      }),
    ).rejects.toThrow('Generate a tournament schedule');
    expect(db.tournament.update).not.toHaveBeenCalled();
  });

  it('rolls back mode and allocation together if a later write fails', async () => {
    const { core, state, db } = await editableFixture();
    const before = clone(state());
    db.ticketTier.findMany.mockRejectedValueOnce(
      new Error('inventory read failed'),
    );
    await expect(
      core.updateTournament('t', {
        schedulingMode: SchedulingMode.AUTO_RANDOM,
      }),
    ).rejects.toThrow('inventory read failed');
    expect(state()).toEqual(before);
  });
});
