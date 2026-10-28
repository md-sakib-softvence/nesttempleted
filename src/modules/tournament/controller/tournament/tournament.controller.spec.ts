import { Test, TestingModule } from '@nestjs/testing';
import { TournamentController } from './tournament.controller';
import { TournamentService } from '../../service/tournament.service';
import { TournamentStatus } from '@prisma/client';
import { SelectionMode } from '../../dto/tournament/registration-selection.dto';

describe('TournamentController (Success Message & Spec API Verification)', () => {
  let controller: TournamentController;
  let service: any;

  beforeEach(async () => {
    service = {
      createTournament: jest.fn().mockResolvedValue({ tournamentId: 't1' }),
      getAllTournaments: jest.fn().mockResolvedValue({
        data: [{ tournamentId: 't1' }],
        meta: { total: 1, page: 1, limit: 10 },
      }),
      getTournamentById: jest.fn().mockResolvedValue({ tournamentId: 't1' }),
      updateTournament: jest.fn().mockResolvedValue({ tournamentId: 't1', version: 2 }),
      deleteTournament: jest.fn().mockResolvedValue({ tournamentId: 't1', isDeleted: true }),
      updateTournamentStatus: jest.fn().mockResolvedValue({ tournamentId: 't1', status: 'PAUSED', version: 6 }),
      addTournamentVenue: jest.fn().mockResolvedValue({ venue: { id: 'v1' } }),
      deleteTournamentVenue: jest.fn().mockResolvedValue({ deletedVenueId: 'v1' }),
      getTournamentRegistrationsWithCounts: jest.fn().mockResolvedValue({
        items: [],
        counts: { registered: 10, selectedUnpaid: 5, confirmed: 8, waitlisted: 2 },
        pagination: { totalItems: 25, page: 1, limit: 25, totalPages: 1 },
      }),
      selectRegistrations: jest.fn().mockResolvedValue({ selectedCount: 3 }),
      processPaymentExpiry: jest.fn().mockResolvedValue({ expiredCount: 2 }),
      reconcileScheduleCapacity: jest.fn().mockResolvedValue({ success: true, slotsAdded: 10 }),
      getTournamentLeaderboard: jest.fn().mockResolvedValue({ standings: [] }),
      getTournamentFinancials: jest.fn().mockResolvedValue({ grossRevenue: 100000 }),
      updateTournamentFinancials: jest.fn().mockResolvedValue({ grossRevenue: 100000 }),
      getRaffles: jest.fn().mockResolvedValue([]),
      createRaffle: jest.fn().mockResolvedValue({ raffleId: 'raf-1' }),
      drawRaffle: jest.fn().mockResolvedValue({ raffleId: 'raf-1', winners: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TournamentController],
      providers: [{ provide: TournamentService, useValue: service }],
    }).compile();

    controller = module.get<TournamentController>(TournamentController);
  });

  it('findOne should return tournament with include query parameter forwarded to service', async () => {
    const res = await controller.findOne('t1', 'slots,seeds');
    expect(res.success).toBe(true);
    expect(res.message).toBe('Tournament retrieved successfully');
    expect(service.getTournamentById).toHaveBeenCalledWith('t1', 'slots,seeds');
  });

  it('updateStatus should return status updated successfully with proper message', async () => {
    const res = await controller.updateStatus('t1', {
      status: TournamentStatus.PAUSED,
      expectedVersion: 5,
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Tournament status updated to PAUSED successfully');
    expect(res.data!.status).toBe('PAUSED');
  });

  it('addVenue should return venue added successfully', async () => {
    const res = await controller.addVenue('t1', {
      name: 'Ikeja Lounge',
      address: '12 Allen Ave',
    } as any);
    expect(res.success).toBe(true);
    expect(res.message).toBe('Venue added to tournament successfully');
  });

  it('deleteVenue should return venue deleted successfully', async () => {
    const res = await controller.deleteVenue('t1', 'v1');
    expect(res.success).toBe(true);
    expect(res.message).toBe('Venue deleted from tournament successfully');
  });

  it('getRegistrations should return counts and pagination with proper message', async () => {
    const res = await controller.getRegistrations('t1', { tab: 'registered' });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Tournament registrations retrieved successfully');
    expect(res.data!.counts).toBeDefined();
    expect(res.data!.counts.registered).toBe(10);
  });

  it('selectRegistrations should return proper success message', async () => {
    const res = await controller.selectRegistrations('t1', {
      mode: SelectionMode.MANUAL,
      registrationIds: ['r1', 'r2'],
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Registrations selected and payment window granted successfully',
    );
  });

  it('processPaymentExpiry should return proper success message', async () => {
    const res = await controller.processPaymentExpiry('t1');
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Expired unpaid registrations processed successfully',
    );
  });

  it('reconcileCapacity should return proper success message', async () => {
    const res = await controller.reconcileCapacity('t1', { expectedVersion: 7 });
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Tournament schedule capacity reconciled successfully',
    );
  });

  it('getFinancials should return proper success message', async () => {
    const res = await controller.getFinancials('t1');
    expect(res.success).toBe(true);
    expect(res.message).toBe('Tournament financials retrieved successfully');
  });
});
