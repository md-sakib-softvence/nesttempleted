import { BadRequestException } from '@nestjs/common';
import { syncTournamentTicket } from './tournament-ticket.util';
import { TournamentCoreService } from '../service/tournament-core.service';
import { TicketService } from '../../ticket/service/ticket.service';
import { TicketController } from '../../ticket/controller/ticket.controller';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTournamentDto } from '../dto/tournament/create-tournament.dto';

jest.mock('../../utils/s3.util', () => ({
  getPreSignedUrl: jest.fn((v) => v),
}));

const configuration = {
  tournamentId: 't',
  name: 'Championship',
  currency: 'NGN',
  capacity: 40,
  registrationOpen: true,
  entryFee: 1500,
};

function fixture() {
  let tier: any = null;
  let tournament: any = null;
  const db: any = {
    $queryRaw: jest.fn(async () => []),
    ticket: { count: jest.fn(async () => 0) },
    ticketTier: {
      findFirst: jest.fn(async () => tier),
      findMany: jest.fn(async () => (tier ? [tier] : [])),
      create: jest.fn(
        async ({ data }) => (tier = { tierId: 'tier', sold: 0, ...data }),
      ),
      update: jest.fn(async ({ data }) => (tier = { ...tier, ...data })),
    },
    tournament: {
      create: jest.fn(
        async ({ data }) =>
          (tournament = { tournamentId: 't', version: 1, venues: [], ...data }),
      ),
      findUnique: jest.fn(async () => tournament),
      update: jest.fn(async ({ data }) => {
        const { version, ...rest } = data;
        tournament = {
          ...tournament,
          ...rest,
          version: version ? tournament.version + 1 : tournament.version,
        };
        return tournament;
      }),
    },
  };
  db.$transaction = jest.fn(async (fn) => {
    const before = {
      tier: structuredClone(tier),
      tournament: structuredClone(tournament),
    };
    try {
      return await fn(db);
    } catch (e) {
      tier = before.tier;
      tournament = before.tournament;
      throw e;
    }
  });
  const scheduleService: any = { generateSchedule: jest.fn(async () => ({})) };
  return {
    db,
    core: new TournamentCoreService(db, scheduleService),
    tier: () => tier,
    tournament: () => tournament,
  };
}

