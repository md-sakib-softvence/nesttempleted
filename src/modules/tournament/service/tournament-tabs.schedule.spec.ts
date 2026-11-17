import { TournamentFormat } from '@prisma/client';
import { generateCanonicalStructure } from '../utils/tournament-calculation.util';
import { TournamentTabsService } from './tournament-tabs.service';

describe('schedule tab participant contract', () => {
  it('returns playable double elimination fixtures with correct pagination while preserving the stored bracket', async () => {
    const structure = generateCanonicalStructure(
      't',
      TournamentFormat.DOUBLE_ELIMINATION,
      45,
    );
    for (const m of structure.matches) {
      (m as any).player1 = { id: '1', name: '1' };
    }
    const schedule = { structure, calendar: [] };
    const before = JSON.stringify(schedule);
    const prisma = {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({
          tournamentId: 't',
          version: 7,
          schedule,
          venues: [],
        }),
      },
    };
    const service = new TournamentTabsService(
      prisma as any,
      null as any,
      null as any,
      null as any,
    );
    const result = await service.getScheduleTab('t', {
      page: 1,
      limit: 1000,
    } as any);
    expect(result.version).toBe(7);
    expect(result.totalMatches).toBe(88);
    expect(result.matches).toHaveLength(88);
    expect(result.canonicalMatches).toEqual(result.matches);
    expect(result.pagination.total).toBe(88);
    expect(result.counts.structuralNodes).toBe(structure.matches.length);
    expect(result.counts.autoAdvanceCount).toBe(structure.matches.length - 88);
    expect(result.matches.every((m) => !m.isAutoAdvance)).toBe(true);
    expect(result.matches[0].player1.id).toBeNull();
    expect(result.matches[0].player1.name).toMatch(/Slot #|Seed #|Winner of/);
    expect(JSON.stringify(schedule)).toBe(before);
    const page = await service.getScheduleTab('t', {
      page: 2,
      limit: 25,
    } as any);
    expect(page.matches).toHaveLength(25);
    expect(page.pagination.totalPages).toBe(4);
  });

  it('hides inactive reset matches but preserves an activated grand final reset', async () => {
    const structure = generateCanonicalStructure(
      't',
      TournamentFormat.DOUBLE_ELIMINATION,
      4,
      undefined,
      undefined,
      false,
      { hasGrandFinalReset: true },
    );
    const reset = structure.matches.find((m) => m.conditional)!;
    const prisma = {
      tournament: {
        findUnique: jest
          .fn()
          .mockImplementation(async () => ({
            tournamentId: 't',
            version: 1,
            schedule: { structure, calendar: [] },
            venues: [],
          })),
      },
    };
    const service = new TournamentTabsService(
      prisma as any,
      null as any,
      null as any,
      null as any,
    );
    expect((await service.getScheduleTab('t')).totalMatches).toBe(6);
    reset.isSchedulable = true;
    const active = await service.getScheduleTab('t');
    expect(active.totalMatches).toBe(7);
    expect(active.matches.find((m) => m.id === reset.id)?.isSchedulable).toBe(
      true,
    );
  });

  it('keeps unresolved slot IDs null and hydrates every calendar card before pagination', async () => {
    const matches = [1, 2].map((n) => ({
      id: `m${n}`,
      round: 'Group Stage',
      status: 'SCHEDULED',
      participant1Ref: { type: 'TOURNAMENT_SLOT', value: '1' },
      participant2Ref: { type: 'TOURNAMENT_SLOT', value: '2' },
      score1: null,
      score2: null,
    }));
    const schedule = {
      structure: {
        slots: [
          {
            slotNumber: 1,
            participantId: 'real-player',
            participantName: 'Alice',
          },
          { slotNumber: 2 },
        ],
        seeds: [],
        matches,
      },
      calendar: [
        {
          screens: [
            {
              days: [
                {
                  date: '2026-11-21',
                  timeslots: matches.map((m) => ({
                    canonicalMatchId: m.id,
                    game: { id: m.id, player1Id: 'TBD', player1Name: 'TBD' },
                  })),
                },
              ],
            },
          ],
        },
      ],
    };
    const prisma = {
      tournament: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ tournamentId: 't', schedule, venues: [] }),
      },
    };
    const service = new TournamentTabsService(
      prisma as any,
      null as any,
      null as any,
      null as any,
    );
    const result = await service.getScheduleTab('t', { limit: 1 } as any);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].player1).toMatchObject({
      id: 'real-player',
      name: 'Alice',
    });
    expect(result.matches[0].player2).toMatchObject({
      id: null,
      name: 'Slot #2',
    });
    const slots = result.calendar.raw[0].screens[0].days[0].timeslots;
    for (const slot of slots) {
      expect(slot.game).toMatchObject({
        player1Id: 'real-player',
        player1Name: 'Alice',
        player2Id: null,
        player2Name: 'Slot #2',
      });
    }
  });
});
