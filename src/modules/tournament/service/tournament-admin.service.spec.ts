import { Test, TestingModule } from '@nestjs/testing';
import { TournamentService } from './tournament.service';
import { TournamentScheduleService } from './tournament-schedule.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TournamentStatus, TournamentRegistrationStatus } from '@prisma/client';
import { SelectionMode } from '../dto/tournament/registration-selection.dto';

describe('TournamentService (Admin Invariants & Concurrency Tests)', () => {
  let service: TournamentService;
  let prisma: any;

  const mockTournament = {
    tournamentId: 'tourn-1',
    name: 'FC 25 Championship',
    status: TournamentStatus.DRAFT,
    version: 1,
    isDeleted: false,
    capacity: 16,
    entryFee: 5000,
    currency: 'NGN',
    houseRake: 15,
    manageEventCosts: [{ manageEventCostId: 'c1', costCategory: 'Venue', amount: 10000 }],
    manageEventPrizes: [{ manageEventPrizeId: 'p1', prizeCategory: '1st', amount: 50000 }],
    registrations: [{ registrationId: 'r1', status: 'CONFIRMED' }],
    venues: [{ venueId: 'v1', screens: [{ screenId: 's1' }] }],
    schedule: {
      matches: [
        {
          id: 'm1',
          round: 'Round of 16',
          status: 'COMPLETED',
          score1: 3,
          score2: 1,
          participant1Ref: { value: 'p101', displayName: 'Player 1' },
          participant2Ref: { value: 'p102', displayName: 'Player 2' },
          nextMatchWinnerTargetId: 'm-qf-1',
          physicalAllocation: { venueId: 'v1', screenId: 's1' },
          version: 1,
        },
        {
          id: 'm-qf-1',
          round: 'Quarterfinal',
          status: 'SCHEDULED',
          participant1Ref: { value: 'winner:m1', displayName: 'Winner of m1' },
          participant2Ref: { value: 'p103', displayName: 'Player 3' },
          version: 1,
        },
      ],
    },
  };

  beforeEach(async () => {
    prisma = {
      tournament: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      tournamentRegistration: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      venue: {
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      matchDispute: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const scheduleService = {
      generateSchedule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentService,
        { provide: PrismaService, useValue: prisma },
        { provide: TournamentScheduleService, useValue: scheduleService },
      ],
    }).compile();

    service = module.get<TournamentService>(TournamentService);
  });

  describe('updateTournamentStatus', () => {
    it('should update status and increment version', async () => {
      prisma.tournament.findUnique.mockResolvedValue(mockTournament);
      prisma.tournament.update.mockResolvedValue({
        ...mockTournament,
        status: TournamentStatus.REGISTRATION_OPEN,
        version: 2,
      });

      const res = await service.updateTournamentStatus('tourn-1', {
        status: TournamentStatus.REGISTRATION_OPEN,
        expectedVersion: 1,
      });

      expect(res.status).toBe(TournamentStatus.REGISTRATION_OPEN);
      expect(res.version).toBe(2);
    });

    it('should throw ConflictException on version mismatch', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ ...mockTournament, version: 3 });

      await expect(
        service.updateTournamentStatus('tourn-1', {
          status: TournamentStatus.REGISTRATION_OPEN,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteTournamentVenue conflict check', () => {
    it('should prevent deleting venue when matches are allocated to it', async () => {
      prisma.venue.findFirst.mockResolvedValue({
        venueId: 'v1',
        screens: [{ screenId: 's1' }],
      });
      prisma.tournament.findUnique.mockResolvedValue(mockTournament);

      await expect(
        service.deleteTournamentVenue('tourn-1', 'v1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Registration Selection & Payment Expiry', () => {
    it('should select registrations and set paymentDeadline', async () => {
      prisma.tournament.findUnique.mockResolvedValue(mockTournament);
      prisma.tournamentRegistration.updateMany.mockResolvedValue({ count: 2 });

      const res = await service.selectRegistrations('tourn-1', {
        mode: SelectionMode.MANUAL,
        registrationIds: ['r1', 'r2'],
        paymentWindowHours: 24,
      });

      expect(res.selectedCount).toBe(2);
      expect(res.paymentDeadline).toBeDefined();
    });

    it('should revert expired unpaid selections back to REGISTERED', async () => {
      prisma.tournament.findUnique.mockResolvedValue(mockTournament);
      prisma.tournamentRegistration.findMany.mockResolvedValue([
        { registrationId: 'r-exp-1' },
      ]);
      prisma.tournamentRegistration.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.processPaymentExpiry('tourn-1');
      expect(res.expiredCount).toBe(1);
    });
  });

  describe('Downstream match score correction guard', () => {
    it('should block score correction if downstream match has already completed without acknowledgement', async () => {
      const tournamentWithCompletedDownstream = {
        ...mockTournament,
        schedule: {
          matches: [
            {
              id: 'm1',
              nextMatchWinnerTargetId: 'm-qf-1',
              participant1Ref: { value: 'p1' },
              participant2Ref: { value: 'p2' },
              version: 1,
            },
            {
              id: 'm-qf-1',
              status: 'COMPLETED',
              version: 1,
            },
          ],
        },
      };

      prisma.tournament.findMany.mockResolvedValue([tournamentWithCompletedDownstream]);

      await expect(
        service.correctMatchScore('m1', {
          score1: 2,
          score2: 1,
          reason: 'Typo in score',
          acknowledgement: false,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Financials Calculation', () => {
    it('should compute gross revenue, house rake, net prize pool, and net profit/loss', async () => {
      prisma.tournament.findUnique.mockResolvedValue(mockTournament);

      const res = await service.getTournamentFinancials('tourn-1');

      expect(res.grossRevenue).toBe(5000);
      expect(res.houseRakePercent).toBe(15);
      expect(res.houseRakeAmount).toBe(750);
      expect(res.netPrizePool).toBe(4250);
      expect(res.totalCosts).toBe(10000);
      expect(res.totalPrizes).toBe(50000);
      expect(res.netProfitLoss).toBe(5000 - 10000 - 50000);
    });
  });
});
