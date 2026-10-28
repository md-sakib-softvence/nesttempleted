import { Test, TestingModule } from '@nestjs/testing';
import { SeriesService } from './series.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  SeriesStatus,
  SeriesParticipantType,
  SeriesParticipationMode,
  SeriesScoringMethod,
} from '@prisma/client';

describe('SeriesService (Unit & Domain Logic Tests)', () => {
  let service: SeriesService;
  let prisma: any;

  const mockSeries = {
    id: 'series-tnc-s1',
    name: 'TAPE National Circuit 2026',
    code: 'TNC26',
    description: 'Premier circuit',
    logoUrl: 'https://assets.tape-esports.com/logo.png',
    imageUrl: 'https://assets.tape-esports.com/cover.png',
    status: SeriesStatus.DRAFT,
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-12-20'),
    participantType: SeriesParticipantType.PLAYER,
    participationMode: SeriesParticipationMode.OPEN_SERIES,
    minimumEventsRequired: 2,
    scoringMethod: SeriesScoringMethod.BEST_N_RESULTS,
    bestNResults: 2,
    scoringConfig: {
      placementPoints: { '1': 100, '2': 80, '3': 60 },
      participationPoints: 5,
      matchWinPoints: 3,
      bonusRules: { championBonus: 25 },
    },
    published: false,
    version: 1,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    tournaments: [],
    participants: [],
    _count: { tournaments: 0, participants: 0 },
  };

  beforeEach(async () => {
    prisma = {
      series: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      seriesTournament: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      seriesParticipant: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      seriesPointAdjustment: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      seriesPublication: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      tournament: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      tournamentRegistration: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return Promise.all(cb);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SeriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SeriesService>(SeriesService);
  });

  describe('createSeries', () => {
    it('should create a new series with version 1 and DRAFT status', async () => {
      prisma.series.findUnique.mockResolvedValue(null);
      prisma.series.create.mockResolvedValue(mockSeries);

      const result = await service.createSeries({
        name: 'TAPE National Circuit 2026',
        code: 'TNC26',
        startDate: '2026-11-01',
        scoringConfig: {
          placementPoints: { '1': 100, '2': 80 },
        },
      });

      expect(result.id).toBe('series-tnc-s1');
      expect(result.status).toBe(SeriesStatus.DRAFT);
      expect(prisma.series.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if series code already exists', async () => {
      prisma.series.findUnique.mockResolvedValue(mockSeries);

      await expect(
        service.createSeries({
          name: 'Another Series',
          code: 'TNC26',
          startDate: '2026-11-01',
          scoringConfig: {},
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateSeries & Optimistic Concurrency', () => {
    it('should update series successfully when version matches', async () => {
      prisma.series.findUnique.mockResolvedValue(mockSeries);
      prisma.series.update.mockResolvedValue({
        ...mockSeries,
        name: 'TAPE National Circuit 2026 (Updated)',
        version: 2,
      });

      const result = await service.updateSeries('series-tnc-s1', {
        expectedVersion: 1,
        name: 'TAPE National Circuit 2026 (Updated)',
      });

      expect(result.version).toBe(2);
      expect(result.name).toBe('TAPE National Circuit 2026 (Updated)');
    });

    it('should throw ConflictException when expectedVersion does not match current version', async () => {
      prisma.series.findUnique.mockResolvedValue({ ...mockSeries, version: 3 });

      await expect(
        service.updateSeries('series-tnc-s1', {
          expectedVersion: 1,
          name: 'Stale update',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateSeriesStatus & Lifecycle Validation', () => {
    it('should allow valid transition from DRAFT to ACTIVE', async () => {
      prisma.series.findUnique.mockResolvedValue(mockSeries);
      prisma.series.update.mockResolvedValue({
        ...mockSeries,
        status: SeriesStatus.ACTIVE,
        version: 2,
      });

      const result = await service.updateSeriesStatus('series-tnc-s1', {
        status: SeriesStatus.ACTIVE,
      });

      expect(result.status).toBe(SeriesStatus.ACTIVE);
      expect(result.version).toBe(2);
    });

    it('should throw BadRequestException on invalid status transition', async () => {
      prisma.series.findUnique.mockResolvedValue({
        ...mockSeries,
        status: SeriesStatus.ARCHIVED,
      });

      await expect(
        service.updateSeriesStatus('series-tnc-s1', {
          status: SeriesStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Points Engine & Recalculation', () => {
    it('should correctly recalculate standings with BEST_N_RESULTS, bonuses, and tiebreakers', async () => {
      const seriesWithTournaments = {
        ...mockSeries,
        scoringMethod: 'BEST_N_RESULTS',
        bestNResults: 2,
        minimumEventsRequired: 1,
        tournaments: [
          {
            seriesId: 'series-tnc-s1',
            tournamentId: 'tourn-1',
            weightMultiplier: 1.0,
            tournament: {
              tournamentId: 'tourn-1',
              status: 'COMPLETED',
              schedule: {
                matches: [
                  {
                    id: 'm1',
                    round: 'Final',
                    score1: 3,
                    score2: 1,
                    status: 'COMPLETED',
                    participant1Ref: {
                      value: 'player-1',
                      displayName: 'Player 1',
                    },
                    participant2Ref: {
                      value: 'player-2',
                      displayName: 'Player 2',
                    },
                    winnerRef: { value: 'player-1', displayName: 'Player 1' },
                    loserRef: { value: 'player-2', displayName: 'Player 2' },
                    nextMatchWinnerTargetId: null,
                  },
                ],
              },
            },
          },
        ],
      };

      prisma.series.findUnique.mockResolvedValue(seriesWithTournaments);
      prisma.tournamentRegistration.findMany.mockResolvedValue([
        { registrationId: 'r1', tournamentId: 'tourn-1', playerId: 'player-1' },
        { registrationId: 'r2', tournamentId: 'tourn-1', playerId: 'player-2' },
      ]);
      prisma.seriesParticipant.findMany.mockResolvedValue([
        {
          id: 'sp-1',
          seriesId: 'series-tnc-s1',
          playerId: 'player-1',
          currentRank: 2,
          adjustments: [{ points: 10 }],
        },
        {
          id: 'sp-2',
          seriesId: 'series-tnc-s1',
          playerId: 'player-2',
          currentRank: 1,
          adjustments: [],
        },
      ]);
      prisma.seriesParticipant.update.mockResolvedValue({});
      prisma.series.update.mockResolvedValue(mockSeries);

      const result = await service.recalculateSeriesStandings(
        'series-tnc-s1',
        true,
      );

      expect(result.seriesId).toBe('series-tnc-s1');
      expect(result.participantsProcessed).toBe(2);
      expect(prisma.seriesParticipant.update).toHaveBeenCalled();
    });
  });

  describe('Point Adjustments', () => {
    it('should create a manual point adjustment and update participant total', async () => {
      prisma.series.findUnique.mockResolvedValue(mockSeries);
      prisma.seriesParticipant.findFirst.mockResolvedValue({
        id: 'sp-1',
        seriesId: 'series-tnc-s1',
        totalPoints: 100,
      });
      prisma.seriesPointAdjustment.create.mockResolvedValue({
        id: 'adj-01',
        points: -10,
        reason: 'Late arrival penalty',
        createdAt: new Date(),
      });
      prisma.seriesParticipant.update.mockResolvedValue({
        id: 'sp-1',
        totalPoints: 90,
      });

      const result = await service.createPointAdjustment('series-tnc-s1', {
        participantId: 'sp-1',
        points: -10,
        reason: 'Late arrival penalty',
      });

      expect(result.adjustmentId).toBe('adj-01');
      expect(result.points).toBe(-10);
      expect(result.newTotalPoints).toBe(90);
    });
  });

  describe('CreateSeriesDto payload transformation & validation', () => {
    it('should properly transform UI fields (dates, participantType, tournaments)', async () => {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');
      const { CreateSeriesDto } = await import('../dto/create-series.dto');

      const rawPayload = {
        name: ' TAPE Lagos Championship Series 2027 ',
        code: 'tlcs2027',
        participantType: 'Individual Players',
        startDate: '10/21/2026',
        endDate: '',
        description: 'Describe the series format...',
        tournamentIds: ['tourn-1', 'tourn-2'],
      };

      const dto = plainToInstance(CreateSeriesDto, rawPayload);
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.name).toBe('TAPE Lagos Championship Series 2027');
      expect(dto.code).toBe('TLCS2027');
      expect(dto.participantType).toBe(SeriesParticipantType.PLAYER);
      expect(dto.startDate).toBe('2026-10-21');
      expect(dto.endDate).toBeUndefined();
      expect(dto.description).toBe('Describe the series format...');
      expect(dto.tournamentIds).toEqual(['tourn-1', 'tourn-2']);
    });

    it('should support createSeries when tournaments alias is provided', async () => {
      prisma.series.findUnique.mockResolvedValue(null);
      prisma.series.create.mockResolvedValue(mockSeries);
      prisma.seriesTournament.createMany.mockResolvedValue({ count: 2 });

      await service.createSeries({
        name: 'TLCS 2027',
        code: 'TLCS27',
        startDate: '2026-10-21',
        tournaments: ['tourn-1', 'tourn-2'],
      });

      expect(prisma.seriesTournament.createMany).toHaveBeenCalledWith({
        data: [
          {
            seriesId: mockSeries.id,
            tournamentId: 'tourn-1',
            sequenceOrder: 1,
            weightMultiplier: 1,
          },
          {
            seriesId: mockSeries.id,
            tournamentId: 'tourn-2',
            sequenceOrder: 2,
            weightMultiplier: 1,
          },
        ],
        skipDuplicates: true,
      });
    });
  });
});