describe('Tournament-owned ticket inventory', () => {
  it('creates one inventory with tournament name, price and exact capacity', async () => {
    const { db, tier } = fixture();
    await syncTournamentTicket(db, configuration);
    expect(tier()).toMatchObject({
      name: 'Championship',
      price: 1500,
      capacity: 40,
      tournamentManaged: true,
      status: 'ACTIVE',
    });
  });
  it('updates and reopens the same inventory without resetting sold', async () => {
    const { db, tier } = fixture();
    await syncTournamentTicket(db, configuration);
    tier().sold = 5;
    await syncTournamentTicket(db, {
      ...configuration,
      registrationOpen: false,
      name: 'Renamed',
      entryFee: 2000,
      capacity: 50,
    });
    expect(tier()).toMatchObject({
      name: 'Renamed',
      price: 2000,
      capacity: 50,
      sold: 5,
      status: 'HIDDEN',
    });
    await syncTournamentTicket(db, configuration);
    expect(tier()).toMatchObject({ sold: 5, status: 'ACTIVE' });
    expect(db.ticketTier.create).toHaveBeenCalledTimes(1);
  });
  it('does not create tickets while registration is closed', async () => {
    const { db, tier } = fixture();
    await syncTournamentTicket(db, {
      ...configuration,
      registrationOpen: false,
    });
    expect(tier()).toBeNull();
    await syncTournamentTicket(db, {
      ...configuration,
      registrationOpen: false,
      entryFee: null,
    });
    expect(db.ticketTier.create).not.toHaveBeenCalled();
  });
  it('supports zero entry fee without a separate ticket price', async () => {
    const { db, tier } = fixture();
    await syncTournamentTicket(db, { ...configuration, entryFee: 0 });
    expect(tier().price).toBe(0);
  });
  it.each([-1, NaN, Infinity])('rejects invalid price %s', async (price) => {
    const { db } = fixture();
    await expect(
      syncTournamentTicket(db, { ...configuration, entryFee: price }),
    ).rejects.toThrow(BadRequestException);
  });
  it('rejects capacity below already issued tickets', async () => {
    const { db } = fixture();
    db.ticket.count.mockResolvedValue(41);
    await expect(syncTournamentTicket(db, configuration)).rejects.toThrow(
      'Capacity cannot',
    );
    expect(db.ticketTier.create).not.toHaveBeenCalled();
  });
  it('creates and updates the inventory through tournament CRUD', async () => {
    const { core, tier } = fixture();
    const created: any = await core.createTournament({
      name: 'Championship',
      startDate: '2026-11-18',
      registrationOpen: true,
      entryFee: 1500,
      maxCapacity: 40,
    });
    expect(created.ticketTiers[0]).toMatchObject({ capacity: 40, price: 1500 });
    await core.updateTournament('t', {
      name: 'Renamed',
      entryFee: 2000,
      capacity: 50,
    });
    expect(tier()).toMatchObject({
      name: 'Renamed',
      price: 2000,
      capacity: 50,
    });
    await core.updateTournament('t', { registrationOpen: false });
    expect(tier().status).toBe('HIDDEN');
    await core.updateTournament('t', { registrationOpen: true });
    expect(tier().status).toBe('ACTIVE');
  });
  it('creates an open tournament using the default zero entry fee', async () => {
    const { core, tier } = fixture();
    await core.createTournament({
      name: 'Free',
      startDate: '2026-11-18',
      registrationOpen: true,
    });
    expect(tier().price).toBe(0);
  });
  it('ignores stale separate price when entryFee is supplied', async () => {
    const { core, tier } = fixture();
    await core.createTournament({
      name: 'Same price',
      startDate: '2026-11-18',
      registrationOpen: true,
      entryFee: 1500,
      ticketPrice: 9999,
    } as any);
    expect(tier().price).toBe(1500);
  });
  it('creates inventory when a closed tournament is later opened', async () => {
    const { core, tier } = fixture();
    await core.createTournament({
      name: 'Closed',
      startDate: '2026-11-18',
      registrationOpen: false,
      entryFee: 100,
      capacity: 20,
    });
    expect(tier()).toBeNull();
    await core.updateTournament('t', { registrationOpen: true });
    expect(tier()).toMatchObject({ name: 'Closed', price: 100, capacity: 20 });
  });
  it('rolls back a capacity update below sold tickets', async () => {
    const { core, db, tournament, tier } = fixture();
    await core.createTournament({
      name: 'Championship',
      startDate: '2026-11-18',
      registrationOpen: true,
      entryFee: 100,
      capacity: 40,
    });
    db.ticket.count.mockResolvedValue(30);
    await expect(core.updateTournament('t', { capacity: 20 })).rejects.toThrow(
      'Capacity cannot',
    );
    expect(tournament().capacity).toBe(40);
    expect(tier().capacity).toBe(40);
  });
  it('removes standalone ticket creation and update handlers', () => {
    expect(TicketController.prototype).not.toHaveProperty('createTier');
    expect(TicketController.prototype).not.toHaveProperty('updateTier');
  });
  it('validates entryFee from multipart input', async () => {
    const valid = plainToInstance(CreateTournamentDto, {
      name: 'Valid',
      entryFee: '1250',
    });
    expect(valid.entryFee).toBe(1250);
    const invalid = plainToInstance(CreateTournamentDto, {
      name: 'Invalid',
      entryFee: 'bad',
    });
    expect(
      (await validate(invalid)).some((e) => e.property === 'entryFee'),
    ).toBe(true);
  });
});

describe('Tournament ticket purchase capacity', () => {
  it.each(['sold-out', 'hidden'])(
    'blocks direct issuance for %s inventory',
    async (scenario) => {
      const tier = {
        tierId: 'tier',
        price: 1500,
        audienceRole: 'FAN',
        capacity: 40,
        sold: scenario === 'sold-out' ? 40 : 0,
        status: scenario === 'hidden' ? 'HIDDEN' : 'ACTIVE',
      };
      const tournament = { ...configuration, ticketTiers: [tier] };
      const db: any = {
        $queryRaw: jest.fn(async () => []),
        tournament: { findUnique: jest.fn(async () => tournament) },
        ticketTier: { findUnique: jest.fn(async () => tier) },
        ticket: {
          count: jest.fn(async () => (scenario === 'sold-out' ? 40 : 0)),
          findFirst: jest.fn(async () => null),
          create: jest.fn(),
        },
      };
      db.$transaction = jest.fn(async (fn) => fn(db));
      const service = new TicketService(db, {} as any, {} as any, {} as any);
      await expect(
        service.purchaseDirect({
          tournamentId: 't',
          tierId: 'tier',
          fanId: 'fan',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(db.ticket.create).not.toHaveBeenCalled();
    },
  );
});
